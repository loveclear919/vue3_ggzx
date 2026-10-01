import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { RouteRecordRaw } from 'vue-router'
import { menuRoutes as staticMenuRoutes } from '@/router/routes'

export const usePermissionStore = defineStore('permission', () => {
  // 过滤后的菜单路由：初始为空，登录/恢复用户信息后由 buildMenuRoutes 填充
  const routes = ref<RouteRecordRaw[]>([])

  // 菜单过滤：meta.code ∈ codes 才保留（父级无 code 但有存活子级则保留父 —— 防御性分支）
  function buildMenuRoutes(codes: string[]) {
    const codeSet = new Set(codes)
    const filter = (list: RouteRecordRaw[]): RouteRecordRaw[] =>
      list.flatMap((r) => {
        const code = r.meta?.code
        // 有 code 但无权限：整支剪掉（含子级 —— 子级可直达也不该绕过父级语义）
        if (code && !codeSet.has(code)) return []
        if (r.children && r.children.length > 0) {
          const children = filter(r.children)
          // 分组父级子级全灭时整组剔除：否则 children: [] 会被菜单组件当成叶子渲染成可点击项，
          // 点击后 redirect 到无权限子级 → 守卫 404。没有可进入页面的分组没有存在意义
          if (children.length === 0) return []
          return [{ ...r, children }]
        }
        return [r]
      })
    routes.value = filter(staticMenuRoutes)
  }

  // 登出清空：不残留上个账号的菜单
  function reset() {
    routes.value = []
  }

  return { routes, buildMenuRoutes, reset }
})
