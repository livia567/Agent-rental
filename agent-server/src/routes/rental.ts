import express, { Request, Response } from "express";
import { createStreamResponse } from "../utils/streamUtils";
import { RentalWorkflow } from "../workflow/rentalWorkflow";
import { extractTextFromImage } from "../agents/ocrExtractor";
import { registerWaitingConfirm, closeWaitingConfirm } from "../utils/pendingSession";
import type { AnalysisState } from "../types";
import { requireAuth } from "../middleware/auth";
import { createAnalysis, findOwnedAnalysis, updateAnalysis } from "../db/analysis";

//现在的逻辑是，不论用户点击接受、拒绝，都会先断开之前的连接清空之前的定时器，如果用户不操作，过五分钟断开连接清空定时器

const router = express.Router();
router.use(requireAuth);
const workflow = new RentalWorkflow();

// 内存存储：保存每个线程的分析状态（后续迁移到Redis/DB）
const threadStore = new Map<string, AnalysisState>();

/** 各 Agent 启动时展示给用户的文案 */
const AGENT_START_MESSAGES: Record<string, string> = {
  clause_splitter: "正在分析合同结构，拆解条款...",
  risk_analyzer: "正在逐条识别合同风险...",
  negotiation_advisor: "正在生成谈判话术...",
  final_reviewer: "正在综合评审，生成最终报告...",
};

/**
 * 构造贯穿整张图的流式回调。
 * agent 维度的事件由图节点自己触发（节点知道自己是谁），路由层只负责转成 SSE。
 * @param startMessage 覆盖默认启动文案（重新拆分时回显用户反馈）
 */
function callbacksFor(
  stream: ReturnType<typeof createStreamResponse>,
  startMessage?: (agent: string) => string
) {
  let current = "";
  return {
    onAgentStart: (agent: string) => {
      current = agent;
      stream.sendAgentEvent({
        type: "agent_start",
        agent,
        message: startMessage?.(agent) ?? AGENT_START_MESSAGES[agent] ?? "",
      });
    },
    onAgentDone: (agent: string, data: unknown) =>
      stream.sendAgentEvent({ type: "agent_done", agent, data }),
    onChunk: (content: string) =>
      stream.sendAgentEvent({ type: "agent_chunk", agent: current, content }),
    onThink: (thought: string) =>
      stream.sendAgentEvent({ type: "agent_think", agent: current, thought }),
    onValidationFail: (_schemaName: string, issues: string, attempt: number) =>
      stream.sendAgentEvent({
        type: "agent_retry",
        agent: current,
        message: `第${attempt}次输出未通过校验（${issues}），正在重试...`,
      }),
  };
}

function setState(threadId: string, state: AnalysisState): void {
  threadStore.set(threadId, state);
  if (state.status === "done" || state.status === "expired") {
    setTimeout(() => threadStore.delete(threadId), 5 * 60 * 1000);
  }
}

/** 先校验数据库中的用户归属，再读正在进行中的内存会话 */
function ownedState(threadId: string, userId: number) {
  return findOwnedAnalysis(threadId, userId) ? threadStore.get(threadId) : undefined;
}

/**
 * POST /api/rental/analyze
 * 启动合同分析工作流
 */
