import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { User, toUserDTO } from '../models/User.js'
import { AppError } from '../utils/AppError.js'
import { isDuplicateKeyError } from '../utils/mongoError.js'

// 业务层：注册 / 登录的完整业务逻辑（查库、bcrypt、JWT）
// controller 只做参数解析与响应组装，不碰业务规则

export async function register(username: string, password: string) {
  try {
    const user = await User.create({ username, password })
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET!, { expiresIn: '7d' })

    return { token, user: toUserDTO(user) }
  } catch (err) {
    // Mongo 11000 重复键错误 → 转成预期错误
    if (isDuplicateKeyError(err)) {
      throw AppError.conflict('用户名已存在')
    }
    throw err
  }
}

export async function login(username: string, password: string) {
  // select('+password') 因为模型里设了 select: false
  const user = await User.findOne({ username }).select('+password')
  // 用户不存在与密码错误用同一文案，防止用户枚举
  if (!user) {
    throw AppError.unauthorized('用户名或密码错误')
  }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    throw AppError.unauthorized('用户名或密码错误')
  }

  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET!, { expiresIn: '7d' })

  return { token, user: toUserDTO(user) }
}
