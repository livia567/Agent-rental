import type { FinalReport, RiskAnnotatedClause, NegotiationTip } from '../types'
import { CLAUSE_TYPE_LABELS } from '../types'

const verdictText: Record<string, string> = {
  recommend: '建议签约', cautious: '谨慎签约', reject: '不建议签约',
}
const riskLabel: Record<string, string> = { high: '高', medium: '中', low: '低' }
const riskColor: Record<string, string> = { high: '#e74c3c', medium: '#f39c12', low: '#2ecc71' }

function h(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildHTML(report: FinalReport, riskClauses: RiskAnnotatedClause[], tips: NegotiationTip[]): string {
  const rs = report.riskSummary || { high: 0, medium: 0, low: 0 }

  const items = riskClauses.map(r => `
    <div class="risk-item">
      <div class="risk-head">
        <span class="risk-badge" style="color:${riskColor[r.riskLevel]};border-color:${riskColor[r.riskLevel]}">${riskLabel[r.riskLevel]}风险</span>
        <b>${h(CLAUSE_TYPE_LABELS[r.clause?.clauseType] || '其他条款')}</b>
      </div>
      <div class="kv"><span>原文</span>${h((r.clause?.originalText || '').slice(0, 150))}${(r.clause?.originalText || '').length > 150 ? '…' : ''}</div>
      <div class="kv"><span>建议</span>${h(r.suggestion || '')}</div>
    </div>`).join('')

  const tipItems = tips.length ? tips.map(t => `
    <div class="tip">
      <div class="tip-title">${h(t.clauseTitle || '')}</div>
      <div class="tip-body">${h(t.script || '')}</div>
    </div>`).join('') : '<div class="empty">无高风险或中风险条款</div>'

  const highlights = (report.highlights || []).length
    ? `<div class="section">合同亮点</div><ul>${report.highlights!.map(s => `<li>${h(s)}</li>`).join('')}</ul>`
    : ''

  return `
    <h1>租房合同评审报告</h1>
    <p class="meta">${new Date().toLocaleDateString('zh-CN')}</p>
    <div class="verdict ${report.verdict}">
      <div class="verdict-label">${verdictText[report.verdict]} &nbsp;·&nbsp; ${report.overallScore ?? '—'} 分</div>
      <div class="verdict-reason">${h(report.verdictReason || '')}</div>
      <div class="verdict-stats">
        <span style="color:${riskColor.high}">高风险 ${rs.high}</span>
        <span style="color:${riskColor.medium}">中风险 ${rs.medium}</span>
        <span style="color:${riskColor.low}">低风险 ${rs.low}</span>
      </div>
    </div>
    ${highlights}
    <div class="section">逐条风险分析</div>
    ${items}
    <div class="section">谈判话术建议</div>
    ${tipItems}
    <p class="disclaimer">此内容由AI生成，仅供参考，不构成法律建议</p>`
}

export async function exportReportToHtml(
  report: FinalReport,
  riskClauses: RiskAnnotatedClause[],
  negotiationTips: NegotiationTip[]
) {
  const body = buildHTML(report, riskClauses, negotiationTips)
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>租房合同评审报告</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{max-width:720px;margin:40px auto;padding:0 20px 60px;font:14px/1.75 -apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:#1d1d1f;background:#fff}
  h1{font-size:22px;text-align:center;margin:24px 0 4px;font-weight:700}
  .meta{text-align:center;font-size:12px;color:#999;margin-bottom:20px}
  .verdict{background:#f8f9fa;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px}
  .verdict-label{font-size:20px;font-weight:700}
  .verdict.reject .verdict-label{color:#e74c3c}
  .verdict.cautious .verdict-label{color:#f39c12}
  .verdict.recommend .verdict-label{color:#2ecc71}
  .verdict-reason{font-size:13px;color:#666;margin-top:6px}
  .verdict-stats{display:flex;justify-content:center;gap:20px;margin-top:10px;font-size:13px;font-weight:500}
  .section{font-size:16px;font-weight:600;margin:24px 0 12px}
  ul{margin:0 0 16px;padding-left:20px}
  li{font-size:13px;color:#555;padding:2px 0}
  .risk-item{padding:12px;margin-bottom:12px;border:1px solid #eee;border-radius:8px}
  .risk-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
  .risk-badge{display:inline-block;padding:0 8px;font-size:11px;font-weight:600;border:1px solid;border-radius:99px}
  .kv{margin:4px 0;font-size:13px}
  .kv span{color:#999;margin-right:8px;font-size:12px}
  .tip{padding:12px 0;border-bottom:1px solid #f0f0f0}
  .tip:last-child{border:none}
  .tip-title{font-weight:600;font-size:13px}
  .tip-body{font-size:13px;color:#333;margin:4px 0}
  .tip-note{font-size:12px;color:#999}
  .empty{font-size:13px;color:#999;padding:10px 0}
  .disclaimer{text-align:center;font-size:11px;color:#ccc;margin-top:32px}
  @media print{
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    @page{margin:15mm;size:A4}
  }
</style>
</head>
<body>${body}</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `租房合同评审报告_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}