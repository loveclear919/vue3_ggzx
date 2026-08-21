import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  login as loginApi,
  register as registerApi,
  getUserInfo as getUserInfoApi,
} from '@/api/user'
import type { UserInfo } from '@/api/user/type'

export const useUserStore = defineStore('user', () => {
  // ---- state ----
  // token 初始化时从 localStorage 读 — 刷新页面不丢登录态
  const token = ref(localStorage.getItem('token') || '')
  // 用户信息只存内存 — 刷新后靠 fetchUserInfo 重新拉
  const userInfo = ref<UserInfo | null>(null)

  // ---- getters ----
  const isLoggedIn = computed(() => !!token.value)

  // ---- actions ----
  async function login(username: string, password: string) {
    const res = await loginApi({ username, password })
    token.value = res.token
    localStorage.setItem('token', res.token)
    userInfo.value = res.user
  }

  async function register(username: string, password: string) {
    await registerApi({ username, password })
  }

  async function fetchUserInfo() {
    userInfo.value = await getUserInfoApi()
  }

  function logout() {
    token.value = ''
    userInfo.value = null
    localStorage.removeItem('token')
  }

  return { token, userInfo, isLoggedIn, login, register, fetchUserInfo, logout }
})
