<script setup lang="ts">
import { useRouter } from 'vue-router'
import { showConfirmDialog } from 'vant'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()

async function logout() {
  await showConfirmDialog({ title: '退出登录', message: '退出后需要重新登录' })
  auth.logout()
  router.replace('/login')
}
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <van-nav-bar title="关于这个工具" />
    </div>

    <div class="page-content">
      <div class="card account-card">
        <div>
          <div class="account-label">当前用户</div>
          <strong>{{ auth.user?.username }}</strong>
        </div>
        <van-button size="small" plain type="danger" @click="logout">退出登录</van-button>
      </div>

      <div class="card action-card" @click="router.push('/history')">
        <span>历史分析记录</span>
        <van-icon name="arrow" />
      </div>

      <!-- 项目介绍 -->
      <div class="hero-section">
        <h1 class="hero-title">🏠 租房避坑</h1>
        <p class="hero-subtitle">租房合同智能审查系统</p>
      </div>

      <div class="card">
        <p class="intro-text">
          基于多Agent协作架构，支持拍照上传 + OCR识别，逐条分析合同风险并生成报告。
        </p>
      </div>

      <!-- 技术栈 -->
      <div class="card">
        <div class="section-title">技术栈</div>
        <div class="tech-tags">
          <span class="tech-tag">Vue3</span>
          <span class="tech-tag">TypeScript</span>
          <span class="tech-tag">Pinia</span>
          <span class="tech-tag">Vant4</span>

          <span class="tech-tag">marked</span>
          <span class="tech-tag">Express</span>
          <span class="tech-tag">LangChain</span>
          <span class="tech-tag">SSE</span>
          <span class="tech-tag">腾讯云OCR</span>
          <span class="tech-tag">多Agent协作</span>
        </div>
      </div>

      <!-- 版本信息 -->
      <div class="card">
        <div class="version-item">
          <span>版本</span>
          <span class="version-value">v2.0.0</span>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.account-card, .action-card { display: flex; align-items: center; justify-content: space-between; }
.account-label { color: var(--color-text-tertiary); font-size: 12px; margin-bottom: 4px; }
.action-card { cursor: pointer; font-size: 14px; }

.hero-section {
  text-align: center;
  padding: 32px 0 16px;
}
.hero-title {
  font-size: 32px;
  font-weight: 700;
  margin: 0;
}
.hero-subtitle {
  font-size: 16px;
  color: var(--color-text-secondary);
  margin: 8px 0 0;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 12px;
}

.intro-text {
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.tech-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.tech-tag {
  display: inline-block;
  padding: 4px 12px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  border: 0.5px solid var(--color-border);
}

.version-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
}
.version-value {
  color: var(--color-text-secondary);
}

</style>
