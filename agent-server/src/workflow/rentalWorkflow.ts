import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { Annotation, StateGraph, Send, Command, START, END } from "@langchain/langgraph";
import { z } from "zod";
import "dotenv/config";
import type { Clause, RiskAnnotatedClause, NegotiationTip, FinalReport, ClassificationResult } from "../types";
import { CLAUSE_SPLITTER_PROMPT } from "../agents/clauseSplitter";
import { RISK_ANALYZER_PROMPT, SingleRisk } from "../agents/riskAnalyzer";
import { NEGOTIATION_ADVISOR_PROMPT } from "../agents/negotiationAdvisor";
import { FINAL_REVIEWER_PROMPT } from "../agents/finalReviewer";
import { INTENT_CLASSIFIER_PROMPT } from "../agents/intentClassifier";
import {
  ClassificationSchema, ClauseListSchema, SingleRiskSchema,
  SingleNegotiationTipSchema, FinalReportSchema, formatIssues,
} from "../schemas";

/** SSE 流式回调 */
export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onThink?: (thought: string) => void;
  /** Schema 校验失败（用于向前端推送重试提示） */
  onValidationFail?: (schemaName: string, issues: string, attempt: number) => void;
  /** 节点开始/结束，用于向前端推送 agent_start / agent_done */
  onAgentStart?: (agent: string) => void;
  onAgentDone?: (agent: string, data: unknown) => void;
}

/**
 * 全流程共享状态。所有 Agent 间的上下文都经由这些 channel 传递，
 * 节点函数不读写任何实例字段。
 */
const WorkflowState = Annotation.Root({
  /** 输入 */
  contractText: Annotation<string>,
  feedback: Annotation<string>,
  /** 流式回调（贯穿所有节点，含 Send 并行分支） */
  cb: Annotation<StreamCallbacks>,
  /** Agent 1 产物 */
  clauses: Annotation<Clause[]>,
  /** risk 子图的 Send payload：单个待分析条款 */
  clause: Annotation<Clause>,
  /** negotiation 子图的 Send payload：单个待生成话术的风险条款 */
  risk: Annotation<RiskAnnotatedClause>,
  /** Agent 2 产物（并行分支各自追加，reducer 合并） */
  risks: Annotation<SingleRisk[]>({
    reducer: (prev: SingleRisk[], next: SingleRisk[]) => prev.concat(next),
    default: () => [],
  }),
  riskAnnotatedClauses: Annotation<RiskAnnotatedClause[]>,
  /** Agent 3 产物（并行分支各自追加，reducer 合并） */
  negotiationTips: Annotation<NegotiationTip[]>({
    reducer: (prev: NegotiationTip[], next: NegotiationTip[]) => prev.concat(next),
    default: () => [],
  }),
  /** Agent 4 产物 */
  finalReport: Annotation<FinalReport | null>,
});

export type WorkflowStateType = typeof WorkflowState.State;

export class RentalWorkflow {
  private llm: ChatOpenAI; // 属性名：类型（OpenAi模型）

  constructor() {
    this.llm = this.initLLM(); // 调用自己的initLLM方法 -> 得到一个ChatOpenAI实例
  }

  // 初始化LLM模型
  private initLLM(): ChatOpenAI { // 声明函数，返回值为ChatOpenAI实例
    const provider = process.env.MODEL_PROVIDER;
    let apiKey: string | undefined, baseURL: string | undefined, model: string | undefined;

    if (provider === "SILICONFLOW") {
      apiKey = process.env.SILICONFLOW_API_KEY;
      baseURL = process.env.SILICONFLOW_BASE_URL;
      model = process.env.SILICONFLOW_MODEL;
    } else if (provider === "DEEPSEEK") {
      apiKey = process.env.DEEPSEEK_API_KEY;
      baseURL = process.env.DEEPSEEK_BASE_URL;
      model = process.env.DEEPSEEK_MODEL;
    }

    return new ChatOpenAI({
      configuration: { apiKey, baseURL },
      model,
      temperature: 0.3,  // 降低随机性，保证结构化输出的一致性
      timeout: 30000,
      maxTokens: 2048,   // 防止小模型在 json_schema 约束下无界生成（曾导致条款拆分卡死）
      streaming: true,
      // response_format 由 streamStructured 按 agent 的 zod schema 逐次注入
    });
  }

