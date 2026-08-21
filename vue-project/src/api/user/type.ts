// 用户模块请求/响应类型

// 登录 / 注册请求参数
export interface LoginRequest {
  username: string
  password: string
}

// 用户信息 — 与后端 toUserDTO 返回结构对齐
export interface UserInfo {
  userId: string
  username: string
  avatar: string
  desc: string
  roles: string[]
  buttons: string[]
  routes: string[]
}

// 登录 / 注册返回数据
export interface AuthResponse {
  token: string
  user: UserInfo
}

// 更新用户信息请求参数 — 后端目前只开放 avatar 字段
export interface UpdateUserRequest {
  avatar: string
}
