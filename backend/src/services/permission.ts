import mongoose from 'mongoose'
import type { FlattenMaps } from 'mongoose'
import { Permission, toPermissionDTO } from '../models/Permission.js'
import type { IPermission } from '../models/Permission.js'
import { AppError } from '../utils/AppError.js'
import { rethrowConflict } from '../utils/mongoError.js'
import { Role } from '../models/Role.js'

// 全量平铺
export async function listPermissions() {
  const list = await Permission.find().sort({ sortIndex: 1 })
  return list.map(toPermissionDTO)
}

// 父级校验链
async function validateParentFor(type: string, parentId: string | null, selfId?: string) {
  if (!parentId) {
    if (type === 'button') {
      throw AppError.badRequest('按钮必须挂载在菜单下，不能作为顶级节点')
    }
    return
  }
  if (!mongoose.isValidObjectId(parentId)) {
    throw AppError.badRequest('父级格式不合法')
  }
  if (selfId && parentId === selfId) {
    throw AppError.badRequest('父级不能是自己')
  }
  const parent = await Permission.findById(parentId).select('type parentId').lean()
  if (!parent) {
    throw AppError.badRequest('父级不存在')
  }
  if (type === 'menu' && parent.type !== 'menu') {
    throw AppError.badRequest('菜单的父级必须是菜单')
  }
  if (type === 'button' && parent.type !== 'menu') {
    throw AppError.badRequest('按钮的父级必须是菜单')
  }
  // 环校验：防「挂到自己后代」；visited 防「库里已存在环」（脏数据）时上溯死循环
  let cursor: (FlattenMaps<IPermission> & { _id: unknown }) | null = parent
  const visited = new Set<string>()
  while (cursor) {
    const key = String(cursor._id)
    if (visited.has(key)) break
    visited.add(key)
    if (selfId && key === selfId) {
      throw AppError.badRequest('不能移动到自己的子节点下')
    }
    cursor = cursor.parentId
      ? await Permission.findById(cursor.parentId).select('_id parentId').lean()
      : null
  }
}

// 新增
export async function createPermission(
  parentId: string | null,
  name: string,
  code: string,
  type: string,
  sortIndex?: number,
) {
  // 校验权限名
  if (typeof name !== 'string') {
    throw AppError.badRequest('权限名称格式错误')
  }
  const cleanName = name.trim()
  if (!cleanName) {
    throw AppError.badRequest('权限名不能为空')
  }
  // 校验权限类型
  if (type !== 'menu' && type !== 'button') {
    throw AppError.badRequest('权限类型错误')
  }
  // 校验权限值
  if (typeof code !== 'string') {
    throw AppError.badRequest('权限值格式错误')
  }
  const cleanCode = code.trim()
  if (!cleanCode) {
    throw AppError.badRequest('权限值不能为空')
  }
  // 校验上级（层级规则 + 存在性，与 update 共用）
  await validateParentFor(type, parentId || null)

  // 排序号：显式传入（种子/重排）必须是非负整数；未传 → 同级最大 + 1（新节点默认排最后）
  let resolvedSortIndex = sortIndex
  if (resolvedSortIndex === undefined) {
    const last = await Permission.findOne({ parentId: parentId || null })
      .sort({ sortIndex: -1 })
      .select('sortIndex')
      .lean()
    resolvedSortIndex = (last?.sortIndex ?? -1) + 1
  } else if (!Number.isInteger(resolvedSortIndex) || resolvedSortIndex < 0) {
    throw AppError.badRequest('排序号必须是非负整数')
  }

  // 新增数据库
  try {
    const permission = await Permission.create({
      parentId: parentId || null,
      name: cleanName,
      code: cleanCode,
      type,
      sortIndex: resolvedSortIndex,
    })
    return toPermissionDTO(permission)
  } catch (err) {
    // 多分支分派：code 与 (parentId, sortIndex) 两种唯一索引冲突给不同文案
    rethrowConflict(err, ['code', '权限标识 code 已存在'], ['sortIndex', '排序号冲突，请重试'])
  }
}

