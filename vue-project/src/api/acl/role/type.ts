// 角色管理模块请求/响应类型

// 角色对象 — 与后端 toRoleDTO 返回结构对齐
export interface RoleRow {
  roleId: string
  roleName: string
  remark?: string
  permissions: string[]
  createdAt: string // ISO 字符串
  updatedAt: string // ISO 字符串
}

// 列表查询参数
export interface RoleListParams {
  page: number
  pageSize: number
  keyword?: string
}

// 列表返回数据
export interface RoleListResponse {
  list: RoleRow[]
  total: number
}

// 新增请求参数
export interface CreateRoleRequest {
  roleName: string
  remark?: string
}
// 修改请求参数（白名单：roleName / remark / permissions —— 空数组 = 撤销全部权限）
export interface UpdateRoleRequest {
  roleName?: string
  remark?: string
  permissions?: string[]
}
