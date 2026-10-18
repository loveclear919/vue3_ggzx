import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { RouteRecordRaw } from 'vue-router'
import router from '@/router'
import { homeRoute } from '@/router/routes'
import type { MenuRouteNode } from '@/api/user/type'
import { mapBackendRoutes } from '@/router/dynamicRoutes'

export const usePermissionStore = defineStore('permission', () => {
  // 菜单快照：归一化后的动态路由 + 首位静态首页。四个消费方同源：
  // 菜单渲染 / 守卫落地页 / 404 返回按钮 / 登录 redirect 可达性判定 —— 与注册表同数组，结构上不分叉
  const routes = ref<RouteRecordRaw[]>([])

  // 注册幂等标记：守卫据此判断「动态路由是否已挂上」
  const isRoutesAdded = ref(false)

  // addRoute 返回的移除函数
  let removeFns: Array<() => void> = []

  // 注册动态路由
  function addDynamicRoutes(records: RouteRecordRaw[]) {
    for (const r of records) removeFns.push(router.addRoute('layout', r))
    isRoutesAdded.value = true
  }

  // 摘除动态路由
  function removeDynamicRoutes() {
    for (const remove of removeFns.splice(0)) remove()
    isRoutesAdded.value = false
  }

  // 正常路径（登录 / fetchUserInfo / 403 自愈）：后端树 → 归一化 → 注册 + 快照（可重入：先摘后建）
  function buildRoutes(menuRoutes: MenuRouteNode[]) {
    removeDynamicRoutes()
    const dynamic = mapBackendRoutes(menuRoutes)
    addDynamicRoutes(dynamic)
    routes.value = [homeRoute, ...dynamic]
  }

  // 登出（手动 / 401 踢出 / 403 自愈前）：物理摘除动态路由 + 清快照 —— 下个账号看不到上个账号的菜单
  function reset() {
    removeDynamicRoutes()
    routes.value = []
  }

  return { routes, isRoutesAdded, buildRoutes, reset }
})