// 白名单更新：name / sortIndex / parentId —— code 是稳定身份（前端路由/按钮指令按它对账），创建后不可改
export async function updatePermission(id: string, body: Record<string, unknown>) {
  // 根节点保护（rbac-design §4.5）：code '/' 是系统虚拟容器，不可修改
  const existing = await Permission.findById(id).select('code type parentId').lean()
  if (!existing) {
    throw AppError.notFound('权限不存在')
  }
  if (existing.code === '/') {
    throw AppError.forbidden('系统根节点不可修改')
  }

  const patch: Record<string, unknown> = {}

  if (body.name !== undefined) {
    if (typeof body.name !== 'string') {
      throw AppError.badRequest('权限名称格式不合法')
    }
    const cleanName = body.name.trim()
    if (!cleanName) {
      throw AppError.badRequest('权限名不能为空')
    }
    patch.name = cleanName
  }
  if (body.sortIndex !== undefined) {
    if (
      typeof body.sortIndex !== 'number' ||
      !Number.isInteger(body.sortIndex) ||
      body.sortIndex < 0
    ) {
      throw AppError.badRequest('排序号必须是非负整数')
    }
    patch.sortIndex = body.sortIndex
  }
  if (body.parentId !== undefined) {
    if (body.parentId !== null && typeof body.parentId !== 'string') {
      throw AppError.badRequest('父级格式不合法')
    }
    const newParentId = body.parentId === null ? null : body.parentId
    // 父级未变：不 patch 也不重排 —— 否则前端「只改名称」也带 parentId，会把节点静默踢到同级末尾
    const parentChanged = String(existing.parentId ?? null) !== String(newParentId ?? null)
    if (parentChanged) {
      // 层级规则用目标自身的 type（type 不在白名单）：走与 create 共用的校验链（含环校验）
      await validateParentFor(existing.type, newParentId, id)
      patch.parentId = newParentId
      // 跨父移动必须重排：原 sortIndex 是「旧父级下的序号」，直接带过去会与目标父级下的现有节点撞唯一索引（11000）
      // （本次 patch 显式传了 sortIndex 则尊重调用方，不覆盖）
      if (body.sortIndex === undefined) {
        const last = await Permission.findOne({ parentId: newParentId ?? null })
          .sort({ sortIndex: -1 })
          .select('sortIndex')
          .lean()
        patch.sortIndex = (last?.sortIndex ?? -1) + 1
      }
    }
  }

  if (Object.keys(patch).length === 0) {
    throw AppError.badRequest('没有需要更新的字段')
  }

  try {
    const permission = await Permission.findByIdAndUpdate(id, patch, {
      returnDocument: 'after',
      runValidators: true,
    })
    if (!permission) {
      throw AppError.notFound('权限不存在')
    }
    return toPermissionDTO(permission)
  } catch (err) {
    // 唯一索引只有 code 与 (parentId, sortIndex)，code 不在白名单 → 只会撞排序号
    rethrowConflict(err, ['sortIndex', '排序号冲突，请重试'])
  }
}

export async function deletePermission(id: string) {
  // 根节点保护：code '/' 是系统虚拟容器，不可删除
  const target = await Permission.findById(id).select('code').lean()
  if (!target) {
    throw AppError.notFound('权限不存在')
  }
  if (target.code === '/') {
    throw AppError.forbidden('系统根节点不可删除')
  }
  // 子级保护
  const child = await Permission.exists({ parentId: id })
  if (child) {
    throw AppError.conflict('请先删除子级权限')
  }
  const isUsed = await Role.countDocuments({ permissions: id })
  if (isUsed) {
    throw AppError.conflict('该权限已被角色引用')
  }
  const result = await Permission.findByIdAndDelete(id)
  if (!result) {
    throw AppError.notFound('权限不存在')
  }
}

// 同层两节点交换排序（上移/下移的操作单元）：无事务三步 + 临时值腾位。
// 临时值取「同层最大 + 1」——崩溃残留也是合法位置（排在末尾），刷新重试即修复；
// 并发窗口由唯一索引兜底（11000 → 409，乐观写入）。若未来要求强一致，升级为事务版（需副本集）
export async function swapPermissionSort(id: string, targetId: string) {
  const a = await Permission.findById(id)
  const b = await Permission.findById(targetId)
  if (!a || !b) {
    throw AppError.notFound('权限不存在')
  }
  if (String(a.parentId) !== String(b.parentId)) {
    throw AppError.badRequest('只能交换同层节点')
  }
  if (a.sortIndex === b.sortIndex) {
    return
  }

  const maxSort =
    (
      await Permission.findOne({ parentId: a.parentId ?? null })
        .sort({ sortIndex: -1 })
        .select('sortIndex')
        .lean()
    )?.sortIndex ?? -1
  const temp = maxSort + 1

  try {
    await Permission.updateOne({ _id: a._id }, { $set: { sortIndex: temp } })
    await Permission.updateOne({ _id: b._id }, { $set: { sortIndex: a.sortIndex } })
    await Permission.updateOne({ _id: a._id }, { $set: { sortIndex: b.sortIndex } })
  } catch (err) {
    rethrowConflict(err, [null, '排序冲突，请刷新后重试'])
  }
}
