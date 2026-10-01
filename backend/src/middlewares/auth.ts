import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { AppError } from '../utils/AppError.js'

// 扩展 Express Request 类型，让下游能拿到 req.userId
export interface AuthRequest extends Request {
  userId?: string
  // requirePermission 聚合后挂在 req 上
  permissionCodes?: Set<string>
}

export function auth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  const BEARER_PREFIX = 'Bearer '

  if (!header || !header.startsWith(BEARER_PREFIX)) {
    throw AppError.unauthorized('未登录，请先登录')
  }

  const token = header.slice(BEARER_PREFIX.length)
  if (!token) {
    throw AppError.unauthorized('Token 无效')
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string }
    req.userId = payload.userId
    next()
  } catch {
    throw AppError.unauthorized('Token 无效或已过期')
  }
}
