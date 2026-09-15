import type {
  NavigationGuard,
  NavigationGuardWithThis,
  NavigationHookAfter,
  Router,
} from 'vue-router'
import { useUserStore } from '@/stores/user'
import { LAST_VISITED_KEY } from '@/utils/storage'
import { isAxiosError } from 'axios'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'

const whiteList = ['/login']
// 不该被"记住"的页面：登录页、404 不能成为下次登录的落脚点
const UNTRACKED_PATHS = ['/login', '/404']
// 关闭进度条选择圈
NProgress.configure({ showSpinner: false })

// 认证守卫
export const authGuard: NavigationGuardWithThis<undefined> = async (to) => {
  // 拿到仓库
  const userStore = useUserStore()

  // 已登录 不再返回登录页
  if (to.path === '/login' && userStore.token) {
    return localStorage.getItem(LAST_VISITED_KEY) || '/'
  }
  // 白名单直接放行
  if (whiteList.includes(to.path)) {
    return true
  }
  // 未登录 → 去登录页，并记录"本来想去哪"
  if (!userStore.token) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  // 已登录但用户信息还没恢复（刷新场景）→ 拉取
  if (!userStore.userInfo) {
    try {
      await userStore.fetchUserInfo()
    } catch (error) {
      // 只有 token 真失效才踢出登录；网络类错误不误伤用户
      if (isAxiosError(error) && error.response?.status === 401) {
        userStore.logout()
        return { path: '/login', query: { redirect: to.fullPath } }
      }
    }
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
