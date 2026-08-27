// src/agents/riskAnalyzer.ts
// 单条款风险分析（每个条款由 LangGraph Send 并行 fan-out 成一个独立 LLM 调用）

export const RISK_ANALYZER_PROMPT = `你是一位专门处理租房纠纷的律师。
评估这一条合同条款的风险，只输出风险等级和一句话修改建议。

风险等级：high（高）/ medium（中）/ low（低）

输出格式：严格JSON，只包含 clauseId、riskLevel、suggestion 三个字段
{ "clauseId": "1", "riskLevel": "high", "suggestion": "建议修改为明确的金额" }`;

/** 单条款风险评估结果 */
export interface SingleRisk {
  clauseId: string;
  riskLevel: 'high' | 'medium' | 'low';
  suggestion: string;
}
