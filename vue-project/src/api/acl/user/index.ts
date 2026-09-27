// 用户管理接口统一出口（前端页面在 views/acl/user，API 层按同样的目录约定归位）
import request from '@/utils/request'
import type {
  CreateUserRequest,
  UpdateUserByAdminRequest,
  UserListParams,
  UserListResponse,
  UserRow,
} from './type'

const BASE_URL = '/user'

// 分页列表（支持用户名/手机号双字段搜索）
export const getUserList = (params: UserListParams) =>
  request.get<UserListResponse>(BASE_URL, { params })

// 新增用户
export const createUser = (data: CreateUserRequest) => request.post<UserRow>(BASE_URL, data)

// 管理端白名单更新（展示名 / 描述 / 角色）
export const updateUser = (id: string, data: UpdateUserByAdminRequest) =>
  request.patch<UserRow>(`${BASE_URL}/${id}`, data)

// 删除用户
export const deleteUser = (id: string) => request.delete<null>(`${BASE_URL}/${id}`)
