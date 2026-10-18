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
    // 根节点（parentId = null）是全树唯一的结构容器，业务节点一律挂父级下（含顶级菜单挂根节点）
    throw AppError.badRequest('必须挂载在父级下')
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

// 路由元数据校验（create/update 共用）：返回清洗后的值
function cleanRouteMeta(
  type: string,
  meta: { path?: unknown; component?: unknown; icon?: unknown; hidden?: unknown },
): { path: string; component: string; icon: string; hidden: boolean } {
  const path = typeof meta.path === 'string' ? meta.path.trim() : ''
  const component = typeof meta.component === 'string' ? meta.component.trim() : ''
  const icon = typeof meta.icon === 'string' ? meta.icon.trim() : ''
  const hidden = meta.hidden === true

  if (type === 'button' && (path || component || icon || hidden)) {
    throw AppError.badRequest('按钮类型不需要路由/组件配置')
  }
  if (type === 'menu') {
    if (!path) {
      throw AppError.badRequest('菜单必须填写路由地址')
    }
    if (!/^\/[a-z0-9/_-]*$/.test(path)) {
      throw AppError.badRequest('路由地址需以 / 开头，只能包含小写字母、数字、/ _ -')
    }
    if (component && !/^[a-z0-9_/-]*$/.test(component)) {
      throw AppError.badRequest('组件路径只能包含小写字母、数字、_ / -')
    }
    if (icon && (icon.length > 32 || !/^[A-Za-z0-9_-]*$/.test(icon))) {
      throw AppError.badRequest('图标名只能包含字母、数字、_ -')
    }
  }
  return { path, component, icon, hidden }
}

// 新增
export async function createPermission(
  parentId: string | null,
  name: string,
  perms: string,
  type: string,
  sortIndex?: number,
  meta: { path?: unknown; component?: unknown; icon?: unknown; hidden?: unknown } = {},
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
  // 校验权限标识：分组菜单可为空串；按钮必须有（它是按钮的全部）
  if (typeof perms !== 'string') {
    throw AppError.badRequest('权限标识格式错误')
  }
  const cleanPerms = perms.trim()
  if (!cleanPerms && type === 'button') {
    throw AppError.badRequest('按钮必须填写权限标识')
  }
  // 校验上级（层级规则 + 存在性，与 update 共用）
  await validateParentFor(type, parentId || null)
  // 校验路由元数据（menu 必填 path；按钮禁填）
  const route = cleanRouteMeta(type, meta)

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
      perms: cleanPerms,
      type,
      path: route.path,
      component: route.component,
      icon: route.icon,
      hidden: route.hidden,
      sortIndex: resolvedSortIndex,
    })
    return toPermissionDTO(permission)
  } catch (err) {
    // 多分支分派：perms 与 (parentId, sortIndex) 两种唯一索引冲突给不同文案
    rethrowConflict(err, ['perms', '权限标识已存在'], ['sortIndex', '排序号冲突，请重试'])
  }
}

// 白名单更新：name / perms / path / component / icon / hidden / sortIndex / parentId（若依式全字段可编辑——
// perms 可改：改错直接改回来，契约失配是显性错误（按钮不显示/接口 403），由操作者负责）
export async function updatePermission(id: string, body: Record<string, unknown>) {
  if (!mongoose.isValidObjectId(id)) {
    throw AppError.notFound('权限不存在')
  }
  // 根节点保护（rbac-design §4.5）：parentId = null 是系统结构容器，不可修改
  const existing = await Permission.findById(id).select('perms type parentId').lean()
  if (!existing) {
    throw AppError.notFound('权限不存在')
  }
  if (existing.parentId === null) {
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
  if (body.perms !== undefined) {
    if (typeof body.perms !== 'string') {
      throw AppError.badRequest('权限标识格式不合法')
    }
    const cleanPerms = body.perms.trim()
    if (!cleanPerms && existing.type === 'button') {
      throw AppError.badRequest('按钮必须填写权限标识')
    }
    patch.perms = cleanPerms
  }
  if (body.path !== undefined) {
    if (typeof body.path !== 'string') {
      throw AppError.badRequest('路由地址格式不合法')
    }
    const route = cleanRouteMeta(existing.type, { path: body.path })
    patch.path = route.path
  }
  if (body.component !== undefined) {
    if (typeof body.component !== 'string') {
      throw AppError.badRequest('组件路径格式不合法')
    }
    patch.component = cleanRouteMeta(existing.type, { component: body.component }).component
  }
  if (body.icon !== undefined) {
    if (typeof body.icon !== 'string') {
      throw AppError.badRequest('图标名格式不合法')
    }
    patch.icon = cleanRouteMeta(existing.type, { icon: body.icon }).icon
  }
  if (body.hidden !== undefined) {
    if (typeof body.hidden !== 'boolean') {
      throw AppError.badRequest('隐藏标记格式不合法')
    }
    if (existing.type === 'button' && body.hidden) {
      throw AppError.badRequest('按钮类型不需要路由/组件配置')
    }
    patch.hidden = body.hidden
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
    // 唯一索引只有 perms 与 (parentId, sortIndex)
    rethrowConflict(err, ['perms', '权限标识已存在'], ['sortIndex', '排序号冲突，请重试'])
  }
}

export async function deletePermission(id: string) {
  if (!mongoose.isValidObjectId(id)) {
    throw AppError.notFound('权限不存在')
  }
  // 根节点保护：parentId = null 是系统结构容器，不可删除
  const target = await Permission.findById(id).select('parentId').lean()
  if (!target) {
    throw AppError.notFound('权限不存在')
  }
  if (target.parentId === null) {
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
  // 入参健壮性：畸形 id 直接 404（findById 对非法 ObjectId 会抛 CastError → 500，见评审记录）
  if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(targetId)) {
    throw AppError.notFound('权限不存在')
  }
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
