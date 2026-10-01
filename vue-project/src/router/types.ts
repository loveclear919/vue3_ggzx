import 'vue-router'

// 声明合并：给 vue-router 的 RouteMeta 接口"追加"我们自己的字段
declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    icon?: string
    hidden?: boolean
    // RBAC 权限码：与后端权限树 code 对账（菜单过滤 / 守卫判权）。
    // 必须在这里声明而非靠 as 断言 —— meta 有 unknown 索引签名，写错成 meta.codes 时
    // 断言会静默通过，判权随之 fail-open 失效；声明后错拼会直接报类型错误
    code?: string
  }
}
