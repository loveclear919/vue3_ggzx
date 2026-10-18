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

  // 权限标识判定收口：v-permission 指令 / 页面按钮禁用 / 抽屉选项禁用共用同一判定（userInfo 未恢复时视为无权限）
  const hasPerm = (perms: string) => userInfo.value?.perms.includes(perms) ?? false

  // ---- actions ----
  async function login(phone: string, password: string) {
    const res = await loginApi({ phone, password })
    token.value = res.token
    localStorage.setItem(TOKEN_KEY, res.token)
    userInfo.value = res.user
    // 触发点收口在 store 内（登录不走守卫的 fetch 分支）：后端路由树 → 注册 + 菜单快照
    usePermissionStore().buildRoutes(res.user.routes)
  }

  async function register(phone: string, password: string) {
    await registerApi({ phone, password })
  }

  async function fetchUserInfo() {
    userInfo.value = await getUserInfoApi()
    usePermissionStore().buildRoutes(userInfo.value.routes)
    return userInfo.value
  }

  function logout() {
    token.value = ''
    userInfo.value = null
    clearToken()
    // reset 顺带物理摘除动态路由 —— 下个账号登录时按自己的路由表重建
    usePermissionStore().reset()
  }

  return { token, userInfo, isLoggedIn, hasPerm, login, register, fetchUserInfo, logout }
})
