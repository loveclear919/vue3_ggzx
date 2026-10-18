import { User, toUserDTO, PHONE_REGEX } from '../models/User.js'
import { Role, DEFAULT_ROLE_NAME } from '../models/Role.js'
import { AppError } from '../utils/AppError.js'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { escapeRegExp } from '../utils/escapeRegExp.js'
import { normalizePage } from '../utils/pagination.js'
import { isDuplicateKeyError, rethrowConflict } from '../utils/mongoError.js'
import { generateDefaultUsername } from '../utils/defaultUsername.js'
import { hasPerm, builtinRoleIds, grantSuperHolderUserIds, grantSuperPermissionId } from './rbac.js'

// 默认展示名重试上限：随机 6 位数字碰撞概率约 1/10⁶，3 次足够
const USERNAME_RETRY = 3

// 业务层：用户信息读取 / 更新（当前用户）+ 用户管理（列表 / 新增 / 更新 / 删除）

export async function getUserById(userId: string) {
  const user = await User.findById(userId)
  if (!user) {
    throw AppError.notFound('用户不存在')
  }
  return toUserDTO(user)
}

// 字段白名单 + 校验放在业务层：任何入口（HTTP / 定时任务 / 测试）都走同一套规则
// 本人可改：avatar（头像）、username（展示名）—— 不含 roles（防自我提权）、不含 phone（登录凭据）
export async function updateUserInfo(userId: string, body: Record<string, unknown>) {
  const updates: Record<string, string> = {}

  const avatar = body.avatar
  if (avatar !== undefined) {
    if (typeof avatar !== 'string' || avatar.length > 500) {
      throw AppError.badRequest('avatar 格式不合法')
    }
    updates.avatar = avatar
  }
  if (body.username !== undefined) {
    if (typeof body.username !== 'string') {
      throw AppError.badRequest('用户名格式不合法')
    }
    const name = body.username.trim()
    if (name.length < 3 || name.length > 20) {
      throw AppError.badRequest('用户名长度 3-20 个字符')
    }
    updates.username = name
  }

  if (Object.keys(updates).length === 0) {
    throw AppError.badRequest('没有需要更新的字段')
  }

  try {
    const user = await User.findByIdAndUpdate(userId, updates, {
      returnDocument: 'after',
      runValidators: true,
    })
    if (!user) {
      throw AppError.notFound('用户不存在')
    }
    return toUserDTO(user)
  } catch (err) {
    // 展示名有唯一索引：改成别人已用的名字 → 友好 409
    rethrowConflict(err, ['username', '用户名已存在'])
  }
}

// 修改密码（本人）：独立端点，不并入 updateUserInfo 白名单 ——
// 密码字段有 select: false 且要 bcrypt 比对旧密码，生命周期与普通资料字段完全不同
export async function changePassword(userId: string, oldPassword: string, newPassword: string) {
  if (newPassword.length < 6) {
    throw AppError.badRequest('密码至少 6 位')
  }

  const user = await User.findById(userId).select('+password')
  if (!user) {
    throw AppError.notFound('用户不存在')
  }

  const valid = await bcrypt.compare(oldPassword, user.password)
  if (!valid) {
    throw AppError.badRequest('原密码不正确')
  }

  // 直接赋值后 save()：走模型的 pre('save') 钩子自动 bcrypt 加密（isModified('password') 命中）
  user.password = newPassword
  await user.save()
}

// ---- 用户管理 ----

export interface ListUsersParams {
  page: number
  pageSize: number
  keyword?: string
}

// 分页列表 + 用户名 / 手机号双字段搜索（转义后字面量匹配，用户输入不会破坏正则）
export async function listUsers({ page, pageSize, keyword }: ListUsersParams) {
  const { page: safePage, pageSize: safePageSize } = normalizePage(page, pageSize)

  const filter: { $or?: Array<Record<string, unknown>> } = {}
  if (keyword) {
    const re = { $regex: escapeRegExp(keyword), $options: 'i' }
    filter.$or = [{ username: re }, { phone: re }]
  }

  const [list, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safePageSize)
      .limit(safePageSize),
    User.countDocuments(filter),
  ])

  return { list: list.map(toUserDTO), total }
}

// 角色 id 校验（create / update 共用）：去重 → 格式 → 值域，返回可入库的 id 数组。
// 值域校验现在能做的前提：User.roles 存的是角色 id，一次 countDocuments 即可确认全部存在
async function validateRoleIds(roles: string[]): Promise<string[]> {
  const unique = [...new Set(roles)]
  if (unique.length === 0) {
    throw AppError.badRequest('角色不能为空')
  }
  for (const id of unique) {
    if (!mongoose.isValidObjectId(id)) {
      throw AppError.badRequest('角色格式不合法')
    }
  }
  const count = await Role.countDocuments({ _id: { $in: unique } })
  if (count !== unique.length) {
    throw AppError.badRequest('角色不存在')
  }
  return unique
}

// 默认角色（普通用户）：注册 / 管理端新增未指定角色时兜底分配
async function defaultRoleId(): Promise<string> {
  const role = await Role.findOne({ roleName: DEFAULT_ROLE_NAME }).select('_id').lean()
  if (!role) {
    throw AppError.internal('默认角色缺失，请先初始化角色数据')
  }
  return String(role._id)
}

