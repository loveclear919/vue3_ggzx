// backend/src/utils/AppError.ts
export class AppError extends Error {
  readonly status: number
  readonly isOperational = true
  readonly code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
    // 生成堆栈跟踪信息，但从调用该构造函数的地方开始截取
    Error.captureStackTrace(this, this.constructor)
  }

  static badRequest(message: string, code?: string) { return new AppError(400, message, code) }
  static unauthorized(message = '未登录，请先登录') { return new AppError(401, message) }
  static forbidden(message = '没有权限') { return new AppError(403, message) }
  static notFound(message = '资源不存在') { return new AppError(404, message) }
  static conflict(message: string, code?: string) { return new AppError(409, message, code) }
  static tooManyRequests(message = "请求过于频繁, 请稍后再试") { return new AppError(429, message) }
}
