// 权限管理模块（v2 契约：perms 权限标识 + path/component/icon/hidden 路由元数据）

export interface PermissionRow {
  permissionId: string
  name: string
  perms: string // 权限标识：菜单页 'user:list'、按钮 'user:create'；分组/根节点为 ''
  type: 'menu' | 'button'
  parentId: string | null
  sortIndex: number
  path: string // menu 专用：路由地址（'/acl/users'）；按钮/根节点为 ''
  component: string // menu 叶子专用：组件路径（'acl/user/index'）；分组/按钮为 ''
  icon: string // menu 专用：图标名
  hidden: boolean // menu 专用：不渲染菜单但可直达
  createdAt: string
  updatedAt: string
}

// 新增请求参数
export interface CreatePermissionRequest {
  parentId: string | null
  name: string
  perms: string
  type: 'menu' | 'button'
  sortIndex?: number
  path?: string
  component?: string
  icon?: string
  hidden?: boolean
}

// 修改请求参数（perms/path 等全字段可编辑 —— 若依式，纠错直接改）
export interface UpdatePermissionRequest {
  name?: string
  perms?: string
  path?: string
  component?: string
  icon?: string
  hidden?: boolean
  sortIndex?: number
  parentId?: string | null
}
