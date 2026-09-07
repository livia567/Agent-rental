<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { get } from '../utils/request'
import { useWorkshopStore } from '../stores/workshop'
import type { FinalReport, Clause, RiskAnnotatedClause, NegotiationTip } from '../types'

interface HistoryItem {
  id: string
  contractPreview: string
  createdAt: number
  finalReport: FinalReport | null
}

const router = useRouter()
const store = useWorkshopStore()
const records = ref<HistoryItem[]>([])
const loading = ref(true)
const onClickLeft = () => history.back();

onMounted(async () => {
  try {
    const result = await get<{ success: boolean; data: HistoryItem[] }>('/history')
    records.value = result.data
  } catch (err: any) {
    showToast(err.response?.data?.error || '历史记录加载失败')
  } finally {
    loading.value = false
  }
})

async function openRecord(id: string) {
  try {
    const result = await get<{ success: boolean; data: {
      clauses: Clause[]
      riskAnnotatedClauses: RiskAnnotatedClause[]
      negotiationTips: NegotiationTip[]
      finalReport: FinalReport
    } }>(`/history/${id}`)
    //将获取到的报告数据存入workshop Store
    //这样报告页（Report.vue）就能从Store中读取数据并展示
    store.setClauses(result.data.clauses)
    store.setRiskAnnotatedClauses(result.data.riskAnnotatedClauses)
    store.setNegotiationTips(result.data.negotiationTips)
    store.setFinalReport(result.data.finalReport)
    store.setPhase('done')
    store.setStep('done')
    router.push('/report')
  } catch (err: any) {
    showToast(err.response?.data?.error || '报告加载失败')
  }
}

function verdictText(report: FinalReport | null) {
  return report?.verdict === 'recommend' ? '建议签约' : report?.verdict === 'reject' ? '不建议签约' : '谨慎签约'
}
</script>

<template>
  <div class="page-container">
    <van-nav-bar title="历史分析" left-arrow  @click-left="onClickLeft" >
      <template #left>
        <van-icon name="arrow-left" size="16" color="#323233" />
      </template>
    </van-nav-bar>
    <div class="page-content">
      <van-loading v-if="loading" class="loading" />
      <van-empty v-else-if="!records.length" description="暂无历史分析记录" />
      <div v-else class="history-list">
        <button v-for="item in records" :key="item.id" class="history-item" @click="openRecord(item.id)">
          <div class="preview">{{ item.contractPreview }}</div>
          <div class="history-meta">
            <span class="date">{{ new Date(item.createdAt).toLocaleDateString('zh-CN') }}</span>
            <span class="result">
              <span class="verdict">{{ verdictText(item.finalReport) }}</span>
              <strong>{{ item.finalReport?.overallScore ?? '--' }}</strong>
              <van-icon name="arrow" />
            </span>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.loading { display: block; margin: 40px auto; }
.history-list { display: grid; gap: 10px; }
.history-item { width: 100%; display: block; padding: 14px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-bg-primary); text-align: left; color: inherit; }
.preview { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 600; }
.history-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
.date { color: var(--color-text-tertiary); font-size: 12px; }
.result { display: flex; align-items: center; flex-shrink: 0; gap: 6px; color: var(--color-text-secondary); font-size: 12px; }
.result strong { color: var(--color-text-primary); font-size: 16px; }
</style>
