import { Role, toRoleDTO } from '../models/Role.js'
import { Permission } from '../models/Permission.js'
import { AppError } from '../utils/AppError.js'
import mongoose from 'mongoose'
import { escapeRegExp } from '../utils/escapeRegExp.js'
import { normalizePage } from '../utils/pagination.js'
import { rethrowConflict } from '../utils/mongoError.js'
import { User } from '../models/User.js'
import { hasPerm, grantSuperPermissionId } from './rbac.js'

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
    rethrowConflict(err, ['roleName', '该角色名已被占用，请更换角色名'])
  }
}

// 权限 id 校验：根节点剔除 → 去重 → 格式 → 值域。
// 根节点（parentId = null）静默剔除而非报错（rbac-design §4.5）：存量角色可能已勾过根
// （EP 的 getCheckedKeys 对 disabled 节点照常返回勾选值），抛 400 会让这些角色永久保存失败
async function validatePermissionIds(permissions: string[]): Promise<string[]> {
  const root = await Permission.findOne({ parentId: null }).select('_id').lean()
  const rootId = root ? String(root._id) : null
  const unique = [...new Set(permissions)].filter((id) => id !== rootId)
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

// 修改（rbac-design §4.4 #4/#6：内置角色保护 + 提权闭环）
export async function updateRole(
  id: string,
  body: Record<string, unknown>,
  operatorPerms?: Set<string>,
) {
  const target = await Role.findById(id).select('builtin permissions roleName').lean()
  if (!target) {
    throw AppError.notFound('角色不存在')
  }
  // 内置角色：只拦「真的改名」——前端表单恒带 roleName，同名提交（只改 remark）不能误伤；
  // 与「编辑权限名称不静默重排」同一思路：字段存在 ≠ 意图变更。其余修改需 role:grant-super
  if (target.builtin) {
    if (typeof body.roleName === 'string' && body.roleName.trim() !== target.roleName) {
      throw AppError.forbidden('内置角色不可改名')
    }
    if (!hasPerm(operatorPerms, 'role:grant-super')) {
      throw AppError.forbidden('修改内置角色需要超级授权')
    }
  }

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
    // 分配权限属独立操作：先验操作码（§4.4 #4）
    if (!hasPerm(operatorPerms, 'role:assign-perm')) {
      throw AppError.forbidden('没有分配权限的权限')
    }
    // 分配权限抽屉提交：空数组 = 撤销全部权限，合法
    const permissionIds = await validatePermissionIds(body.permissions)
    // 提权闭环（§4.4 #6）：授予 grant-super 须自身持有它
    const grantId = await grantSuperPermissionId()
    if (grantId && permissionIds.includes(grantId) && !hasPerm(operatorPerms, 'role:grant-super')) {
      throw AppError.forbidden('授予超级授权需要超级授权')
    }
    // 防自我锁死：内置角色不可移除 grant-super（§4.4 补充，与「最后一名超管」保护双保险）
    // ?? []：权限模块落地前创建的存量角色文档没有 permissions 键，不能假定形状
    const hadGrant =
      grantId !== null && (target.permissions ?? []).some((pid) => String(pid) === grantId)
    if (target.builtin && hadGrant && !permissionIds.includes(grantId!)) {
      throw AppError.forbidden('内置角色不可移除超级授权')
    }
    patch.permissions = permissionIds
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
    rethrowConflict(err, ['roleName', '该角色名已被占用，请更换角色名'])
  }
}

// 删除：引用完整性保护 —— 仍有用户持有该角色 → 409（按需查询，不做冗余计数字段）
// 内置角色不可删除（硬 403，rbac-design §4.4 #4）
export async function deleteRole(id: string) {
  const target = await Role.findById(id).select('builtin').lean()
  if (!target) {
    throw AppError.notFound('角色不存在')
  }
  if (target.builtin) {
    throw AppError.forbidden('内置角色不可删除')
  }

  const holderCount = await User.countDocuments({ roles: id })
  if (holderCount > 0) {
    throw AppError.conflict('该角色下仍有用户，无法删除')
  }

  const deleted = await Role.findByIdAndDelete(id)
  if (!deleted) {
    throw AppError.notFound('角色不存在')
  }
}
