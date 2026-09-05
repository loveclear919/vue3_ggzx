import type { Response } from 'express'

/** 统一成功响应信封：{ code: 200, data, message? } —— 与前端拦截器约定一致 */
export function ok<T>(res: Response, data: T, message?: string) {
  res.json({ code: 200, data, ...(message ? { message } : {}) })
}
