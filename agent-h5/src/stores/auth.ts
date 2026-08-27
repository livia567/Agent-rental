import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export interface AuthUser {
  id: number
  username: string
}

const TOKEN_KEY = 'rental_token'
const USER_KEY = 'rental_user'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) || '')
  const user = ref<AuthUser | null>(JSON.parse(localStorage.getItem(USER_KEY) || 'null'))
  const isLoggedIn = computed(() => Boolean(token.value && user.value))

  function setAuth(data: { token: string; user: AuthUser }) {
    token.value = data.token
    user.value = data.user
    localStorage.setItem(TOKEN_KEY, data.token)
    localStorage.setItem(USER_KEY, JSON.stringify(data.user))
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  return { token, user, isLoggedIn, setAuth, logout }
})
