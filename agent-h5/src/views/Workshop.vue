<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useWorkshopStore } from '../stores/workshop'
import { fetchStream } from '../utils/request'
import type { SSEEvent } from '../types'
import { CLAUSE_TYPE_LABELS } from '../types'
import AnalysisProgress from '../components/AnalysisProgress.vue'
import ReportCard from '../components/ReportCard.vue'


const router = useRouter()
const store = useWorkshopStore()

const currentAgentOutput = ref('')
const currentThinking = ref('')
const thinkingContentRef = ref<HTMLPreElement | null>(null)
const outputContentRef = ref<HTMLPreElement | null>(null)
const showClauseReview = ref(false)
const feedbackText = ref('')
const showFeedback = ref(false)
const abortController = ref<AbortController | null>(null)

// 格式化思考内容：只保留中文和标点符号
// 思考内容更新时自动滚到底部
watch(currentThinking, async () => {
  await nextTick()
  if (thinkingContentRef.value) {
    thinkingContentRef.value.scrollTop = thinkingContentRef.value.scrollHeight
  }
})

// 分析结论更新时自动滚到底部
watch(currentAgentOutput, async () => {
  await nextTick()
  if (outputContentRef.value) {
    outputContentRef.value.scrollTop = outputContentRef.value.scrollHeight
  }
})

const formattedThinking = computed(() => {
  const raw = currentThinking.value
  if (!raw) return ''
  return raw
     .replace(/[^一-鿿　-〿＀-￯，。！？；：、\n]/g, '')
     .replace(/\s/g, '')  
})

// 根据 agent 类型格式化 JSON 输出，只展示有意义的文本内容
function formatOutput(data: unknown, agent: string): string {
  if (!data || typeof data !== 'object') return ''
  const d = data as Record<string, unknown>

  if (agent === 'clause_splitter' && Array.isArray(d.clauses)) {
    return d.clauses.map((c: any, i: number) =>
      `【${c.title || `条款${i + 1}`}】\n${c.originalText || ''}`
    ).join('\n\n')
  }
  if (agent === 'risk_analyzer' && Array.isArray(d.risks)) {
    return d.risks.map((r: any) =>
      `建议：${r.suggestion || ''}`
    ).join('\n\n')
  }
  if (agent === 'negotiation_advisor' && Array.isArray(d.tips)) {
    return d.tips.map((t: any) =>
      `「${t.clauseTitle || ''}」${t.script || ''}`
    ).join('\n\n')
  }
  if (agent === 'final_reviewer' && d.finalReport) {
    const r = d.finalReport as Record<string, unknown>
    return [r.summary, r.verdictReason, (r.highlights as string[])?.join('、')].filter(Boolean).join('\n\n')
  }

  // fallback：递归提取所有字符串值
  const extract = (obj: unknown): string => {
    if (typeof obj === 'string') return obj
    if (Array.isArray(obj)) return obj.map(extract).filter(Boolean).join('\n')
    if (obj && typeof obj === 'object') return Object.values(obj as Record<string, unknown>).map(extract).filter(Boolean).join('\n')
    return ''
  }
  return extract(data)
}

