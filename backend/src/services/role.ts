import { Role, toRoleDTO } from '../models/Role.js'
import { Permission } from '../models/Permission.js'
import { AppError } from '../utils/AppError.js'
import mongoose from 'mongoose'
import { escapeRegExp } from '../utils/escapeRegExp.js'
import { normalizePage } from '../utils/pagination.js'
import { isDuplicateKeyError } from '../utils/mongoError.js'
import { User } from '../models/User.js'

// 业务层：角色管理（列表 / 新增 / 更新 / 删除）

// ---- 角色管理 ----

export interface ListRolesParams {
  page: number
  pageSize: number
  keyword?: string
}

// 分页列表 + 角色名字段搜索
export async function listRole({ page, pageSize, keyword }: ListRolesParams) {
  const { page: safePage, pageSize: safeSize } = normalizePage(page, pageSize)
  const filter: { $or?: Array<Record<string, unknown>> } = {}
  if (keyword) {
    const re = { $regex: escapeRegExp(keyword), $options: 'i' }
    filter.$or = [{ roleName: re }]
  }

  const [list, total] = await Promise.all([
    Role.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeSize)
      .limit(safeSize),
    Role.countDocuments(filter),
  ])
  return { list: list.map(toRoleDTO), total }
}

// 新增
export async function createRole(roleName: string, remark?: string) {
  // 校验
  if (!roleName) {
    throw AppError.badRequest('角色名不能为空')
  }

  try {
    const role = await Role.create({
      roleName,
      remark,
    })
    return toRoleDTO(role)
  } catch (err) {
    if (isDuplicateKeyError(err, 'roleName')) {
      throw AppError.conflict('该角色名已被占用，请更换角色名')
    }
    throw err
  }
}

// 权限 id 校验：去重 → 格式 → 值域。
async function validatePermissionIds(permissions: string[]): Promise<string[]> {
  const unique = [...new Set(permissions)]
  for (const id of unique) {
    if (!mongoose.isValidObjectId(id)) {
      throw AppError.badRequest('权限格式不合法')
    }
  }
  if (unique.length > 0) {
    const count = await Permission.countDocuments({ _id: { $in: unique } })
    if (count !== unique.length) {
      throw AppError.badRequest('权限不存在')
    }
  }
  return unique
}

// 修改
// （内置角色不可修改等特权判断推迟到 RBAC 模块统一做）
export async function updateRole(id: string, body: Record<string, unknown>) {
  // 白名单
  const patch: Record<string, unknown> = {}
  if (body.roleName !== undefined) {
    if (typeof body.roleName !== 'string') {
      throw AppError.badRequest('角色名格式不合法')
    }
    patch.roleName = body.roleName.trim()
  }
  if (body.remark !== undefined) {
    if (typeof body.remark !== 'string') {
      throw AppError.badRequest('描述格式不合法')
    }
    patch.remark = body.remark.trim()
  }
  if (body.permissions !== undefined) {
    if (!Array.isArray(body.permissions) || body.permissions.some((p) => typeof p !== 'string')) {
      throw AppError.badRequest('权限格式不合法')
    }
    // 分配权限抽屉提交：空数组 = 撤销全部权限，合法
    patch.permissions = await validatePermissionIds(body.permissions)
  }
  if (Object.keys(patch).length === 0) {
    throw AppError.badRequest('没有需要更新的字段')
  }
  try {
    const role = await Role.findByIdAndUpdate(id, patch, {
      returnDocument: 'after',
      runValidators: true,
    })
    if (!role) {
      throw AppError.notFound('角色不存在')
    }
    return toRoleDTO(role)
  } catch (err) {
    if (isDuplicateKeyError(err, 'roleName')) {
      throw AppError.conflict('该角色名已被占用，请更换角色名')
    }
    throw err
  }
}

// 删除：引用完整性保护 —— 仍有用户持有该角色 → 409（按需查询，不做冗余计数字段）
// （内置角色不可删除等特权判断推迟到 RBAC 模块统一做）
export async function deleteRole(id: string) {
  const holderCount = await User.countDocuments({ roles: id })
  if (holderCount > 0) {
    throw AppError.conflict('该角色下仍有用户，无法删除')
  }

  const deleted = await Role.findByIdAndDelete(id)
  if (!deleted) {
    throw AppError.notFound('角色不存在')
  }
}
