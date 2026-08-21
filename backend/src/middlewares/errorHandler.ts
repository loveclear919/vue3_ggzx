import { Request, Response, NextFunction } from 'express'

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  console.error('未捕获的错误:', err)

  // Mongoose 校验错误 → 提取 Schema 里定义的中文提示
  if (typeof err === 'object' && err !== null && (err as { name?: string }).name === 'ValidationError') {
    const { errors } = err as { errors: Record<string, { message: string }> }
    const message = Object.values(errors)
      .map((e) => e.message)
      .join('；')
    res.status(400).json({ code: 400, message })
    return
  }

  const status =
    typeof err === 'object' && err !== null ? (err as { status?: number }).status || 500 : 500
  const message =
    typeof err === 'object' && err !== null
      ? (err as { message?: string }).message || '服务器内部错误'
      : '服务器内部错误'

  res.status(status).json({
    code: status,
    message,
  })
}
