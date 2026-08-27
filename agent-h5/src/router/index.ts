import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'Login', component: () => import('../views/Login.vue') },
  { path: '/', name: 'Home', component: () => import('../views/Home.vue'), meta: { requiresAuth: true } },
  { path: '/workshop', name: 'Workshop', component: () => import('../views/Workshop.vue'), meta: { requiresAuth: true } },
  { path: '/report', name: 'Report', component: () => import('../views/Report.vue'), meta: { requiresAuth: true } },
  { path: '/history', name: 'History', component: () => import('../views/History.vue'), meta: { requiresAuth: true } },
  { path: '/profile', name: 'Profile', component: () => import('../views/Profile.vue'), meta: { requiresAuth: true } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to) => {
  const loggedIn = Boolean(localStorage.getItem('rental_token'))
  if (to.meta.requiresAuth && !loggedIn) {
    return { name: 'Login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'Login' && loggedIn) return { name: 'Home' }
})

export default router
