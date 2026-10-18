import type { Request, Response } from 'express'
import type { AuthRequest } from '../middlewares/auth.js'
import { AppError } from '../utils/AppError.js'
import { getParamId } from '../utils/paramId.js'
import { ok } from '../utils/respond.js'
import * as permissionServer from '../services/permission.js'

// 处理层：权限管理接口（列表 / 新增 / 更新 / 删除）

// ---- 权限管理 ----

export async function listPermissions(req: Request, res: Response) {
  const data = await permissionServer.listPermissions()
  ok(res, data)
}

export async function createPermission(req: Request, res: Response) {
  const { parentId, name, perms, type, sortIndex, path, component, icon, hidden } = (req.body ?? {}) as Record<
    string,
    unknown
  >
  if (parentId !== undefined && parentId !== null && typeof parentId !== 'string') {
    throw AppError.badRequest('父级格式不合法')
  }
  if (typeof name !== 'string' || !name) {
    throw AppError.badRequest('权限名格式不合法')
  }
  if (perms !== undefined && typeof perms !== 'string') {
    throw AppError.badRequest('权限标识格式不合法')
  }
  if (type !== 'button' && type !== 'menu') {
    throw AppError.badRequest('权限类型不合法')
  }
  if (sortIndex !== undefined && typeof sortIndex !== 'number') {
    throw AppError.badRequest('排序号必须是数字')
  }
  if (path !== undefined && typeof path !== 'string') {
    throw AppError.badRequest('路由地址格式不合法')
  }
  if (component !== undefined && typeof component !== 'string') {
    throw AppError.badRequest('组件路径格式不合法')
  }
  if (icon !== undefined && typeof icon !== 'string') {
    throw AppError.badRequest('图标名格式不合法')
  }
  if (hidden !== undefined && typeof hidden !== 'boolean') {
    throw AppError.badRequest('隐藏标记格式不合法')
  }

  const data = await permissionServer.createPermission(
    parentId ?? null,
    name,
    perms ?? '',
    type,
    sortIndex,
    { path, component, icon, hidden },
  )
  ok(res, data, '新增成功')
}

export async function updatePermission(req: Request, res: Response) {
  const id = getParamId(req, '缺少权限 id')

  const data = await permissionServer.updatePermission(
    id,
    (req.body ?? {}) as Record<string, unknown>,
  )
  ok(res, data, '更新成功')
}

export async function deletePermission(req: AuthRequest, res: Response) {
  const id = getParamId(req, '缺少权限 id')

  await permissionServer.deletePermission(id)
  ok(res, null, '删除成功')
}

export async function swapPermissionSort(req: Request, res: Response) {
  const id = getParamId(req, '缺少权限 id')
  const { targetId } = (req.body ?? {}) as Record<string, unknown>
  if (typeof targetId !== 'string' || !targetId) {
    throw AppError.badRequest('缺少目标权限 id')
  }

  await permissionServer.swapPermissionSort(id, targetId)
  ok(res, null, '排序已调整')
}
