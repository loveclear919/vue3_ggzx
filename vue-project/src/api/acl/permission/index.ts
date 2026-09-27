// 权限管理接口统一出口
import request from '@/utils/request'
import type { PermissionRow, CreatePermissionRequest, UpdatePermissionRequest } from './type'

const BASE_URL = '/permission'

// 获取权限
export const getPermissionList = () => request.get<PermissionRow[]>(BASE_URL)

// 新增
export const createPermission = (data: CreatePermissionRequest) =>
  request.post<PermissionRow>(BASE_URL, data)
// 白名单修改
export const updatePermission = (id: string, data: UpdatePermissionRequest) =>
  request.patch<PermissionRow>(`${BASE_URL}/${id}`, data)
// 删除
export const deletePermission = (id: string) => request.delete<null>(`${BASE_URL}/${id}`)

// 同层交换排序（上移/下移）
export const swapPermission = (id: string, targetId: string) =>
  request.patch<null>(`${BASE_URL}/${id}/swap`, { targetId })
