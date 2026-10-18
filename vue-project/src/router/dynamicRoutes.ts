import type { RouteRecordRaw, RouteComponent } from 'vue-router'
import type { MenuRouteNode } from '@/api/user/type'

// 后端路由表 → 注册路由（permission store 正常路径与 fail-open 兜底共用）。
// 组件映射约定：component 字符串 = 'views' 下相对路径（'acl/user/index' → ../views/acl/user/index.vue）；
// import.meta.glob 返回懒函数表 —— addRoute 只登记映射，组件 chunk 首次导航时才下载
const viewModules = import.meta.glob('../views/**/*.vue')

function resolveComponent(component: string): RouteComponent {
  const loader = viewModules[`../views/${component}.vue`]
  if (!loader) {
    console.warn(`[dynamicRoutes] 组件未注册：${component}`)
    return () => import('@/views/404/index.vue')
  }
  return loader as RouteComponent
}

// 权限树即路由树
// 分组（component=''）挂 children + redirect 首子；无组件且无子级 → 剔除 + dev 告警
export function mapBackendRoutes(tree: MenuRouteNode[]): RouteRecordRaw[] {
  const walk = (list: MenuRouteNode[]): RouteRecordRaw[] =>
    list.flatMap((n): RouteRecordRaw[] => {
      if (n.component) {
        return [
          {
            path: n.path,
            component: resolveComponent(n.component),
            meta: { title: n.title, icon: n.icon || undefined, hidden: n.hidden },
          },
        ]
      }
      const children = n.children?.length ? walk(n.children) : []
      if (children.length) {
        return [
          {
            path: n.path,
            redirect: children[0]!.path,
            meta: { title: n.title, icon: n.icon || undefined, hidden: n.hidden },
            children,
          },
        ]
      }
      console.warn(`[dynamicRoutes] 无组件且无子级的节点已跳过：${n.path}`)
      return []
    })
  return walk(tree)
}