//req：前端发来的数据；res：返回给前端的数据；
router.post("/analyze", async (req: Request, res: Response) => {
  const { contractText, imageBase64: rawImages } = req.body;
  // 兼容单张和多张图片（前端现在传 string[]）
  const images: string[] = Array.isArray(rawImages) ? rawImages : rawImages ? [rawImages] : [];

  // 基础校验：至少要有文本或图片
  if ((!contractText || !contractText.trim()) && images.length === 0) {
    return res.status(400).json({
      success: false,
      error: "请输入合同文本或上传合同照片",
    });
  }

  const stream = createStreamResponse(res);
  let inputText = (contractText || "").trim();

  // ========== 📸 Step 0: OCR 图片提取 ==========
  if (images.length > 0) {
    stream.sendAgentEvent({
      type: "agent_start",
      agent: "ocr_extractor",
      message: `正在识别${images.length}张图片中的文字...`,
    });

    let allText = "";
    for (let i = 0; i < images.length; i++) {
      const ocrResult = await extractTextFromImage(images[i]);
      if (!ocrResult.success) {
        stream.error(ocrResult.error || `第${i + 1}张图片识别失败`);
        return;
      }
      allText += (allText ? "\n" : "") + ocrResult.text;
    }

    inputText = allText + "\n" + inputText;

    stream.sendAgentEvent({
      type: "agent_done",
      agent: "ocr_extractor",
      message: `${images.length}张图片识别完成`,
      data: { ocrText: allText },
    });
  }

  // 基础长度校验：至少50字
  if (inputText.length < 50) {
    stream.sendAgentEvent({
      type: "input_rejected",
      message: images.length > 0
        ? "图片中文字内容较少，请确保拍摄了完整的合同页面"
        : "字数小于50字，请输入正确格式的合同",
    });
    stream.end();
    return;
  }

  // ========== 🚦 意图识别（Agent 0） ==========
  try {
    const classification = await workflow.classifyInput(inputText);

    if (classification.category === "invalid") {
      stream.sendAgentEvent({
        type: "input_rejected",
        message: "请上传正确的合同",
        data: { category: "invalid", reason: classification.reason },
      });
      stream.end();
      return;
    }
    // contract → 继续
  } catch {
    // 意图识别失败，降级：长文本→直接分析，短文本→友好提示
    if (inputText.length <= 200) {
      stream.error("无法理解你的输入，请粘贴完整的租房合同文本");
      return;
    }
  }

  const threadId = `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // 初始化状态
  const state: AnalysisState = {
    contractText: inputText.trim(),
    clauses: [],
    riskAnnotatedClauses: [],
    negotiationTips: [],
    finalReport: null,
    status: "running",
    currentStep: "clause_split",
    error: null,
  };
  setState(threadId, state);
  createAnalysis(threadId, req.user.userId, state.contractText);

  try {
    // ========== Step 1: 条款拆分（图一）==========
    state.clauses = await workflow.runClauseSplit(
      state.contractText,
      callbacksFor(stream)
    );

    // ========== 人工确认点1：条款分类 ==========
    state.currentStep = "risk_confirm";
    state.status = "waiting_confirm";
    setState(threadId, state);
    updateAnalysis(threadId, req.user.userId, "waiting_confirm");

    stream.sendAgentEvent({
      type: "confirm_needed",
      agent: "clause_splitter",
      threadId,
      question: `已识别出 ${state.clauses.length} 条条款，分类是否正确？确认后将继续风险评估。`,
      data: { clauses: state.clauses },
    });

    registerWaitingConfirm(threadId, res, (tid) => {
      const st = threadStore.get(tid);
      if (st) st.status = "expired";
      updateAnalysis(tid, req.user.userId, "expired");
    });

  } catch (err: any) {
    state.error = err.message;
    setState(threadId, state);
    updateAnalysis(threadId, req.user.userId, "error");
    stream.error(err.message);
  }
});

/**
 * POST /api/rental/confirm
 * 用户确认条款拆分，继续执行后续 Agent（风险分析 → 谈判建议 → 终审报告）
 */
router.post("/confirm", async (req: Request, res: Response) => {
  const { threadId } = req.body;

  if (!threadId) {
    return res.status(400).json({ success: false, error: "缺少threadId" });
  }

  const state = ownedState(threadId, req.user.userId);
  if (!state) {
    return res.status(404).json({ success: false, error: "会话不存在或无权访问" });
  }

  if (state.status !== "waiting_confirm") {
    return res.status(409).json({
      success: false,
      error:
        state.status === "expired"
          ? "会话已过期，请重新提交合同"
          : "当前状态不允许确认操作",
    });
  }

  state.status = "processing"; //状态锁，state.status !== "waiting_confirm"时，不允许确认操作
  setState(threadId, state);
  closeWaitingConfirm(threadId); //用户点击了确定，关闭定时器和旧连接

  const stream = createStreamResponse(res);

  try {
    // ========== Step 2~4（图二）：风险并行 → 条件路由 → 谈判话术/终审 ==========
    state.currentStep = "risk_analyze";

    const result = await workflow.runAnalysis(state.clauses, callbacksFor(stream));

    state.riskAnnotatedClauses = result.riskAnnotatedClauses;
    state.negotiationTips = result.negotiationTips;
    state.finalReport = result.finalReport;

    state.currentStep = "done";
    state.status = "done";
    setState(threadId, state);
    updateAnalysis(threadId, req.user.userId, "done", {
      clauses: state.clauses,
      riskAnnotatedClauses: state.riskAnnotatedClauses,
      negotiationTips: state.negotiationTips,
      finalReport: state.finalReport,
    });

    stream.sendAgentEvent({
      type: "workflow_done",
      data: {
        clauses: state.clauses,
        riskAnnotatedClauses: state.riskAnnotatedClauses,
        negotiationTips: state.negotiationTips,
        finalReport: state.finalReport,
      },
    });

    stream.end();
  } catch (err: any) {
    state.error = err.message;
    setState(threadId, state);
    updateAnalysis(threadId, req.user.userId, "error");
    stream.error(err.message);
  }
});

/**
 * POST /api/rental/reject
 * 用户拒绝条款拆分，带着反馈重新执行条款拆分
 */
router.post("/reject", async (req: Request, res: Response) => {
  const { threadId, feedback } = req.body;

  if (!threadId) {
    return res.status(400).json({ success: false, error: "缺少threadId" });
  }

  const state = ownedState(threadId, req.user.userId);
  if (!state) {
    return res.status(404).json({ success: false, error: "会话不存在或无权访问" });
  }

  if (state.status !== "waiting_confirm") {
    return res.status(409).json({
      success: false,
      error: state.status === "expired" ? "会话已过期，请重新提交合同" : "当前状态不允许拒绝操作",
    });
  }

  //更新状态 + 清理旧连接
  state.status = "processing";
  setState(threadId, state);
  closeWaitingConfirm(threadId);

  const stream = createStreamResponse(res);

  try {

    state.clauses = await workflow.runClauseSplit(
      state.contractText,
      callbacksFor(stream, () =>
        feedback ? `正在根据反馈重新拆分：${feedback}` : "正在重新拆分条款..."
      ),
      feedback
    );

    state.currentStep = "risk_confirm";
    state.status = "waiting_confirm";
    setState(threadId, state);
    updateAnalysis(threadId, req.user.userId, "waiting_confirm");

    stream.sendAgentEvent({
      type: "confirm_needed",
      agent: "clause_splitter",
      threadId,
      question: `已重新识别出 ${state.clauses.length} 条条款，分类是否正确？`,
      data: { clauses: state.clauses },
    });

    registerWaitingConfirm(threadId, res, (tid) => {
      const st = threadStore.get(tid);
      if (st) st.status = "expired";
      updateAnalysis(tid, req.user.userId, "expired");
    });

  } catch (err: any) {
    state.error = err.message;
    setState(threadId, state);
    updateAnalysis(threadId, req.user.userId, "error");
    stream.error(err.message);
  }
});

/**
 * GET /api/rental/state/:threadId
 * 查询当前工作流状态（供前端刷新页面后恢复）
 */
router.get("/state/:threadId", (req: Request, res: Response) => {
  const threadId = req.params.threadId as string;
  const record = findOwnedAnalysis(threadId, req.user.userId);
  if (!record) return res.status(404).json({ success: false, error: "会话不存在或无权访问" });

  const state = threadStore.get(threadId);
  if (state) return res.json({ success: true, data: state });

  if (record.status === "done" && record.resultJson) {
    const result = JSON.parse(record.resultJson);
    return res.json({ success: true, data: {
      contractText: record.contractText,
      ...result,
      status: "done",
      currentStep: "done",
      error: null,
    } });
  }

  res.status(404).json({ success: false, error: "会话已结束，请重新提交合同" });
});

export default router;
