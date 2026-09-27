// 权限管理模块

export interface PermissionRow {
  permissionId: string
  name: string
  code: string
  type: 'menu' | 'button'
  parentId: string | null
  sortIndex: number
  createdAt: string
  updatedAt: string
}

// 新增请求参数
export interface CreatePermissionRequest {
  parentId: string | null
  name: string
  code: string
  type: 'menu' | 'button'
  sortIndex?: number
}

// 修改请求参数
export interface UpdatePermissionRequest {
  name?: string
  sortIndex?: number
  parentId?: string | null
}
