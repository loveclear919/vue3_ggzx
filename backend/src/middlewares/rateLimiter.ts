import { rateLimit } from 'express-rate-limit'
import { AppError } from '../utils/AppError.js'

export const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min 窗口
  limit: 5, // 限流5次
  standardHeaders: 'draft-8', // 响应带标准 RateLimit-* 头
  legacyHeaders: false, // 不返回旧的 X-RateLimit-* 头
  ipv6Subnet: 56, // 设置 IPv6 子网前缀长度
  handler: (_req, _res, next) => next(AppError.tooManyRequests()), // 达到限制后运行的功能 为了复用统一错误处理，保持响应格式一致
}) 