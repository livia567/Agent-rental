<script setup lang="ts">
import { computed } from 'vue'
import type { WorkflowStep } from '../types'

const props = defineProps<{
  currentStep: WorkflowStep
  clausesCount?: number
  riskSummary?: { high: number; medium: number; low: number }
}>()

interface StepItem {
  key: string
  index: number
  title: string
  desc: string
  status: 'done' | 'active' | 'pending'
}

const steps = computed<StepItem[]>(() => {
  const stepOrder: WorkflowStep[] = [
    'clause_split', 'risk_confirm', 'risk_analyze', 'negotiation_advise', 'final_review'
  ]
  const currentIdx = stepOrder.indexOf(props.currentStep)

  return [
    {
      key: 'clause_split',
      index: 1,
      title: '条款拆分',
      desc: props.clausesCount ? `${props.clausesCount}条条款` : '',
      status: currentIdx > 0 ? 'done' : currentIdx === 0 ? 'active' : 'pending',
    },
    {
      key: 'risk_analyze',
      index: 2,
      title: '风险识别',
      desc: props.riskSummary
        ? `高${props.riskSummary.high} 中${props.riskSummary.medium} 低${props.riskSummary.low}`
        : '',
      status: currentIdx > 2 ? 'done' : currentIdx === 2 ? 'active' : 'pending',
    },
    {
      key: 'negotiation_advise',
      index: 3,
      title: '谈判建议',
      desc: '',
      status: currentIdx > 3 ? 'done' : currentIdx === 3 ? 'active' : 'pending',
    },
    {
      key: 'final_review',
      index: 4,
      title: '综合评审',
      desc: '',
      status: currentIdx > 4 ? 'done' : currentIdx === 4 ? 'active' : 'pending',
    },
  ]
})
</script>

<template>
  <div class="progress-panel">
    <div
      v-for="step in steps"
      :key="step.key"
      class="progress-step"
      :class="{
        'step-done': step.status === 'done',
        'step-active': step.status === 'active',
        'step-pending': step.status === 'pending',
      }"
    >
      <div class="step-icon">
        <van-icon v-if="step.status === 'done'" name="success" color="#34c759" />
        <van-loading v-else-if="step.status === 'active'" size="16px" color="#0071e3" />
        <span v-else class="step-number">{{ step.index }}</span>
      </div>
      <div class="step-text">
        <div class="step-title">{{ step.title }}</div>
        <div class="step-desc" v-if="step.desc">{{ step.desc }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.progress-panel {
  padding: 4px 0;
}
.progress-step {
  display: flex;
  align-items: center;
  padding: 12px 0;
  border-bottom: 0.5px solid var(--color-border);
}
.progress-step:last-child {
  border-bottom: none;
}
.step-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
  flex-shrink: 0;
}
.step-number {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--color-bg-secondary);
  color: var(--color-text-tertiary);
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.step-active .step-title {
  color: var(--color-accent);
  font-weight: 600;
}
.step-done .step-title {
  color: var(--color-text-primary);
}
.step-pending .step-title {
  color: var(--color-text-tertiary);
}
.step-title {
  font-size: 14px;
}
.step-desc {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 2px;
}
</style>
