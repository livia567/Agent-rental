// ============ 合同分析相关类型 ============

/** 条款类型枚举 */
export type ClauseType = 'rent' | 'deposit' | 'payment' | 'termination' | 'repair' | 'utility' | 'other';

/** 风险等级 */
export type RiskLevel = 'high' | 'medium' | 'low';

/** 单条结构化条款 */
export interface Clause {
  id: string;
  originalText: string;    // 原始合同文本
  clauseType: ClauseType;  // 条款类型
}

/** 带风险标注的条款 */
export interface RiskAnnotatedClause {
  clause: Clause;
  riskLevel: RiskLevel;    // 风险等级
  suggestion: string;      // 初步建议
}

/** 谈判话术 */
export interface NegotiationTip {
  clauseId: string;
  clauseTitle: string;
  riskLevel: RiskLevel;
  script: string;          // 推荐话术，如"你可以这样说：..."
}

/** 综合评审报告 */
export interface FinalReport {
  overallScore: number;              // 0-100
  verdict: 'recommend' | 'cautious' | 'reject';  // 建议租/谨慎/不建议
  verdictReason: string;
  summary: string;                   // 总体评价
  highlights: string[];              // 合同亮点
  riskSummary: {                     // 风险统计
    high: number;
    medium: number;
    low: number;
  };
}

/** 工作流完整状态 */
export interface AnalysisState {
  // 输入
  contractText: string;

  // 各 Agent 输出
  clauses: Clause[];
  riskAnnotatedClauses: RiskAnnotatedClause[];
  negotiationTips: NegotiationTip[];
  finalReport: FinalReport | null;

  // 流程控制
  status: WorkflowStatus;
  currentStep: WorkflowStep;
  error: string | null;
}

/** 工作流运行状态 */
export type WorkflowStatus = 'running' | 'waiting_confirm' | 'processing' | 'done' | 'expired';

/** 工作流步骤 */
export type WorkflowStep =
  | 'idle'
  | 'intent_check'       // 新增：输入意图识别
  | 'clause_split'
  | 'risk_analyze'
  | 'risk_confirm'       // 等待用户确认风险分析
  | 'negotiation_advise'
  | 'final_review'
  | 'done';

// ============ OCR 图片识别 ============

/** OCR 识别结果 */
export interface OCRResult {
  success: boolean;
  text: string;            // 识别出的文字内容
  confidence?: number;     // 识别置信度 0-100
  error?: string;
}

// ============ 输入意图识别 ============

/** 用户输入分类 */
export type InputCategory = 'contract' | 'invalid';

/** 意图识别结果 */
export interface ClassificationResult {
  category: InputCategory;
  reason: string;          // 判断依据
}

// ============ SSE 事件类型 ============

export interface SSEEvent {
  type: 'agent_start' | 'agent_chunk' | 'agent_done' | 'agent_retry' | 'confirm_needed' | 'workflow_done' | 'input_rejected' | 'chat_reply' | 'chat_chunk' | 'error';
  agent?: string;
  message?: string;
  content?: string;
  data?: unknown;
  threadId?: string;
  question?: string;
}
