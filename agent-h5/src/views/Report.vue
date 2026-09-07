<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkshopStore } from '../stores/workshop'
import ReportCard from '../components/ReportCard.vue'

const router = useRouter()
const store = useWorkshopStore()
const showSkeleton = ref(true)
const showContent = ref(false)

onMounted(() => {
  // 如果没有数据，跳回首页
  if (!store.finalReport) {
    router.push('/')
    return
  }

  // 骨架屏 600ms
  setTimeout(() => {
    showSkeleton.value = false
    setTimeout(() => {
      showContent.value = true
    }, 50)
  }, 600)
})

const onClickLeft = () => history.back();

const goHome = () => {
  store.reset()
  router.push('/')
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <van-nav-bar title="合同评审报告" left-arrow  @click-left="onClickLeft" >
      <template #left>
        <van-icon name="arrow-left" size="16" color="#323233" />
      </template>
    </van-nav-bar>
    </div>

    <div class="page-content">
      <!-- 骨架屏 -->
      <div v-if="showSkeleton" class="skeleton-container">
        <div class="skeleton-block skeleton-hero"></div>
        <div class="skeleton-block skeleton-title"></div>
        <div class="skeleton-card">
          <div class="skeleton-line" style="width: 60%"></div>
          <div class="skeleton-line" style="width: 80%"></div>
          <div class="skeleton-line" style="width: 40%"></div>
        </div>
        <div class="skeleton-card">
          <div class="skeleton-line" style="width: 50%"></div>
          <div class="skeleton-line" style="width: 90%"></div>
          <div class="skeleton-line" style="width: 70%"></div>
        </div>
        <div class="skeleton-card">
          <div class="skeleton-line" style="width: 45%"></div>
          <div class="skeleton-line" style="width: 85%"></div>
        </div>
      </div>

      <!-- 实际报告 -->
      <template v-if="showContent && store.finalReport">
        <ReportCard
          :report="store.finalReport"
          :risk-clauses="store.riskAnnotatedClauses"
          :negotiation-tips="store.negotiationTips"
        />

      </template>
    </div>
  </div>
</template>

<style scoped>
/* 骨架屏 */
.skeleton-container {
  animation: shimmer 1.5s ease-in-out infinite;
}
@keyframes shimmer {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.skeleton-block {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
  margin-bottom: 16px;
}
.skeleton-hero {
  height: 120px;
  border-radius: var(--radius-lg);
}
.skeleton-title {
  height: 24px;
  width: 50%;
}

.skeleton-card {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  padding: 20px;
  margin-bottom: 16px;
}
.skeleton-line {
  height: 14px;
  background: var(--color-border);
  border-radius: 4px;
  margin-bottom: 10px;
}
.skeleton-line:last-child {
  margin-bottom: 0;
}


</style>
