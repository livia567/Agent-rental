import { CLAUSE_TYPE_LABELS, RISK_LEVEL_LABELS, VERDICT_LABELS } from '../types'

// 流式预览：只保留中文与中文标点（及中文内嵌数字，如"3000元"）。
// 并行 worker 的 JSON 会交错拼接，按字符集过滤最稳；最终结论以 agent_done 为准。
export function sanitizeStream(raw: string): string {
  if (!raw) return ''
  return raw
    .replace(/([^一-龥0-9]|^)\d+(?=[^一-龥0-9]|$)/g, '$1')
    .replace(/[^一-龥　-〿＀-￯0-9]/g, '')
    .trim()
}

// 根据 agent 的 agent_done 结构化数据生成可读结论文本。
// 数据已由后端 zod 校验，这里只做展示，不再解析原始 JSON 流（避免并行 worker 拼接 JSON 导致显示脏数据）。
export function formatAgentResult(agent: string, data: any): string {
  if (!data || typeof data !== 'object') return ''

  if (agent === 'clause_splitter' && Array.isArray(data.clauses)) {
    return data.clauses.map((c: any, i: number) =>
      `【条款${i + 1}】${(CLAUSE_TYPE_LABELS as Record<string, string>)[c.clauseType] || '其他条款'}\n${c.originalText || ''}`
    ).join('\n\n')
  }
  if (agent === 'risk_analyzer' && Array.isArray(data.riskAnnotatedClauses)) {
    return data.riskAnnotatedClauses.map((r: any, i: number) =>
      `【条款${i + 1}】${(RISK_LEVEL_LABELS as Record<string, string>)[r.riskLevel] || r.riskLevel || ''}\n${r.suggestion || ''}`
    ).join('\n\n')
  }
  if (agent === 'negotiation_advisor' && Array.isArray(data.negotiationTips)) {
    return data.negotiationTips.map((t: any) =>
      `「${t.clauseTitle || ''}」${t.script || ''}`
    ).join('\n\n')
  }
  if (agent === 'final_reviewer' && data.finalReport) {
    const r = data.finalReport
    return [
      VERDICT_LABELS[r.verdict] || r.verdict || '',
      r.summary,
      r.verdictReason,
      Array.isArray(r.highlights) && r.highlights.length ? `亮点：${r.highlights.join('、')}` : '',
    ].filter(Boolean).join('\n\n')
  }

  return ''
}