const formattedAgentOutput = computed(() => {
  const raw = currentAgentOutput.value
  if (!raw) return ''
  try { return formatOutput(JSON.parse(raw), store.activeAgent) }
    catch {
      return raw
        .replace(/[\[\]{}"]/g, '')
        .replace(/[a-z_][a-z0-9_]*\s*:\s*/gi, '')
        .replace(/\b[a-z][a-z0-9]{0,14}\b/gi, '')
        .replace(/[,;]{2,}/g, ',')
        .replace(/^[\s,;]+|[\s,;]+$/g, '')
        .replace(/\s*,\s*/g, '\n')
        .replace(/^\d+\s*$/gm, '')
        .replace(/\n{2,}/g, '\n')
        .trim() || raw.replace(/^[\[\{]\s*/, '').slice(0, 80) + '...'
    }
})

// Agent 角色清单
interface AgentInfo {
  key: string
  name: string
  icon: string
  desc: string
}
const agentList: AgentInfo[] = [
  { key: 'clause_splitter', name: '条款拆分师', icon: '📋', desc: '把合同拆成结构化条款' },
  { key: 'risk_analyzer', name: '风险分析师', icon: '⚠️', desc: '逐条识别潜在风险' },
  { key: 'negotiation_advisor', name: '谈判顾问', icon: '🎯', desc: '生成谈判话术' },
  { key: 'final_reviewer', name: '终审评审员', icon: '✅', desc: '综合打分，给出结论' },
]

const getAgentInfo = (key: string): AgentInfo | undefined => {
  return agentList.find(a => a.key === key)
}

// 新增：初始分析阶段的 loading 状态
const showLoadingOverlay = ref(false)
const loadingOverlayMessage = computed(() =>
  store.imageBase64.length > 0
    ? '正在进行OCR识别和意图分析...'
    : '正在进行用户意图分析...'
)

// SSE 事件处理
const handleSSEEvent = (event: SSEEvent) => {
  // 条款分析开始 / 出错 / 输入被拒时，关闭 loading 遮罩
  if (
    (event.type === 'agent_start' && event.agent === 'clause_splitter') ||
    event.type === 'input_rejected'
  ) {
    showLoadingOverlay.value = false
  }

  switch (event.type) {
    case 'agent_start':
      store.setAgentStatus(event.agent!, 'active')
      // 只对展示列表中的 agent 设置 activeAgent，避免 OCR 等已移除的 agent 导致面板异常
      if (agentList.some(a => a.key === event.agent)) {
        store.setActiveAgent(event.agent!)
      }
      currentAgentOutput.value = ''
      currentThinking.value = ''
      break

    case 'agent_think':
      currentThinking.value += event.thought || ''
      break

    case 'agent_retry':
      currentAgentOutput.value = ''
      currentThinking.value = ''
      break

    case 'agent_chunk':
      currentAgentOutput.value += event.content || ''
      break

    case 'agent_done':
      store.setAgentStatus(event.agent!, 'done')
      if (event.agent === 'ocr_extractor') {
        // OCR 完成，不额外保存
      } else if (event.agent === 'clause_splitter') {
        store.setClauses(event.data?.clauses || [])
        store.setStep('risk_confirm')
        showClauseReview.value = true
      } else if (event.agent === 'risk_analyzer') {
        store.setRiskAnnotatedClauses(event.data?.riskAnnotatedClauses || [])
        store.setStep('negotiation_advise')
      } else if (event.agent === 'negotiation_advisor') {
        store.setNegotiationTips(event.data?.negotiationTips || [])
        store.setStep('final_review')
      }
      // 保留 currentAgentOutput/currentThinking，等下一个 agent_start 时清
      break

    case 'confirm_needed':
      store.setConfirmData({
        threadId: event.threadId!,
        question: event.question!,
        data: event.data,
      })
      showClauseReview.value = true
      break

    case 'workflow_done':
      store.setFinalReport(event.data?.finalReport)
      store.setStep('done')
      store.setPhase('done')
      break

    case 'input_rejected':
      // 非合同内容（无效输入/图片非合同），返回首页提示
      if (abortController.value) abortController.value.abort()
      showToast("请上传正确的合同")
      router.push('/')
      break

    case 'error':
      store.setError(event.message!)
      showToast(event.message || '发生错误')
      break
  }
}

// 开始分析
const startAnalysis = async () => {
  const text = store.contractText
  const img = store.imageBase64

  if (!text && img.length === 0) {
    router.push('/')
    return
  }

  if (abortController.value) abortController.value.abort()
  store.reset()
  store.contractText = text
  if (img.length > 0) store.imageBase64 = img
  store.setPhase('analyzing')
  showLoadingOverlay.value = true

  try {
    abortController.value = await fetchStream(
      'rental/analyze',
      { contractText: text, imageBase64: img },
      handleSSEEvent,
      () => { /* complete handled by workflow_done event */ },
      (msg) => {
        showLoadingOverlay.value = false
        store.setError(msg)
        showToast(msg)
        router.push('/')
      }
    )
  } catch (err: any) {
    showLoadingOverlay.value = false
    store.setError(err.message)
    showToast(err.message)
    router.push('/')
  }
}

// 确认并继续：通知后端恢复 SSE 流
const handleClauseConfirm = async () => {
  showClauseReview.value = false
  feedbackText.value = ''
  showFeedback.value = false
  if (!store.confirmData) return

  if (abortController.value) {
    abortController.value.abort()
  }
  store.setError(null)
  try {
    abortController.value = await fetchStream(
      'rental/confirm',
      { threadId: store.confirmData.threadId },
      handleSSEEvent,
      () => { /* complete handled by workflow_done event */ },
      (msg) => {
        showLoadingOverlay.value = false
        store.setError(msg)
        showToast(msg)
      }
    )
  } catch (err: any) {
    showLoadingOverlay.value = false
    store.setError(err.message)
    showToast(err.message)
  }
}

// 拒绝分类结果：首次点击展开反馈输入框，再次点击提交
const handleClauseCancel = async () => {
  if (!showFeedback.value) {
    showFeedback.value = true
    return
  }
  // 必须有反馈内容才能提交
  if (!feedbackText.value.trim()) return
  showClauseReview.value = false
  showFeedback.value = false
  if (!store.confirmData) return
  if (abortController.value) abortController.value.abort()
  store.setError(null)
  try {
    abortController.value = await fetchStream(
      'rental/reject',
      { threadId: store.confirmData.threadId, feedback: feedbackText.value },
      handleSSEEvent,
      () => {},
      (msg) => { showLoadingOverlay.value = false; store.setError(msg); showToast(msg) }
    )
  } catch (err: any) {
    showLoadingOverlay.value = false
    store.setError(err.message)
    showToast(err.message)
  } finally {
    feedbackText.value = ''
  }
}

// 计算风险统计
const riskSummary = computed(() => {
  if (store.riskAnnotatedClauses.length === 0) return undefined
  const summary = { high: 0, medium: 0, low: 0 }
  store.riskAnnotatedClauses.forEach(r => {
    if (r.riskLevel === 'high') summary.high++
    else if (r.riskLevel === 'medium') summary.medium++
    else summary.low++
  })
  return summary
})

// 格式化条款结果为可读文本
const clauseReviewText = computed(() => {
  if (store.clauses.length === 0) return '未拆分出条款'
  return store.clauses
    .map((c, i) => {
      const typeLabel = CLAUSE_TYPE_LABELS[c.clauseType] || '其他条款'
      return `【条款${i + 1}】${typeLabel}\n原文：${c.originalText}`
    })
    .join('\n\n')
})

// 返回按钮：中断分析并返回首页
const handleBack = () => {
  if (abortController.value) abortController.value.abort()
  store.reset()
  router.push('/')
}

onMounted(() => {
  // 已有结果，保留展示
  if (store.analysisPhase === 'done') return
  // 有合同数据 → 启动分析
  if (store.contractText || store.imageBase64.length > 0) {
    startAnalysis()
  }
})

onUnmounted(() => {
  if (abortController.value) abortController.value.abort()
})
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <van-nav-bar
        :title="store.analysisPhase === 'done' ? '合同评审报告' : '合同分析中（请勿退出）...'"
        @click-left="handleBack"
      >
        <template #left>
          <van-icon name="arrow-left" size="16" color="#323233" />
          <span>返回</span>
        </template>
      </van-nav-bar>
    </div>

    <div class="page-content">
      <!-- ========== 状态1：未分析过，空状态 ========== -->
      <div v-if="store.analysisPhase === 'idle'" class="empty-state">
        <div class="empty-icon"><van-icon name="todo-list-o" /></div>
        <div class="empty-title">请先开始分析</div>
        <div class="empty-desc">前往首页输入合同文本或上传合同照片</div>
        <button class="btn-primary" @click="router.push('/')">前往首页</button>
      </div>

      <!-- ========== 状态2：分析中 ========== -->
      <template v-else-if="store.analysisPhase === 'analyzing'">
        <!-- Loading 遮罩：初次分析（OCR/意图分类）阶段 -->
        <div v-if="showLoadingOverlay" class="loading-overlay">
          <div class="loading-content">
            <van-loading size="32px" color="#0071e3" />
            <p class="loading-text">{{ loadingOverlayMessage }}</p>
          </div>
        </div>

        <!-- Agent 团队状态 -->
        <div class="card">
          <div class="section-title"><van-icon name="friends-o" class="icon-team" /><span> Agent 团队状态</span></div>
          <div class="agent-grid">
            <div
              v-for="agent in agentList"
              :key="agent.key"
              class="agent-card"
              :class="store.agentStatuses[agent.key] || 'pending'"
            >
              <span class="agent-icon">{{ agent.icon }}</span>
              <span class="agent-name">{{ agent.name }}</span>
              <span class="agent-badge">
                <template v-if="store.agentStatuses[agent.key] === 'active'"><van-icon name="pause-circle-o" size="12px" /> <span>工作中</span></template>
                <template v-else-if="store.agentStatuses[agent.key] === 'done'" ><van-icon name="passed" size="12px" /> <span>已完成</span></template>
                <template v-else-if="store.agentStatuses[agent.key] === 'error'" ><van-icon name="clear" size="12px"/> <span>错误</span></template>
                <template v-else class="agent-status"><van-icon name="clock-o" size="12px" /> <span>等待中</span></template>
              </span>
            </div>
          </div>
        </div>

        <!-- Agent 工作面板 -->
        <div v-if="store.activeAgent && getAgentInfo(store.activeAgent)" class="agent-panel">
          <div class="agent-panel-header">
            <span class="agent-panel-icon">{{ getAgentInfo(store.activeAgent)?.icon }}</span>
            <span class="agent-panel-name">{{ getAgentInfo(store.activeAgent)?.name }}</span>
            <van-loading v-if="store.agentStatuses[store.activeAgent] === 'active'" size="14px" />
            <span v-else class="agent-panel-done" style="font-size: 14px;">完成</span>
          </div>

          <div v-if="currentThinking" class="thinking-bubble">
            <div class="thinking-label">💭 思考过程</div>
            <pre ref="thinkingContentRef" class="thinking-content">{{ formattedThinking }}</pre>
          </div>

          <div v-if="currentAgentOutput" class="output-area">
            <div class="output-label"><van-icon name="description-o" size="16px" /> <span>分析结论：</span></div>
            <pre ref="outputContentRef" class="output-content">{{ formattedAgentOutput }}<span v-if="store.agentStatuses[store.activeAgent] === 'active'" class="cursor-blink">▌</span></pre>
          </div>

          <div v-if="!currentThinking && !currentAgentOutput && store.agentStatuses[store.activeAgent] === 'active'" class="waiting-hint">
            正在思考中...
          </div>
        </div>

        <!-- 进度条 -->
        <div class="card">
          <div class="section-title"><van-icon name="chart-trending-o" size="18px" /><span>分析进度</span></div>
          <AnalysisProgress
            :current-step="store.currentStep"
            :clauses-count="store.clauses.length || undefined"
            :risk-summary="riskSummary"
          />
        </div>

        <!-- 确认弹窗 -->
        <div v-if="showClauseReview" class="clause-review-overlay">
          <div class="clause-review-dialog">
            <div class="clause-review-header">
              <span class="review-icon"><van-icon name="todo-list-o" size="24px" /></span>
              <span>{{ store.confirmData ? ' 需要你确认' : '条款拆分完成，请确认' }}</span>
            </div>
            <div v-if="store.confirmData?.question" class="clause-review-question">
              {{ store.confirmData.question }}
            </div>
            <div class="clause-review-body">
              <textarea :value="clauseReviewText" readonly class="clause-review-textarea"></textarea>
            </div>
            <div v-if="showFeedback" class="clause-review-feedback">
              <textarea
                v-model="feedbackText"
                class="feedback-textarea"
                placeholder="哪里识别不对？告诉AI帮你修正..."
                rows="2"
              ></textarea>
            </div>
            <div class="clause-review-footer">
              <van-button plain :disabled="showFeedback && !feedbackText.trim()" @click="handleClauseCancel">{{ showFeedback ? '提交反馈' : '重新分析' }}</van-button>
              <van-button type="primary" @click="handleClauseConfirm">{{ showFeedback ? '不重新分析了，继续分析风险' : '确认，继续 ▶' }}</van-button>
            </div>
          </div>
        </div>

        <!-- 错误信息 -->
        <div v-if="store.error" class="card" style="border-left: 3px solid var(--color-risk-high)">
          <div class="error-title"><van-icon name="close" /> 分析出错</div>
          <p class="error-msg">{{ store.error }}</p>
          <button class="btn-primary" @click="router.push('/')">返回首页重试</button>
        </div>
      </template>

      <!-- ========== 状态3：分析完成，展示报告 ========== -->
      <template v-else-if="store.analysisPhase === 'done' && store.finalReport">
        <ReportCard
          :report="store.finalReport"
          :risk-clauses="store.riskAnnotatedClauses"
          :negotiation-tips="store.negotiationTips"
          @back="handleBack"
        />

      </template>
    </div>
  </div>
</template>

<style scoped>
.section-title {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 14px;
}

.agent-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.icon-team {
  font-size: 20px;
}

/* Agent 工作面板 */
.agent-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 0.5px solid var(--color-border);
}
.agent-panel-icon { font-size: 20px; }
.agent-panel-name { font-size: 15px; font-weight: 600; flex: 1; }
.agent-panel-done { font-size: 12px; color: var(--color-risk-low); }

.output-area {
  margin-top: 8px;
}
.output-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}
.output-content {
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
  overflow: auto;
  max-height: 25em;         /* 约15行 */
  margin: 0;
  font-family: inherit;
}

/* 思考气泡 */
.thinking-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
  font-style: normal;
}
.thinking-content {
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-y: auto;
  max-height: 8em;          /* 约5行 */
  margin: 0;
  font-family: inherit;
  color: var(--color-text-secondary);
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.thinking-content::-webkit-scrollbar {
  width: 3px;
}
.thinking-content::-webkit-scrollbar-track {
  background: transparent;
}
.thinking-content::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 3px;
}

.waiting-hint {
  text-align: center;
  color: var(--color-text-tertiary);
  font-size: 13px;
  padding: 20px 0;
}

.error-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 8px;
}
.error-msg {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin-bottom: 16px;
}

/* 条款拆分结果确认弹框 */
.clause-review-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}
.clause-review-dialog {
  width: 90vw;
  max-height: 70vh;
  background: #fff;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}
.clause-review-header {
  padding: 20px 20px 12px;
  font-size: 17px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.review-icon {
  font-size: 22px;
}
.clause-review-question {
  padding: 0 20px 12px;
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  flex-shrink: 0;
}
.clause-review-body {
  flex: 1;
  padding: 0 20px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.clause-review-textarea {
  width: 100%;
  flex: 1;
  min-height: 200px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  font-size: 13px;
  line-height: 1.6;
  resize: none;
  overflow-y: auto;
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font-family: inherit;
}
.clause-review-footer {
  padding: 16px 20px 20px;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  flex-shrink: 0;
}
.clause-review-feedback {
  margin-top: 16px;
  padding: 0 20px 0;
  flex-shrink: 0;
}
.feedback-textarea {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.5;
  resize: none;
  font-family: inherit;
  color: var(--color-text-primary);
  background: #fffaf3;
  box-sizing: border-box;
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 80px 20px;
}
.empty-icon {
  font-size: 56px;
  margin-bottom: 16px;
}
.empty-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 8px;
}
.empty-desc {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 24px;
}


</style>
