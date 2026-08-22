import { Request, Response, NextFunction } from 'express'
import { AppError } from '../utils/AppError.js'

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  console.error('未捕获的错误:', err) // 完整细节只进服务端日志

  const e = err as { name?: string; message?: string; type?: string; errors?: Record<string, { message: string }> }

  // 1. 我们主动抛出的预期错误（message 构造时即安全）
  if (err instanceof AppError) {
    res.status(err.status).json({ code: err.status, message: err.message, ...(err.code && { errorCode: err.code }) })
    return
  }

  // 2. Mongoose 校验错误 → 提取 Schema 中文提示
  if (e.name === 'ValidationError') {
    const message = Object.values(e.errors ?? {}).map((x) => x.message).join(';')
    res.status(400).json({ code: 400, message })
    return
  }

  // 3. 非法 ObjectId → 客户端参数问题
  if (e.name === 'CastError') {
    res.status(400).json({ code: 400, message: '参数格式不正确' })
    return
  }

  // 4. 请求体 JSON 解析失败
  if (e.type === 'entity.parse.failed') {
    res.status(400).json({ code: 400, message: '请求体 JSON 格式错误' })
    return
  }

  // 5. 兜底：一切未预期错误 → 通用文案，绝不吐内部细节
  res.status(500).json({ code: 500, message: '服务器内部错误' })
}

