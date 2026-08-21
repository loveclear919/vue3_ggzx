// 统一管理用户相关接口
import request from '@/utils/request'
import type { AuthResponse, LoginRequest, UpdateUserRequest, UserInfo } from './type'

enum Api {
  LOGIN = '/auth/login',
  REGISTER = '/auth/register',
  USER_INFO = '/user/info',
}

// 暴露请求函数
export const login = (data: LoginRequest) => request.post<AuthResponse>(Api.LOGIN, data)
export const register = (data: LoginRequest) => request.post<AuthResponse>(Api.REGISTER, data)
export const getUserInfo = () => request.get<UserInfo>(Api.USER_INFO)
export const updateUserInfo = (data: UpdateUserRequest) =>
  request.patch<UserInfo>(Api.USER_INFO, data)