  /**
   * 从LLM响应中剥离代码围栏，取出 JSON 文本
   * 使用 matchAll 取最后一个匹配块，避免 LLM echo 输入数据时取到错误块
   */
  private extractJson(text: string): any {
    const jsonBlocks = [...text.matchAll(/```json\s*\n([\s\S]*?)\n\s*```/g)];
    if (jsonBlocks.length > 0) {
      return JSON.parse(jsonBlocks[jsonBlocks.length - 1][1]);
    }

    const codeBlocks = [...text.matchAll(/```\s*\n([\s\S]*?)\n\s*```/g)];
    if (codeBlocks.length > 0) {
      return JSON.parse(codeBlocks[codeBlocks.length - 1][1]);
    }

    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) return JSON.parse(objectMatch[0]);

    throw new Error("无法从响应中提取JSON");
  }

  /**
   * zod schema → OpenAI response_format
   * - strict 模式要求每层对象带 additionalProperties:false 且 required 列全字段
   * - 剥离 minLength/minItems 等长度约束：实测小模型会因此在数组结构上无界生成，
   *   这类约束只在运行时 zod 校验中生效即可
   */
  private toResponseFormat(schema: z.ZodType, name: string) {
    const jsonSchema = z.toJSONSchema(schema, { io: "output" });
    const harden = (node: any): any => {
      if (!node || typeof node !== "object") return node;
      delete node.minLength;
      delete node.minItems;
      if (node.type === "object" && node.properties) {
        node.additionalProperties = false;
        node.required = Object.keys(node.properties);
        Object.values(node.properties).forEach(harden);
      }
      if (node.type === "array" && node.items) harden(node.items);
      return node;
    };
    return {
      type: "json_schema" as const,
      json_schema: { name, strict: true, schema: harden(jsonSchema) },
    };
  }

  /**
   * Agent 0: 意图识别（非流式）
   */
  async classifyInput(text: string): Promise<ClassificationResult> {
    const response = await this.llm.invoke(
      [
        new SystemMessage(INTENT_CLASSIFIER_PROMPT),
        new HumanMessage(`请判断以下用户输入的类别：\n\n${text}`),
      ],
      { response_format: this.toResponseFormat(ClassificationSchema, "classification") } as any
    );
    return ClassificationSchema.parse(this.extractJson(response.content as string));
  }

  /**
   * 流式调用 LLM 并收集完整响应
   */
  private async streamAndCollect(
    messages: (SystemMessage | HumanMessage)[],
    onChunk: (chunk: string) => void,
    onThink?: (thought: string) => void,
    responseFormat?: object
  ): Promise<string> {
    const stream = await this.llm.stream(messages,
      responseFormat ? { response_format: responseFormat } as any : undefined);
    let fullResponse = "";
    for await (const chunk of stream) {
      const reasoning = (chunk.additional_kwargs as any)?.reasoning_content;
      if (typeof reasoning === 'string' && reasoning.trim()) onThink?.(reasoning);
      const content = chunk.content as string || "";
      if (!content.trim()) continue;
      fullResponse += content;
      onChunk(content);
    }
    return fullResponse;
  }

  /**
   * 结构化流式调用：API 层 json_schema 约束 + 运行时 zod 校验 + 失败信息回灌重试
   * @returns 通过校验的数据，类型由 schema 推导（非类型断言）
   */
  private async streamStructured<T>(
    schema: z.ZodType<T>,
    schemaName: string,
    systemPrompt: string,
    userPrompt: string,
    cb: StreamCallbacks,
    maxAttempts = 2
  ): Promise<T> {
    const responseFormat = this.toResponseFormat(schema, schemaName);
    let lastIssue = "";

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt + (lastIssue
          ? `\n\n上次输出未通过校验，请修正后重新输出：${lastIssue}`
          : "")),
      ];

      const raw = await this.streamAndCollect(messages, cb.onChunk, cb.onThink, responseFormat);

      let parsed: unknown;
      try {
        parsed = this.extractJson(raw);
      } catch {
        lastIssue = "输出不是合法JSON，请严格只输出JSON对象，不要包含解释文字";
        cb.onValidationFail?.(schemaName, lastIssue, attempt);
        continue;
      }

      const result = schema.safeParse(parsed);
      if (result.success) return result.data;

      lastIssue = formatIssues(result.error);
      cb.onValidationFail?.(schemaName, lastIssue, attempt);
    }

    throw new Error(`${schemaName} 输出校验失败（已重试${maxAttempts}次）：${lastIssue}`);
  }

  // ==================== Agent 节点 ====================
  // 所有节点签名统一为 (state) => Partial<state>，上下文只经 state channel 流转

  /** Agent 1: 条款拆分 */
  private nodeClauseSplit = async (s: WorkflowStateType) => {
    s.cb.onAgentStart?.("clause_splitter");
    const { clauses } = await this.streamStructured(
      ClauseListSchema, "clause_list", CLAUSE_SPLITTER_PROMPT,
      `请分析以下租房合同文本：\n\n${s.contractText}` +
        (s.feedback ? `\n\n用户反馈：${s.feedback}` : ""),
      s.cb
    );
    s.cb.onAgentDone?.("clause_splitter", { clauses });
    return { clauses };
  };

  /** Agent 2 fan-out：每个条款派发一个并行 worker */
  private nodeRiskFanout = (s: WorkflowStateType) => {
    s.cb.onAgentStart?.("risk_analyzer");
    return new Command({
      goto: s.clauses.map((c) => new Send("riskWorker", { clause: c, cb: s.cb })),
    });
  };

  /** Agent 2 worker：单条款风险分析（并行执行，异常隔离不炸整图） */
  private nodeRiskWorker = async (s: WorkflowStateType) => {
    try {
      const risk = await this.streamStructured(
        SingleRiskSchema, "single_risk", RISK_ANALYZER_PROMPT,
        `请评估以下合同条款：\n\n${JSON.stringify(s.clause, null, 2)}`, s.cb
      );
      // 模型可能回填错误的 clauseId，以入参条款为准，保证后续能正确关联
      return { risks: [{ ...risk, clauseId: s.clause.id }] };
    } catch {
      // 单条款失败不影响其他条款继续跑；保守标为高风险，强制进入后续人工审查路径
      return { risks: [{
        clauseId: s.clause.id,
        riskLevel: "high" as const,
        suggestion: "分析失败，请人工审查该条款",
      }] };
    }
  };

  /** Agent 2 汇聚：并行结果按原条款顺序合并 */
  private nodeRiskCollect = (s: WorkflowStateType) => {
    const riskAnnotatedClauses = s.risks
      .slice()
      .sort((a, b) => Number(a.clauseId) - Number(b.clauseId))
      .map((r) => ({
        clause: s.clauses.find((c) => c.id === r.clauseId)!,
        riskLevel: r.riskLevel,
        suggestion: r.suggestion,
      })) as RiskAnnotatedClause[];
    s.cb.onAgentDone?.("risk_analyzer", { riskAnnotatedClauses });
    return { riskAnnotatedClauses };
  };

  /** Agent 3 fan-out：每个高/中风险条款派发一个并行 worker */
  private nodeNegotiationFanout = (s: WorkflowStateType) => {
    const targets = s.riskAnnotatedClauses.filter(
      (r) => r.riskLevel === "high" || r.riskLevel === "medium"
    );
    if (!targets.length) return {};
    s.cb.onAgentStart?.("negotiation_advisor");
    return new Command({
      goto: targets.map((risk) => new Send("negotiationWorker", { risk, cb: s.cb })),
    });
  };

  /** Agent 3 worker：单条高/中风险条款生成一句谈判话术 */
  private nodeNegotiationWorker = async (s: WorkflowStateType) => {
    try {
      const tip = await this.streamStructured(
        SingleNegotiationTipSchema, "single_negotiation_tip", NEGOTIATION_ADVISOR_PROMPT,
        `请针对以下风险条款生成谈判话术：\n\n${JSON.stringify(s.risk, null, 2)}`, s.cb
      );
      return { negotiationTips: [tip] };
    } catch {
      return { negotiationTips: [{
        clauseId: s.risk.clause.id,
        clauseTitle: "风险条款",
        riskLevel: s.risk.riskLevel,
        script: "该条款存在风险，建议与出租方进一步协商明确。",
      }] };
    }
  };

  /** Agent 3 汇聚：完成后才进入串行终审 */
  private nodeNegotiationCollect = (s: WorkflowStateType) => {
    s.cb.onAgentDone?.("negotiation_advisor", { negotiationTips: s.negotiationTips });
    return {};
  };

  /** Agent 4: 终审裁判 */
  private nodeFinalReview = async (s: WorkflowStateType) => {
    s.cb.onAgentStart?.("final_reviewer");
    const finalReport = await this.streamStructured(
      FinalReportSchema, "final_report", FINAL_REVIEWER_PROMPT,
      `请基于以下分析数据生成最终评审报告：\n\n${JSON.stringify(
        { riskAnalysis: s.riskAnnotatedClauses, negotiationTips: s.negotiationTips }, null, 2
      )}`,
      s.cb
    );
    s.cb.onAgentDone?.("final_reviewer", { finalReport });
    return { finalReport };
  };

  /**
   * 条件路由：有高/中风险条款才走谈判话术，否则直接进终审。
   * 这个判断原先藏在 step3 函数体内（`targets.length === 0 → return []`），
   * 提为 conditional edge 后调度逻辑在图上可见。
   */
  private routeAfterRisk = (s: WorkflowStateType): "negotiation_fanout" | "final_reviewer" => {
    const hasNegotiable = s.riskAnnotatedClauses.some(
      (r) => r.riskLevel === "high" || r.riskLevel === "medium"
    );
    if (!hasNegotiable) s.cb.onAgentDone?.("negotiation_advisor", { negotiationTips: [] });
    return hasNegotiable ? "negotiation_fanout" : "final_reviewer";
  };

  // ==================== 图编排 ====================

  /**
   * 图一（人工确认前）：START → clause_splitter → END
   * 停在确认点，等用户确认/反馈后再进图二
   */
  private splitGraph = new StateGraph(WorkflowState)
    .addNode("clause_splitter", this.nodeClauseSplit)
    .addEdge(START, "clause_splitter")
    .addEdge("clause_splitter", END)
    .compile();

  /**
   * 图二（人工确认后）：风险并行子图 → 条件路由 → 谈判话术/终审 → END
   *
   *   START → risk_fanout ──Send(N路并行)──→ risk_worker → risk_collect
   *                                                            │
   *                                          ┌─────────────────┴──────────────┐
   *                                 有高/中风险                          无高/中风险
   *                                          ↓                                ↓
   *                              negotiation_advisor ─────────────→ final_reviewer → END
   */
  private analyzeGraph = new StateGraph(WorkflowState)
    .addNode("risk_fanout", this.nodeRiskFanout, { ends: ["riskWorker"] })
    .addNode("riskWorker", this.nodeRiskWorker)
    .addNode("risk_collect", this.nodeRiskCollect)
    .addNode("negotiation_fanout", this.nodeNegotiationFanout, { ends: ["negotiationWorker"] })
    .addNode("negotiationWorker", this.nodeNegotiationWorker)
    .addNode("negotiation_collect", this.nodeNegotiationCollect)
    .addNode("final_reviewer", this.nodeFinalReview)
    .addEdge(START, "risk_fanout")
    .addEdge("riskWorker", "risk_collect")
    .addConditionalEdges("risk_collect", this.routeAfterRisk, [
      "negotiation_fanout",
      "final_reviewer",
    ])
    .addEdge("negotiationWorker", "negotiation_collect")
    .addEdge("negotiation_collect", "final_reviewer")
    .addEdge("final_reviewer", END)
    .compile();

  // ==================== 对外接口 ====================

  /** 阶段一：条款拆分（feedback 非空表示带用户反馈重新拆分） */
  async runClauseSplit(
    contractText: string,
    cb: StreamCallbacks,
    feedback = ""
  ): Promise<Clause[]> {
    const out = await this.splitGraph.invoke({ contractText, feedback, cb });
    return out.clauses;
  }

  /** 阶段二：风险分析 → 谈判话术 → 终审报告 */
  async runAnalysis(
    clauses: Clause[],
    cb: StreamCallbacks
  ): Promise<{
    riskAnnotatedClauses: RiskAnnotatedClause[];
    negotiationTips: NegotiationTip[];
    finalReport: FinalReport;
  }> {
    const out = await this.analyzeGraph.invoke({ clauses, cb, risks: [] });
    return {
      riskAnnotatedClauses: out.riskAnnotatedClauses,
      negotiationTips: out.negotiationTips ?? [],
      finalReport: out.finalReport!,
    };
  }
}
