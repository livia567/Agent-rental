// ============ 合同分析相关类型 ============

export type ClauseType = 'rent' | 'deposit' | 'payment' | 'termination' | 'repair' | 'utility' | 'other';

export type RiskLevel = 'high' | 'medium' | 'low';

export interface Clause {
  id: string;
  title: string;
  originalText: string;
  clauseType: ClauseType;
}

export interface RiskAnnotatedClause {
  clause: Clause;
  riskLevel: RiskLevel;
  suggestion: string;
}

export interface NegotiationTip {
  clauseId: string;
  clauseTitle: string;
  riskLevel: RiskLevel;
  script: string;
}

export interface FinalReport {
  overallScore: number;
  verdict: 'recommend' | 'cautious' | 'reject';
  verdictReason: string;
  summary: string;
  highlights: string[];
  riskSummary: {
    high: number;
    medium: number;
    low: number;
  };
}

export type WorkflowStep =
  | 'idle'
  | 'clause_split'
  | 'risk_analyze'
  | 'risk_confirm'
  | 'negotiation_advise'
  | 'final_review'
  | 'done';

export interface AnalysisState {
  contractText: string;
  clauses: Clause[];
  riskAnnotatedClauses: RiskAnnotatedClause[];
  negotiationTips: NegotiationTip[];
  finalReport: FinalReport | null;
  currentStep: WorkflowStep;
  error: string | null;
}

// ============ SSE 事件类型 ============

export interface SSEEvent {
  type: 'agent_start' | 'agent_think' | 'agent_chunk' | 'agent_done' | 'agent_retry' | 'confirm_needed' | 'workflow_done' | 'error' | 'input_rejected' | 'chat_reply' | 'chat_chunk';
  agent?: string;
  message?: string;
  thought?: string;
  content?: string;
  data?: any;
  threadId?: string;
  question?: string;
}

// ============ 合同条款类型映射（中文显示） ============

export const CLAUSE_TYPE_LABELS: Record<ClauseType, string> = {
  rent: '租金条款',
  deposit: '押金条款',
  payment: '支付方式',
  termination: '解约条款',
  repair: '维修责任',
  utility: '水电费用',
  other: '其他条款',
};

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  high: '高风险',
  medium: '中风险',
  low: '低风险',
};

export const VERDICT_LABELS: Record<string, string> = {
  recommend: '✅ 建议签约',
  cautious: '⚠️ 谨慎签约',
  reject: '🚫 不建议签约',
};
