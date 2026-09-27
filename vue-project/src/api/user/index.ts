// 统一管理「当前用户」相关接口（登录注册 / 个人信息 / 修改密码）；用户管理接口见 api/acl/user
import request from '@/utils/request'
import type {
  AuthResponse,
  ChangePasswordRequest,
  LoginRequest,
  UpdateUserRequest,
  UserInfo,
} from './type'

enum Api {
  LOGIN = '/auth/login',
  REGISTER = '/auth/register',
  USER_INFO = '/user/info',
  USER_PASSWORD = '/user/password',
}

// 登录 / 注册
export const login = (data: LoginRequest) => request.post<AuthResponse>(Api.LOGIN, data)
export const register = (data: LoginRequest) => request.post<AuthResponse>(Api.REGISTER, data)

// 当前用户信息（路由守卫刷新恢复用）
export const getUserInfo = () => request.get<UserInfo>(Api.USER_INFO)

// 个人资料白名单更新（头像 / 展示名）
export const updateUserInfo = (data: UpdateUserRequest) =>
  request.patch<UserInfo>(Api.USER_INFO, data)

// 修改密码（独立端点：原密码校验）
export const changePassword = (data: ChangePasswordRequest) =>
  request.patch<null>(Api.USER_PASSWORD, data)
