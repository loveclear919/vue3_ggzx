import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { User, toUserDTO } from '../models/User.js'
import { AppError } from '../utils/AppError.js'
import * as userService from './user.js'

// 业务层：注册 / 登录的完整业务逻辑（查库、bcrypt、JWT）
// controller 只做参数解析与响应组装，不碰业务规则

// 注册 = 创建一个普通用户 + 签发 token。
export async function register(phone: string, password: string) {
  // roles 传空数组：createUser 内部兜底分配默认「普通用户」角色（按名查角色文档拿 id）
  const user = await userService.createUser(phone, password, '', [])
  const token = jwt.sign({ userId: user.userId }, process.env.JWT_SECRET!, { expiresIn: '2h' })

  return { token, user }
}

export async function login(phone: string, password: string) {
  // select('+password') 因为模型里设了 select: false
  const user = await User.findOne({ phone }).select('+password')
  // 用户不存在与密码错误用同一文案，防止用户枚举
  if (!user) {
    throw AppError.unauthorized('手机号或密码错误')
  }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    throw AppError.unauthorized('手机号或密码错误')
  }

  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET!, { expiresIn: '2h' })

  return { token, user: toUserDTO(user) }
}
