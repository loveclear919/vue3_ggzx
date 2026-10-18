import type { Request, Response } from 'express'
import { AppError } from '../utils/AppError.js'
import { ok } from '../utils/respond.js'
import * as authService from '../services/auth.js'
import { getUserRbac } from '../services/rbac.js'

// 处理层：解析请求参数 → 调用业务层 → 组装响应
// 字段存在性属于"请求形状"校验，放在这里；业务规则（防枚举、密码比对）在 service

// 登录/注册响应在 DTO 边界合并聚合结果（Set → 数组）：
// perms 供前端 v-permission/守卫判权，routes 供前端动态注册路由与渲染菜单
export async function register(req: Request, res: Response) {
  const { phone, password } = req.body

  if (!phone || !password) {
    throw AppError.badRequest('手机号和密码不能为空')
  }

  const data = await authService.register(phone, password)
  const { perms, routes } = await getUserRbac(data.user.userId)
  ok(res, { token: data.token, user: { ...data.user, perms: [...perms], routes } }, '注册成功')
}

export async function login(req: Request, res: Response) {
  const { phone, password } = req.body

  if (!phone || !password) {
    throw AppError.badRequest('手机号和密码不能为空')
  }

  const data = await authService.login(phone, password)
  const { perms, routes } = await getUserRbac(data.user.userId)
  ok(res, { token: data.token, user: { ...data.user, perms: [...perms], routes } }, '登录成功')
}
