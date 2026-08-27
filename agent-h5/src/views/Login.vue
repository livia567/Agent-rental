<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { post } from '../utils/request'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const mode = ref<'login' | 'register'>('login')
const username = ref('')
const password = ref('')
const loading = ref(false)

async function submit() {
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username.value) || password.value.length < 6) {
    return showToast('用户名为3-32位字母、数字或下划线，密码至少6位')
  }

  loading.value = true
  try {
    const data = await post<{ token: string; user: { id: number; username: string } }>(
      `/auth/${mode.value}`, { username: username.value, password: password.value },
    )
    //保存Token和用户信息到 Store + localStorage
    auth.setAuth(data)
    router.replace((route.query.redirect as string) || '/')
  } catch (err: any) {
    showToast(err.response?.data?.error || '请求失败，请重试')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-panel">
      <div class="brand">租房避坑</div>
      <p class="subtitle">合同智能评审与风险记录</p>

      <van-tabs v-model:active="mode" shrink>
        <van-tab title="登录" name="login" />
        <van-tab title="注册" name="register" />
      </van-tabs>

      <van-cell-group inset class="form">
        <van-field v-model="username" label="用户名" placeholder="3-32位字母、数字或下划线" autocomplete="username" />
        <van-field v-model="password" label="密码" type="password" placeholder="至少6位" autocomplete="current-password" />
      </van-cell-group>
      <van-button block type="primary" :loading="loading" class="submit" @click="submit">
        {{ mode === 'login' ? '登录' : '注册并登录' }}
      </van-button>
    </section>
  </main>
</template>

<style scoped>
.login-page { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: var(--color-bg-secondary); }
.login-panel { width: min(100%, 360px); }
.brand { font-size: 28px; font-weight: 700; text-align: center; }
.subtitle { margin: 8px 0 28px; color: var(--color-text-secondary); text-align: center; font-size: 14px; }
.form { margin: 20px 0; }
.submit { margin-top: 8px; }
</style>
