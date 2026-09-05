import type { Response } from 'express'
import type { AuthRequest } from '../middlewares/auth.js'
import { AppError } from '../utils/AppError.js'
import { ok } from '../utils/respond.js'
import * as userService from '../services/user.js'

// 处理层：用户信息接口

// auth 中间件保证 userId 存在；这里再收窄一次是 TS 类型收窄 + 防御性编程
function requireUserId(req: AuthRequest): string {
  if (!req.userId) {
    throw AppError.unauthorized()
  }
  return req.userId
}

export async function getInfo(req: AuthRequest, res: Response) {
  const data = await userService.getUserById(requireUserId(req))
  ok(res, data)
}

export async function updateInfo(req: AuthRequest, res: Response) {
  const data = await userService.updateUserInfo(requireUserId(req), req.body)
  ok(res, data, '更新成功')
}
