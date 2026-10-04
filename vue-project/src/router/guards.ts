import type {
  NavigationGuard,
  NavigationGuardWithThis,
  NavigationHookAfter,
  Router,
} from 'vue-router'
import { useUserStore } from '@/stores/user'
import { usePermissionStore } from '@/stores/permission'
import { LAST_VISITED_KEY, TOKEN_KEY } from '@/utils/storage'
import { findLandingPath, isPathAccessible } from '@/utils/routeAccess'
import { isAxiosError } from 'axios'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'

const whiteList = ['/login']
// fail-open 提示去重：网络错误连续发生时不重复轰炸，成功后复位
let warnedInfoFetchFailure = false
// 不该被"记住"的页面：登录页、404 不能成为下次登录的落脚点
const UNTRACKED_PATHS = ['/login', '/404']
// 关闭进度条选择圈
NProgress.configure({ showSpinner: false })

// 认证守卫
export const authGuard: NavigationGuardWithThis<undefined> = async (to) => {
  // 拿到仓库
  const userStore = useUserStore()
  const permissionStore = usePermissionStore()

  const hasToken = () => !!localStorage.getItem(TOKEN_KEY)

  // 已登录 不再返回登录页：恢复点若已无权限（角色被改/换账号），回退到第一个可达菜单（R15）
  if (to.path === '/login' && hasToken()) {
    const last = localStorage.getItem(LAST_VISITED_KEY) || ''
    const lastPath = last.split('?')[0]
    if (userStore.userInfo) {
      // HMR 等极端场景兜底：userInfo 在但菜单表还没构建
      if (permissionStore.routes.length === 0) {
        permissionStore.buildMenuRoutes(userStore.userInfo.codes)
      }
      if (lastPath && !isPathAccessible(lastPath, permissionStore.routes)) {
        return findLandingPath(permissionStore.routes, userStore.userInfo.codes) || '/'
      }
    }
    // userInfo 未恢复（刷新直达登录页）：fail-open 先去，下一跳拉取后再判权
    return last || findLandingPath(permissionStore.routes, userStore.userInfo?.codes ?? []) || '/'
  }
  // 白名单直接放行
  if (whiteList.includes(to.path)) {
    return true
  }
  // 未登录 → 去登录页，并记录"本来想去哪"
  if (!hasToken()) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  // 已登录但用户信息还没恢复（刷新场景）→ 拉取
  if (!userStore.userInfo) {
    try {
      await userStore.fetchUserInfo()
      warnedInfoFetchFailure = false
    } catch (error) {
      // 只有 token 真失效才踢出登录；网络类错误不误伤用户（判权随之 fail-open）
      if (isAxiosError(error) && error.response?.status === 401) {
        userStore.logout()
        return { path: '/login', query: { redirect: to.fullPath } }
      }
      // fail-open 的代价是侧边栏可能为空：提示一次原因（连续失败不重复轰炸，成功拉取后复位）
      if (!warnedInfoFetchFailure) {
        warnedInfoFetchFailure = true
        ElMessage.warning('用户信息加载失败，菜单可能不完整，请稍后刷新重试')
      }
    }
  }

  // 判权：以 userInfo 存在为前提（拉取失败 fail-open —— 前端是体验层，安全边界在后端 403）
  const code = to.meta.code
  if (userStore.userInfo && code && !userStore.userInfo.codes.includes(code)) {
    // 恢复落脚点已无权限（如换低权限账号继承了 lastVisited）→ 回退可达菜单；
    // 手输 URL 越权 → 404（信息隐藏：不暴露资源存在性）
    const lastPath = (localStorage.getItem(LAST_VISITED_KEY) || '').split('?')[0]
    if (to.path === lastPath) {
      return findLandingPath(permissionStore.routes, userStore.userInfo.codes) ?? '/404'
    }
    return '/404'
  }
  // 一切正常，放行
  return true
}

// 记录最后访问页面（供下次登录恢复）
export const trackLastVisited: NavigationHookAfter = (to, _from, failure) => {
  if (failure) return // 导航失败不记录
  if (!UNTRACKED_PATHS.includes(to.path)) {
    localStorage.setItem(LAST_VISITED_KEY, to.fullPath)
  }
}

// 进度条启动：导航开始即触发
export const progressStart: NavigationGuard = () => {
  NProgress.start()
  return true
}

// 进度条结束：导航结束必达 —— 注意无论成功、重定向还是失败都会走到
export const progressDone: NavigationHookAfter = () => {
  NProgress.done()
}

// 页面标题：导航成功后更新浏览器标签
export const setPageTitle: NavigationHookAfter = (to, _from, failure) => {
  if (failure) return // 导航失败/被重定向时不动标题
  const siteTitle = import.meta.env.VITE_APP_TITLE
  document.title = to.meta.title ? `${to.meta.title} - ${siteTitle}` : siteTitle
}

// 统一注册入口：router 侧只调这一个函数
export function setupGuards(router: Router) {
  router.beforeEach(progressStart)
  router.beforeEach(authGuard)
  router.afterEach(trackLastVisited)
  router.afterEach(progressDone)
  router.afterEach(setPageTitle)
}
