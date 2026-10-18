import 'vue-router'

// 声明合并：给 vue-router 的 RouteMeta 接口"追加"我们自己的字段
declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    icon?: string
    hidden?: boolean
  }
}
