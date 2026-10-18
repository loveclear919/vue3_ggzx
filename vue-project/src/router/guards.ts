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
import router from '@/router'
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

  // 已登录 不再返回登录页：先恢复 userInfo（顺带注册动态路由），再按可达性算落地
  if (to.path === '/login' && hasToken()) {
    if (!userStore.userInfo) {
      try {
        await userStore.fetchUserInfo()
        warnedInfoFetchFailure = false
      } catch (error) {
        // 只有 token 真失效才放行登录页；网络错误 fail-open（不注册动态路由，404 页兜底）
        if (isAxiosError(error) && error.response?.status === 401) {
          userStore.logout()
          return true
        }
        if (!warnedInfoFetchFailure) {
          warnedInfoFetchFailure = true
          ElMessage.warning('用户信息加载失败，请刷新重试')
        }
      }
    } else if (!permissionStore.isRoutesAdded) {
      // HMR 等极端场景兜底：userInfo 在但注册丢了 → 用内存路由表重建
      permissionStore.buildRoutes(userStore.userInfo.routes)
    }

    // 落地页计算：优先恢复上次访问页，否则按路由表找第一个可达页
    const last = localStorage.getItem(LAST_VISITED_KEY) || ''
    const lastPath = last.split('?')[0]
    if (lastPath && !isPathAccessible(lastPath, permissionStore.routes)) {
      return findLandingPath(permissionStore.routes)
    }
    return last || findLandingPath(permissionStore.routes)
  }

  // 白名单直接放行
  if (whiteList.includes(to.path)) {
    return true
  }

  // 未登录 → 去登录页，并记录"本来想去哪"
  if (!hasToken()) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  // 已登录但用户信息还没恢复（刷新场景）→ 拉取 + 注册动态路由
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
      if (!warnedInfoFetchFailure) {
        warnedInfoFetchFailure = true
        ElMessage.warning('用户信息加载失败，请刷新重试')
      }
    }
  } else if (!permissionStore.isRoutesAdded) {
    permissionStore.buildRoutes(userStore.userInfo.routes)
  }

  // 刷新后动态路由重新挂载 需要 404 重放
  if (to.name === '404' && to.redirectedFrom && permissionStore.isRoutesAdded) {
    const target = to.redirectedFrom
    const resolved = router.resolve(target)
    if (resolved.name !== 'not-found' && resolved.name !== '404') {
      return { path: target.path, query: target.query, hash: target.hash, replace: true }
    }
    // 注册后仍不可达：恢复落脚点已无权限 → 回退第一个可达菜单
    const lastPath = (localStorage.getItem(LAST_VISITED_KEY) || '').split('?')[0]
    if (target.path === lastPath) {
      return findLandingPath(permissionStore.routes)
    }
    return true
  }

  // 判权收窄：菜单路由由注册表物理拦截（无权即未注册）；静态页 home / screen 人人可见（放开判权定案）
  return true
}

// 记录最后访问页面
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

// 统一注册入口
export function setupGuards(router: Router) {
  router.beforeEach(progressStart)
  router.beforeEach(authGuard)
  router.afterEach(trackLastVisited)
  router.afterEach(progressDone)
  router.afterEach(setPageTitle)
}