// 新增用户（注册 / 管理端共用）
// operatorPerms：注册入口不传（roles 必为空，走默认角色，无特权操作）；管理端创建传 req.permissionPerms
export async function createUser(
  phone: string,
  password: string,
  desc: string,
  roles: string[],
  operatorPerms?: Set<string>,
) {
  if (!PHONE_REGEX.test(phone)) {
    throw AppError.badRequest('手机号格式不正确')
  }
  if (password.length < 6) {
    throw AppError.badRequest('密码至少 6 位')
  }

  // roles 为空 = 未指定 → 默认普通用户角色（注册与管理员新增都走这里）
  const roleIds = roles.length > 0 ? await validateRoleIds(roles) : [await defaultRoleId()]

  // 显式指定角色 = 特权操作：需 user:assign-role；涉及内置角色需 role:grant-super
  if (roles.length > 0) {
    if (!hasPerm(operatorPerms, 'user:assign-role')) {
      throw AppError.forbidden('没有分配角色的权限')
    }
    const builtinIds = await builtinRoleIds()
    if (roleIds.some((rid) => builtinIds.has(rid)) && !hasPerm(operatorPerms, 'role:grant-super')) {
      throw AppError.forbidden('涉及超级管理员角色需要超级授权')
    }
  }

  for (let attempt = 0; attempt < USERNAME_RETRY; attempt++) {
    try {
      const user = await User.create({
        phone,
        password,
        username: generateDefaultUsername(),
        desc: desc.trim(),
        roles: roleIds,
      })
      return toUserDTO(user)
    } catch (err) {
      // 手机号冲突 → 直接报错；默认用户名撞了 → 重新生成再试
      if (isDuplicateKeyError(err, 'phone')) {
        throw AppError.conflict('手机号已存在')
      }
      if (!isDuplicateKeyError(err, 'username')) {
        throw err
      }
    }
  }
  throw AppError.conflict('默认用户名生成冲突，请重试')
}

// 更新白名单：只认 username（展示名）/ desc / roles —— phone 是身份（创建后不改），密码重置留待独立流程
export async function updateUser(
  id: string,
  body: Record<string, unknown>,
  operatorPerms?: Set<string>,
) {
  const patch: Record<string, unknown> = {}

  if (body.username !== undefined) {
    if (typeof body.username !== 'string') {
      throw AppError.badRequest('用户名格式不合法')
    }
    const name = body.username.trim()
    if (name.length < 3 || name.length > 20) {
      throw AppError.badRequest('用户名长度 3-20 个字符')
    }
    patch.username = name
  }
  if (body.desc !== undefined) {
    if (typeof body.desc !== 'string') {
      throw AppError.badRequest('描述格式不合法')
    }
    patch.desc = body.desc.trim()
  }
  if (body.roles !== undefined) {
    if (!Array.isArray(body.roles) || body.roles.some((r) => typeof r !== 'string')) {
      throw AppError.badRequest('角色格式不合法')
    }
    // 分配角色属独立操作：结构通过后先验操作码
    if (!hasPerm(operatorPerms, 'user:assign-role')) {
      throw AppError.forbidden('没有分配角色的权限')
    }
    // 结构通过后走与 create 共用的「去重 → 格式 → 值域」校验；空数组在 validateRoleIds 里拦 400
    const roleIds = await validateRoleIds(body.roles)
    // 特权判定：新旧角色任一涉及内置角色 = 授予/撤销特权，需 role:grant-super
    const target = await User.findById(id).select('roles').lean()
    if (!target) {
      throw AppError.notFound('用户不存在')
    }
    const builtinIds = await builtinRoleIds()
    const touchesBuiltin =
      roleIds.some((rid) => builtinIds.has(rid)) ||
      target.roles.some((rid) => builtinIds.has(String(rid)))
    if (touchesBuiltin && !hasPerm(operatorPerms, 'role:grant-super')) {
      throw AppError.forbidden('涉及超级管理员角色需要超级授权')
    }
    // 最后一名 grant-super 持有者保护：语义是「不能失去 grant-super」而非「不能动 roles」——
    // 只拦「新角色集合不再产出 grant-super」的变更；保留 super 的同时追加普通角色属安全操作
    const holders = await grantSuperHolderUserIds()
    if (holders.has(id) && holders.size === 1) {
      const grantId = await grantSuperPermissionId()
      const producing = grantId
        ? await Role.find({ _id: { $in: roleIds }, permissions: grantId })
            .select('_id')
            .lean()
        : []
      if (producing.length === 0) {
        throw AppError.forbidden('系统至少保留一名超级管理员')
      }
    }
    patch.roles = roleIds
  }

  if (Object.keys(patch).length === 0) {
    throw AppError.badRequest('没有需要更新的字段')
  }

  try {
    const user = await User.findByIdAndUpdate(id, patch, {
      returnDocument: 'after',
      runValidators: true,
    })
    if (!user) {
      throw AppError.notFound('用户不存在')
    }
    return toUserDTO(user)
  } catch (err) {
    // 展示名有唯一索引：改成别人已用的名字 → 友好 409
    rethrowConflict(err, ['username', '用户名已存在'])
  }
}

// 删除：不能删自己（operatorId 来自 auth 中间件）；持内置角色用户与最后一名超管受特权保护（rbac-design §4.4 #3/#5）
export async function deleteUser(id: string, operatorId: string, operatorPerms?: Set<string>) {
  if (id === operatorId) {
    throw AppError.badRequest('不能删除当前登录用户')
  }

  const target = await User.findById(id).select('roles').lean()
  if (!target) {
    throw AppError.notFound('用户不存在')
  }
  const builtinIds = await builtinRoleIds()
  const holdsBuiltin = target.roles.some((rid) => builtinIds.has(String(rid)))
  if (holdsBuiltin && !hasPerm(operatorPerms, 'role:grant-super')) {
    throw AppError.forbidden('删除超级管理员需要超级授权')
  }
  const holders = await grantSuperHolderUserIds()
  if (holders.has(id) && holders.size === 1) {
    throw AppError.forbidden('系统至少保留一名超级管理员')
  }

  const deleted = await User.findByIdAndDelete(id)
  if (!deleted) {
    throw AppError.notFound('用户不存在')
  }
}
