import type { Request, Response } from 'express'
import type { AuthRequest } from '../middlewares/auth.js'
import { AppError } from '../utils/AppError.js'
import { ok } from '../utils/respond.js'
import * as roleService from '../services/role.js'

// 处理层：角色管理接口（列表 / 新增 / 更新 / 删除）

// ---- 角色管理 ----

export async function listRole(req: Request, res: Response) {
  const page = Number(req.query.page) || 1
  const pageSize = Number(req.query.pageSize) || 10
  const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : undefined

  const data = await roleService.listRole({ page, pageSize, keyword })
  ok(res, data)
}

export async function createRole(req: Request, res: Response) {
  const { roleName, remark } = (req.body ?? {}) as Record<string, unknown>

  if (typeof roleName !== 'string' || !roleName.trim()) {
    throw AppError.badRequest('角色不能为空')
  }
  if (remark !== undefined && typeof remark !== 'string') {
    throw AppError.badRequest('描述格式不合法')
  }

  const data = await roleService.createRole(roleName, remark)
  ok(res, data, '新增成功')
}

export async function updateRole(req: Request, res: Response) {
  const id = req.params.id
  if (!id || Array.isArray(id)) {
    throw AppError.badRequest('缺少角色 id')
  }

  const data = await roleService.updateRole(id, (req.body ?? {}) as Record<string, unknown>)
  ok(res, data, '更新成功')
}

export async function deleteRole(req: AuthRequest, res: Response) {
  const id = req.params.id
  if (!id || Array.isArray(id)) {
    throw AppError.badRequest('缺少角色 id')
  }

  await roleService.deleteRole(id)
  ok(res, null, '删除成功')
}
