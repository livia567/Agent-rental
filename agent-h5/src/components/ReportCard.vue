<script setup lang="ts">
import type { FinalReport, RiskAnnotatedClause, NegotiationTip } from '../types'
import { RISK_LEVEL_LABELS, CLAUSE_TYPE_LABELS } from '../types'
import { exportReportToHtml} from '../utils/exportHtml'

const props = defineProps<{
  report: FinalReport
  riskClauses: RiskAnnotatedClause[]
  negotiationTips: NegotiationTip[]
}>()

const emit = defineEmits<{
  (e: 'back'): void
}>()

const handleExportHtml = async () => {
  try {
    await exportReportToHtml(props.report, props.riskClauses, props.negotiationTips)
  } catch (err: any) {
    console.error('HTML导出失败:', err)
  }
}

const verdictClass = (verdict: string) => {
  if (verdict === 'recommend') return 'verdict-recommend'
  if (verdict === 'cautious') return 'verdict-cautious'
  return 'verdict-reject'
}

const verdictIcon = (verdict: string) => {
  if (verdict === 'recommend') return 'certificate'
  if (verdict === 'cautious') return 'warning-o'
  return 'close'
}
</script>

<template>
  <div class="report-content">
    <!-- 综合评分 -->
    <div class="card verdict-card" :class="verdictClass(report.verdict)">
      <div class="verdict-emoji"><van-icon :name="verdictIcon(report.verdict)" size="60" /></div>
      <div class="verdict-label">
        {{ report.verdict === 'recommend' ? '建议签约' : report.verdict === 'cautious' ? '谨慎签约' : '不建议签约' }}
      </div>
      <div class="verdict-score">综合评分：{{ report.overallScore }} 分</div>
      <div class="verdict-reason">{{ report.verdictReason }}</div>
      <div class="verdict-summary">{{ report.summary }}</div>
      <div v-if="report.riskSummary" class="risk-stats">
        <span class="stat high">高风险 {{ report.riskSummary.high }}</span>
        <span class="stat-divider">|</span>
        <span class="stat medium">中风险 {{ report.riskSummary.medium }}</span>
        <span class="stat-divider">|</span>
        <span class="stat low">低风险 {{ report.riskSummary.low }}</span>
      </div>
    </div>

    <!-- 合同亮点 -->
    <div v-if="report.highlights?.length" class="card">
      <div class="section-title"><van-icon name="star-o" size="18" /><span>合同亮点</span></div>
      <div v-for="(h, i) in report.highlights" :key="i" class="highlight-item">
        {{ h }}
      </div>
    </div>

    <!-- 风险详情 -->
    <div class="card">
      <div class="section-title"><van-icon name="newspaper-o" size="18" /><span>逐条风险分析</span></div>
      <div
        v-for="item in riskClauses"
        :key="item.clause.id"
        class="card risk-item"
        :class="`risk-${item.riskLevel}`"
      >
        <div class="risk-item-header">
          <span class="risk-badge" :class="item.riskLevel">
            {{ RISK_LEVEL_LABELS[item.riskLevel] }}
          </span>
          <span class="risk-item-title">{{ CLAUSE_TYPE_LABELS[item.clause.clauseType] || '其他条款' }}</span>
        </div>
        <div class="risk-original">原文：{{ item.clause.originalText }}</div>
        <div class="risk-suggestion"><van-icon name="bulb-o" size="18" /> {{ item.suggestion }}</div>
      </div>
    </div>

    <!-- 谈判话术 -->
    <div v-if="negotiationTips.length > 0" class="card">
      <div class="section-title"><van-icon name="bullhorn-o" size="18" /><span>谈判话术建议</span></div>
      <div v-for="tip in negotiationTips" :key="tip.clauseId" class="tip-item">
        <div class="tip-title">关于「{{ tip.clauseTitle }}」</div>
        <div class="tip-script">"{{ tip.script }}"</div>
      </div>
    </div>

    <!-- 导出Html -->
    <div class="export-section">
      <button class="btn-primary" @click="handleExportHtml">导出报告</button>
    </div>

    <!-- 免责声明 -->
    <p class="disclaimer">此内容由AI生成，仅供参考，不构成法律建议</p>

    <!-- 返回按钮 -->
    <div class="back-section">
      <button class="btn-secondary" @click="emit('back')">← 返回首页</button>
    </div>
  </div>
</template>

<style scoped>
.report-content {
  padding-bottom: 40px;
}

.verdict-card {
  text-align: center;
  padding: 32px 24px;
}
.verdict-emoji {
  font-size: 48px;
  margin-bottom: 8px;
}
.verdict-label {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 8px;
}
.verdict-score {
  font-size: 15px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}
.verdict-reason {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
  line-height: 1.5;
}
.verdict-summary {
  font-size: 13px;
  color: var(--color-text-tertiary);
  margin-bottom: 12px;
}

.risk-stats {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  font-weight: 500;
}
.stat-divider { color: var(--color-border); }
.stat.high { color: var(--color-risk-high); }
.stat.medium { color: var(--color-risk-medium); }
.stat.low { color: var(--color-risk-low); }

.section-title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
}

.highlight-item {
  font-size: 14px;
  color: var(--color-text-secondary);
  padding: 6px 0;
  border-bottom: 0.5px solid var(--color-border);
}
.highlight-item:last-child { border-bottom: none; }

.risk-item {
  padding: 16px;
  margin-bottom: 12px;
}
.risk-item:last-child { margin-bottom: 0; }
.risk-item-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.risk-item-title {
  font-size: 15px;
  font-weight: 600;
}
.risk-original {
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-bottom: 6px;
  line-height: 1.5;
}
.risk-suggestion {
  font-size: 13px;
  color: var(--color-accent);
  font-weight: 500;
}

.tip-item {
  padding: 14px 0;
  border-bottom: 0.5px solid var(--color-border);
}
.tip-item:last-child { border-bottom: none; }
.tip-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 6px;
}
.tip-script {
  font-size: 14px;
  color: var(--color-text-primary);
  line-height: 1.6;
  margin-bottom: 4px;
  font-style: italic;
}

.disclaimer {
  text-align: center;
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-top: 24px;
}

.export-section {
  margin-top: 24px;
  text-align: center;
}

.back-section {
  text-align: center;
  margin-top: 24px;
}
</style>
