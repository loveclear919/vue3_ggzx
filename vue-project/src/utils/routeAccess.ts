import type { RouteRecordRaw } from 'vue-router'

// 可达性判定工具：基于「已按 codes 过滤的菜单路由表」（permissionStore.routes）
// 消费方：守卫（lastVisited 回退 / 判权）、登录落地、404 返回入口 —— 三处共用同一判定，杜绝口径漂移

// 第一个可访问的叶子菜单路径（过滤后的表里任何带 code 的叶子都可达）
export function findFirstAccessiblePath(list: RouteRecordRaw[]): string | null {
  for (const r of list) {
    if (r.children && r.children.length > 0) {
      const child = findFirstAccessiblePath(r.children)
      if (child) return child
    } else if (r.meta?.code) {
      return r.path
    }
  }
  return null
}

// 落脚页计算（登录落地 / 404 返回 / lastVisited 回退共用）：
// 先找过滤表内的可达叶子；表内没有时兜底检查 codes 是否含 '/screen' ——
// 大屏是**顶级独立路由**（不在 menuRoutes 过滤表内），不兜底会让「只勾大屏」的角色
// 登录落地 null → 404 死循环（R12 → R29 → R33 的最终解：兜底从「表内 fullscreen 叶子」改为「codes 直判」）
export function findLandingPath(list: RouteRecordRaw[], codes: string[]): string | null {
  return findFirstAccessiblePath(list) ?? (codes.includes('/screen') ? '/screen' : null)
}

// 路径（不含 query）是否在可达表内 —— 含 hidden 叶子（如 SKU：不渲染菜单但可直达）
export function isPathAccessible(path: string, list: RouteRecordRaw[]): boolean {
  for (const r of list) {
    if (r.children && r.children.length > 0) {
      if (isPathAccessible(path, r.children)) return true
    } else if (r.meta?.code && r.path === path) {
      return true
    }
  }
  return false
}
