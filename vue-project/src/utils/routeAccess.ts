import type { RouteRecordRaw } from 'vue-router'

// 可达性判定工具

// 找到第一个可访问的叶子菜单路径
export function findFirstAccessiblePath(list: RouteRecordRaw[]): string | null {
  for (const r of list) {
    if (r.children && r.children.length > 0) {
      return findFirstAccessiblePath(r.children)
    }
    return r.path
  }
  return null
}

// 落脚页计算：首位恒为静态首页（home 人人可达） —— 不存在 null 死循环
export function findLandingPath(list: RouteRecordRaw[]): string {
  return findFirstAccessiblePath(list) ?? '/home'
}

// 路径（不含 query）是否在可达表内 —— 含 hidden 叶子（如 SKU：不渲染菜单但可直达）
export function isPathAccessible(path: string, list: RouteRecordRaw[]): boolean {
  for (const r of list) {
    if (r.children && r.children.length > 0) {
      if (isPathAccessible(path, r.children)) return true
    } else if (r.path === path) {
      return true
    }
  }
  return false
}
