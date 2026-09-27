// 用户管理模块请求/响应类型

// 用户管理行 — 与后端 toUserDTO 返回结构对齐
export interface UserRow {
  userId: string
  username: string
  phone: string
  avatar: string
  desc: string
  roles: string[] // 角色 id 数组（方案 A：展示时用角色列表做 id → 名称映射）
  createdAt: string // ISO 字符串
  updatedAt: string // ISO 字符串
}

// 列表查询参数
export interface UserListParams {
  page: number
  pageSize: number
  keyword?: string
}

// 列表返回数据
export interface UserListResponse {
  list: UserRow[]
  total: number
}

// 新增用户请求（管理端）：用户名自动生成默认值，可后续编辑
export interface CreateUserRequest {
  phone: string
  password: string
  desc?: string
  roles?: string[]
}

// 管理端更新白名单：只认 username（展示名）/ desc / roles —— phone 是身份（创建后不改），密码重置另行独立流程
export type UpdateUserByAdminRequest = Partial<Pick<UserRow, 'username' | 'desc' | 'roles'>>
