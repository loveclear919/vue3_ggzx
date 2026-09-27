import type { Request, Response } from 'express'
import type { AuthRequest } from '../middlewares/auth.js'
import { AppError } from '../utils/AppError.js'
import { ok } from '../utils/respond.js'
import * as userService from '../services/user.js'

// 处理层：用户信息接口（当前用户）+ 用户管理接口（列表 / 新增 / 更新 / 删除）

// auth 中间件保证 userId 存在；这里再收窄一次是 TS 类型收窄 + 防御性编程
function requireUserId(req: AuthRequest): string {
  if (!req.userId) {
    throw AppError.unauthorized()
  }
  return req.userId
}

export async function getInfo(req: AuthRequest, res: Response) {
  const data = await userService.getUserById(requireUserId(req))
  ok(res, data)
}

export async function updateInfo(req: AuthRequest, res: Response) {
  const data = await userService.updateUserInfo(requireUserId(req), req.body)
  ok(res, data, '更新成功')
}

export async function changePassword(req: AuthRequest, res: Response) {
  const { oldPassword, newPassword } = (req.body ?? {}) as Record<string, unknown>

  if (typeof oldPassword !== 'string' || !oldPassword) {
    throw AppError.badRequest('原密码不能为空')
  }
  if (typeof newPassword !== 'string' || !newPassword) {
    throw AppError.badRequest('新密码不能为空')
  }

  await userService.changePassword(requireUserId(req), oldPassword, newPassword)
  ok(res, null, '密码修改成功')
}

// ---- 用户管理 ----

export async function listUsers(req: Request, res: Response) {
  const page = Number(req.query.page) || 1
  const pageSize = Number(req.query.pageSize) || 10
  // Express 5 的 query 可能是数组（?keyword=a&keyword=b），收窄后再 trim
  const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : undefined

  const data = await userService.listUsers({ page, pageSize, keyword })
  ok(res, data)
}

export async function createUser(req: Request, res: Response) {
  const { phone, password, desc, roles } = (req.body ?? {}) as Record<string, unknown>

  if (typeof phone !== 'string' || !phone.trim()) {
    throw AppError.badRequest('手机号不能为空')
  }
  if (typeof password !== 'string' || !password) {
    throw AppError.badRequest('密码不能为空')
  }
  if (desc !== undefined && typeof desc !== 'string') {
    throw AppError.badRequest('描述格式不合法')
  }
  if (roles !== undefined && (!Array.isArray(roles) || roles.some((r) => typeof r !== 'string'))) {
    throw AppError.badRequest('角色格式不合法')
  }

  const data = await userService.createUser(phone, password, desc ?? '', roles ?? [])
  ok(res, data, '新增成功')
}

export async function updateUser(req: Request, res: Response) {
  const id = req.params.id
  if (!id || Array.isArray(id)) {
    throw AppError.badRequest('缺少用户 id')
  }

  const data = await userService.updateUser(id, (req.body ?? {}) as Record<string, unknown>)
  ok(res, data, '更新成功')
}

export async function deleteUser(req: AuthRequest, res: Response) {
  const id = req.params.id
  if (!id || Array.isArray(id)) {
    throw AppError.badRequest('缺少用户 id')
  }

  await userService.deleteUser(id, requireUserId(req))
  ok(res, null, '删除成功')
}
