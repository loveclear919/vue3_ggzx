import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

// 扩展 Express Request 类型，让下游能拿到 req.userId
export interface AuthRequest extends Request {
  userId?: string
}

export function auth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization

  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ code: 401, message: '未登录，请先登录' })
    return
  }

  const token = header.slice(7)
  if (!token) {
    res.status(401).json({
      code: 401,
      message: 'Token 无效',
    })
    return
  }

  try {
    const payload = jwt.verify(token!, process.env.JWT_SECRET!) as { userId: string }
    req.userId = payload.userId
    next()
  } catch {
    res.status(401).json({ code: 401, message: 'Token 无效或已过期' })
  }
}
