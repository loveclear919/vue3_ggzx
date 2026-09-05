import type { Request, Response } from 'express'
import { AppError } from '../utils/AppError.js'
import { ok } from '../utils/respond.js'
import * as authService from '../services/auth.js'

// 处理层：解析请求参数 → 调用业务层 → 组装响应
// 字段存在性属于"请求形状"校验，放在这里；业务规则（防枚举、密码比对）在 service

export async function register(req: Request, res: Response) {
  const { username, password } = req.body

  if (!username || !password) {
    throw AppError.badRequest('用户名和密码不能为空')
  }

  const data = await authService.register(username, password)
  ok(res, data, '注册成功')
}

export async function login(req: Request, res: Response) {
  const { username, password } = req.body

  if (!username || !password) {
    throw AppError.badRequest('用户名和密码不能为空')
  }

  const data = await authService.login(username, password)
  ok(res, data, '登录成功')
}
