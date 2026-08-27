import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Clause, RiskAnnotatedClause, NegotiationTip, FinalReport, WorkflowStep } from '../types'

export const useWorkshopStore = defineStore('workshop', () => {
  // ---- state ----
  const contractText = ref('')
  const imageBase64 = ref<string[]>([])
  const currentStep = ref<WorkflowStep>('idle')
  const clauses = ref<Clause[]>([])
  const riskAnnotatedClauses = ref<RiskAnnotatedClause[]>([])
  const negotiationTips = ref<NegotiationTip[]>([])
  const finalReport = ref<FinalReport | null>(null)
  const analysisPhase = ref<'idle' | 'analyzing' | 'done'>('idle')
  const error = ref<string | null>(null)

  // Agent 团队状态（每个 Agent 卡片的状态）
  // AgentKey → 'pending' | 'active' | 'done' | 'error'
  const agentStatuses = ref<Record<string, 'pending'|'active'|'done'|'error'>>({
    clause_splitter: 'pending',
    risk_analyzer: 'pending',
    negotiation_advisor: 'pending',
    final_reviewer: 'pending',
  })
  // 当前正在工作的Agent名称
  const activeAgent = ref('')
  // 当前等待确认的数据
  const confirmData = ref<{
    threadId: string
    question: string
    data: unknown
  } | null>(null)

  // ---- actions ----

  function setClauses(data: Clause[]) {
    clauses.value = data
  }

  function setRiskAnnotatedClauses(data: RiskAnnotatedClause[]) {
    riskAnnotatedClauses.value = data
  }

  function setNegotiationTips(data: NegotiationTip[]) {
    negotiationTips.value = data
  }

  function setFinalReport(data: FinalReport) {
    finalReport.value = data
  }

  function setPhase(phase: 'idle' | 'analyzing' | 'done') {
    analysisPhase.value = phase
  }

  function setStep(step: WorkflowStep) {
    currentStep.value = step
  }

  function setActiveAgent(agent: string) {
    activeAgent.value = agent
  }

  function setAgentStatus(agent: string, status: 'pending'|'active'|'done'|'error') {
    agentStatuses.value[agent] = status
  }

  function setConfirmData(data: { threadId: string; question: string; data: unknown } | null) {
    confirmData.value = data
  }

  function setError(msg: string | null) {
    error.value = msg
  }

  /** 重置所有状态 */
  function reset() {
    contractText.value = ''
    imageBase64.value = []
    currentStep.value = 'idle'
    clauses.value = []
    riskAnnotatedClauses.value = []
    negotiationTips.value = []
    finalReport.value = null
    analysisPhase.value = 'idle'
    error.value = null
    activeAgent.value = ''
    confirmData.value = null
    agentStatuses.value = {
      clause_splitter: 'pending',
      risk_analyzer: 'pending',
      negotiation_advisor: 'pending',
      final_reviewer: 'pending',
    }
  }

  return {
    contractText, imageBase64, currentStep, clauses, riskAnnotatedClauses,
    negotiationTips, finalReport, analysisPhase, error, agentStatuses, activeAgent,
    confirmData,
    setClauses, setRiskAnnotatedClauses, setNegotiationTips,
    setFinalReport, setPhase, setStep, setAgentStatus, setActiveAgent,
    setConfirmData, setError, reset,
  }
})
