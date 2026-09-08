import { User, toUserDTO } from '../models/User.js'
import { AppError } from '../utils/AppError.js'

// 业务层：用户信息的读取与更新

export async function getUserById(userId: string) {
  const user = await User.findById(userId)
  if (!user) {
    throw AppError.notFound('用户不存在')
  }
  return toUserDTO(user)
}

// 字段白名单 + 校验放在业务层：任何入口（HTTP / 定时任务 / 测试）都走同一套规则
export async function updateUserInfo(userId: string, body: Record<string, unknown>) {
  const allowed = ['avatar'] as const
  const updates: Record<string, string> = {}

  for (const key of allowed) {
    const val = body[key]
    if (val !== undefined) {
      if (typeof val !== 'string' || val.length > 500) {
        throw AppError.badRequest(`${key} 格式不合法`)
      }
      updates[key] = val
    }
  }

  if (Object.keys(updates).length === 0) {
    throw AppError.badRequest('没有需要更新的字段')
  }

  const user = await User.findByIdAndUpdate(userId, updates, {
    returnDocument: 'after',
    runValidators: true,
  })
  if (!user) {
    throw AppError.notFound('用户不存在')
  }

  return toUserDTO(user)
}
