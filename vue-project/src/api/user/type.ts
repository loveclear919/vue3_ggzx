// 用户模块（登录 / 个人资料）请求/响应类型

// 登录 / 注册请求参数 —— 手机号是登录凭据（username 只是展示名）
export interface LoginRequest {
  phone: string
  password: string
}

// 用户信息 — 与后端 toUserDTO 返回结构对齐
export interface UserInfo {
  userId: string
  username: string
  phone: string
  avatar: string
  desc: string
  roles: string[] // 角色 id 数组
  buttons: string[]
  routes: string[]
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
