import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  login as loginApi,
  register as registerApi,
  getUserInfo as getUserInfoApi,
} from '@/api/user'
import type { UserInfo } from '@/api/user/type'
import { TOKEN_KEY, clearToken } from '@/utils/storage'
import { usePermissionStore } from './permission'

export const useUserStore = defineStore('user', () => {
  // ---- state ----
  // token 初始化时从 localStorage 读 — 刷新页面不丢登录态
  const token = ref(localStorage.getItem(TOKEN_KEY) || '')
  // 用户信息只存内存 — 刷新后靠 fetchUserInfo 重新拉
  const userInfo = ref<UserInfo | null>(null)

  // ---- getters ----
  const isLoggedIn = computed(() => !!token.value)

  // 权限码判定收口：v-permission 指令 / 页面按钮禁用 / 抽屉选项禁用共用同一判定（userInfo 未恢复时视为无权限）
  const hasCode = (code: string) => userInfo.value?.codes.includes(code) ?? false

  // ---- actions ----
  async function login(phone: string, password: string) {
    const res = await loginApi({ phone, password })
    token.value = res.token
    localStorage.setItem(TOKEN_KEY, res.token)
    userInfo.value = res.user
    // 触发点收口在 store 内（登录不走守卫的 fetch 分支，只挂守卫会首屏空菜单）
    usePermissionStore().buildMenuRoutes(res.user.codes)
  }

  async function register(phone: string, password: string) {
    await registerApi({ phone, password })
  }

  async function fetchUserInfo() {
    userInfo.value = await getUserInfoApi()
    usePermissionStore().buildMenuRoutes(userInfo.value.codes)
    return userInfo.value
  }

  function logout() {
    token.value = ''
    userInfo.value = null
    clearToken()
    usePermissionStore().reset()
  }

  return { token, userInfo, isLoggedIn, hasCode, login, register, fetchUserInfo, logout }
})
