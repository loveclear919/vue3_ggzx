import { User } from '../models/User.js'
import { Role } from '../models/Role.js'
import { Permission } from '../models/Permission.js'

// 特权专用 code：仅 super_admin 角色持有，四向特权保护统一判据（与 seed-admin.ts 保持一致）
export const GRANT_SUPER_CODE = 'role:grant-super'

// 操作者 code 判定：显式参数（service 不读 req）；undefined（路由未挂中间件/未登录）按无特权 fail-closed
export const hasCode = (operatorCodes: Set<string> | undefined, code: string) =>
  operatorCodes?.has(code) ?? false

// 内置角色 id 集合（字符串形态）
export async function builtinRoleIds(): Promise<Set<string>> {
  const roles = await Role.find({ builtin: true }).select('_id').lean()
  return new Set(roles.map((r) => String(r._id)))
}

// role:grant-super 的权限 id（按 code 查，不信任前端传的 id 语义）
export async function grantSuperPermissionId(): Promise<string | null> {
  const p = await Permission.findOne({ code: GRANT_SUPER_CODE }).select('_id').lean()
  return p ? String(p._id) : null
}

// 聚合持有 grant-super 的用户 id 集合：用户 roles 含任何「permissions 里带 grant-super」的角色即算持有
export async function grantSuperHolderUserIds(): Promise<Set<string>> {
  const grantId = await grantSuperPermissionId()
  if (!grantId) return new Set()
  const roles = await Role.find({ permissions: grantId }).select('_id').lean()
  // 将返回的对象数组 拆成 纯 id 数组
  const roleIds = roles.map((r) => r._id)
  const users = await User.find({ roles: { $in: roleIds } })
    .select('_id')
    .lean()
  return new Set(users.map((u) => String(u._id)))
}

// 权限聚合：用户 → 角色 → 权限 id → code 集合（含祖先补全）
// 共 3 次查询；后端内部统一 Set，只在 DTO 边界 [...codes] 转数组（Set 直接 JSON 序列化是 {}）

interface PermNode {
  code?: string | null
  parentId?: unknown | null
}

// 算出「某个用户拥有的全部权限码」,返回一个 Set<string>
export async function getPermissionCodesForUser(userId: string): Promise<Set<string>> {
  const user = await User.findById(userId).select('roles').lean()
  if (!user) return new Set()

  const roles = await Role.find({ _id: { $in: user.roles } })
    .select('permissions')
    .lean()
  // ?? []：存量角色文档可能没有 permissions 键（权限模块落地前创建），不能假定形状
  const permissionIds = roles.flatMap((r) => r.permissions ?? [])

  // 必须全表取一次建内存 Map，再沿 parentId 上溯 ——
  // Role.permissions 只存勾选叶子（半选父级不入库，防回显级联漂移），
  // 按已存 id 过滤查询是查不到父级菜单的，祖先补全只能在内存 Map 上做
  const perms = await Permission.find().select('code parentId').lean()
  const byId = new Map<string, PermNode>()
  for (const p of perms) {
    byId.set(String(p._id), { code: p.code, parentId: p.parentId })
  }

  const codes = new Set<string>()
  for (const id of permissionIds) {
    let currentKey: string | undefined = String(id)
    // 上溯 visited 防环：权限树成环（脏数据/手工写库）时 while 会同步死循环锁死整个事件循环——
    // 宁可损失该链的祖先补全（残缺授权、可见性告警可查），也不能把服务拖死
    const visited = new Set<string>()
    while (currentKey) {
      if (visited.has(currentKey)) break
      visited.add(currentKey)
      const node = byId.get(currentKey)
      if (!node) break
      // 根节点 code '/' 与无 code 节点不是权限值：跳过自身，但继续上溯
      if (node.code && node.code !== '/') codes.add(node.code)
      currentKey = node.parentId ? String(node.parentId) : undefined
    }
  }
  return codes
}
