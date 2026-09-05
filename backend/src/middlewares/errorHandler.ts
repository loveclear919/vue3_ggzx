import { Request, Response, NextFunction } from 'express'
import { AppError } from '../utils/AppError.js'

// Express 约定的错误处理中间件，必须有四个参数，且第一个参数是错误对象
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

  // 5. multer 上传错误（文件超限等）
  if (e.name === 'MulterError') {
    const code = (err as { code?: string }).code
    const message = code === 'LIMIT_FILE_SIZE' ? '图片大小不能超过 2MB' : '文件上传失败'
    res.status(400).json({ code: 400, message })
    return
  }

  // 5. 兜底：一切未预期错误
  res.status(500).json({ code: 500, message: '服务器内部错误' })
}

