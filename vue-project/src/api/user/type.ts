// 用户模块（登录 / 个人资料）请求/响应类型

// 登录 / 注册请求参数 —— 手机号是登录凭据（username 只是展示名）
export interface LoginRequest {
  phone: string
  password: string
}

// 后端下发路由表节点（与 backend services/rbac.ts 的 MenuRouteNode 对齐）：
// 授权菜单树的 DTO —— 前端动态注册路由与渲染菜单的单一数据源
export interface MenuRouteNode {
  path: string
  title: string
  icon: string
  hidden: boolean
  component: string // '' = 分组菜单
  children?: MenuRouteNode[]
}

// 用户信息 — 与后端登录/getInfo 响应对齐（perms 与 routes 为 RBAC 聚合结果，后端合并下发）
export interface UserInfo {
  userId: string
  username: string
  phone: string
  avatar: string
  desc: string
  roles: string[] // 角色 id 数组
  perms: string[] // 权限标识集合（v-permission / 守卫 /screen 判权共用）
  routes: MenuRouteNode[] // 授权菜单路由树（动态注册 + 菜单渲染共用）
}

// 登录 / 注册返回数据
export interface AuthResponse {
  token: string
  user: UserInfo
}

// 更新用户信息请求参数 — 本人只能改头像与展示名（username）；不含 roles（防自我提权）、不含 phone（登录凭据）
export interface UpdateUserRequest {
  avatar?: string
  username?: string
}

// 修改密码请求参数（独立端点：需原密码校验，不并入资料白名单）
export interface ChangePasswordRequest {
  oldPassword: string
  newPassword: string
}
