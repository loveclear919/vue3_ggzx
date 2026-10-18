import type { AxiosError } from 'axios'
import router from '@/router'
import type { SilentConfig } from './type'

// 报错请求中是否包含 silent: true（静默请求）
const silentOf = (error: AxiosError) => (error.config as SilentConfig | undefined)?.silent
// 后端返回的业务错误信息的地址
const urlOf = (error: AxiosError) => error.config?.url ?? ''
// 后端返回的业务错误信息文案
const backendMsgOf = (error: AxiosError) =>
  (error.response?.data as { message?: string } | undefined)?.message
// 判断请求是否是 /auth/ 前缀的登录/注册路径
const isAuthPath = (error: AxiosError) => urlOf(error).startsWith('/auth/')

// 401 去重标志：并发多请求同时 401 只处理一次，
let isHandling401 = false
// 403 去重标志：同思路
let isHandling403 = false

// 401：会话失效 —— 清状态 + 带 redirect 跳登录
export async function handleUnauthorized(error: AxiosError) {
  const backendMsg = backendMsgOf(error)
  if (isAuthPath(error)) {
    ElMessage.error(backendMsg || '登录失败')
    return
  }
  if (isHandling401) return
  isHandling401 = true
  try {
    // 动态 import 避免 request → stores/user → api/user → request 的静态循环引用
    const { useUserStore } = await import('@/stores/user')
    useUserStore().logout()
    ElMessage.error(backendMsg || '登录已过期，请重新登录')
    // 带 redirect：重新登录后回到原页面；replace 不让已失效页面留在历史栈
    const current = router.currentRoute.value
    const query = current.path === '/login' ? undefined : { redirect: current.fullPath }
    await router.replace({ path: '/login', query })
  } finally {
    isHandling401 = false
  }
}

// 403：权限被收回的即时自愈 —— 弹一次文案 → 静默重拉用户信息（buildRoutes 先摘后建，
// 路由/菜单收敛，按钮经 v-permission 的 updated 钩子随 perms 纠正）→ 当前页已不可达则踢回落地页
export async function handleForbidden(error: AxiosError) {
  const backendMsg = backendMsgOf(error)
  if (!silentOf(error)) {
    ElMessage.error(backendMsg || '没有操作权限')
  }
  if (isAuthPath(error)) {
    return
  }
  if (isHandling403) return
  isHandling403 = true
  try {
    const { useUserStore } = await import('@/stores/user')
    const { usePermissionStore } = await import('@/stores/permission')
    const { isPathAccessible, findLandingPath } = await import('@/utils/routeAccess')
    const userStore = useUserStore()
    await userStore.fetchUserInfo()
    const current = router.currentRoute.value
    const permissionStore = usePermissionStore()
    // /screen 静态恒可达（放开判权定案），不在动态快照内 —— 显式豁免，避免收权时被误踢
    const accessible =
      current.path === '/screen' || isPathAccessible(current.path, permissionStore.routes)
    if (!accessible) {
      // 落地页恒可达（/home 静态、无接口调用），不会触发 403 再循环
      await router.replace(findLandingPath(permissionStore.routes))
    }
  } catch {
    // 重拉失败（网络）静默放弃：不叠 toast，等下一次 403 或导航自然重试
  } finally {
    isHandling403 = false
  }
}

// 通用错误（其余 4xx / 5xx / 网络）：优先显示后端信息，没有才是网络/超时类错误
export function handleGeneric(error: AxiosError) {
  if (silentOf(error)) return
  ElMessage.error(backendMsgOf(error) || error.message || '网络错误')
}
