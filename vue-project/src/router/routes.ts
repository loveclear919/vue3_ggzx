import type { RouteRecordRaw } from 'vue-router'

// 路由分两层：
// 静态壳：/login、/home、/screen、/404、layout、catch-all —— 前端承载，无需后端返回
// 动态路由：/acl、/product 子树 —— 登录后由后端路由表驱动注册（dynamicRoutes.ts + permission store）
// 静态页权限语义：home / screen 人人可见（放开判权定案，无权限门）

export const homeRoute: RouteRecordRaw = {
  path: '/home',
  name: 'home',
  component: () => import('@/views/home/index.vue'),
  meta: { title: '首页', icon: 'HomeFilled', hidden: false },
}

export const constantRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录', hidden: true },
  },
  {
    path: '/screen',
    name: 'screen',
    component: () => import('@/views/screen/index.vue'),
    // 权限门在守卫（hasPerm('screen:view')），不落 meta
    meta: { title: '数据大屏', hidden: true },
  },
  {
    path: '/',
    name: 'layout',
    component: () => import('@/layout/index.vue'),
    meta: { title: 'layout', hidden: true },
    // 静态子级只有首页；动态路由由 addRoute('layout', r) 挂入（permission store）
    children: [homeRoute],
    redirect: '/home',
  },
  {
    path: '/404',
    name: '404',
    component: () => import('@/views/404/index.vue'),
    meta: { title: '404', hidden: true },
  },
  {
    // catch-all 兜底：动态路由注册前，未知路径先重定向 404
    // 守卫用 to.redirectedFrom 取回原目标，注册完成后重放导航（见 guards.ts）
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    redirect: '/404',
    meta: { title: '未知', hidden: true },
  },
]
