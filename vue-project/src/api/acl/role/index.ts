// 角色管理接口统一出口
import request from '@/utils/request'
import type {
  RoleListParams,
  RoleListResponse,
  RoleRow,
  CreateRoleRequest,
  UpdateRoleRequest,
} from './type'

const BASE_URL = '/role'

// 分页列表（用户管理的角色标签映射 / 角色分配抽屉共用）
export const getRoleList = (params: RoleListParams) =>
  request.get<RoleListResponse>(BASE_URL, { params })

// 新增
export const createRole = (data: CreateRoleRequest) => request.post<RoleRow>(BASE_URL, data)
// 白名单修改
export const updateRole = (id: string, data: UpdateRoleRequest) =>
  request.patch<RoleRow>(`${BASE_URL}/${id}`, data)
// 删除
export const deleteRole = (id: string) => request.delete<null>(`${BASE_URL}/${id}`)
