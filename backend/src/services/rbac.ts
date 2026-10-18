import { User } from '../models/User.js'
import { Role } from '../models/Role.js'
import { Permission } from '../models/Permission.js'

// 特权专用 perms：仅 super_admin 角色持有，四向特权保护统一判据
export const GRANT_SUPER_PERMS = 'role:grant-super'

// 操作者 perms 判定：显式参数（service 不读 req）；undefined（路由未挂中间件/未登录）按无特权 fail-closed
export const hasPerm = (operatorPerms: Set<string> | undefined, perms: string) =>
  operatorPerms?.has(perms) ?? false

// 内置角色 id 集合（字符串形态）
export async function builtinRoleIds(): Promise<Set<string>> {
  const roles = await Role.find({ builtin: true }).select('_id').lean()
  return new Set(roles.map((r) => String(r._id)))
}

// role:grant-super 的权限 id（按 perms 查，不信任前端传的 id 语义）
export async function grantSuperPermissionId(): Promise<string | null> {
  const p = await Permission.findOne({ perms: GRANT_SUPER_PERMS }).select('_id').lean()
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

// ===== 权限聚合：用户 → 角色 → 权限 → perms 集合（含祖先补全） =====
// 共 3 次查询；后端内部统一 Set，只在 DTO 边界 [...perms] 转数组（Set 直接 JSON 序列化是 {}）

interface PermNodeLite {
  perms?: string | null
  type?: string | null
  parentId?: unknown | null
  sortIndex?: number | null
  name?: string | null
  path?: string | null
  component?: string | null
  icon?: string | null
  hidden?: boolean | null
}

// 单次聚合骨架：固定 3 次查询 + 全表内存 Map。
// Role.permissions 只存勾选叶子（半选父级不入库），按已存 id 过滤查询查不到父级——
// 补全祖先只有两条路：全表建 Map 上溯（本方案），或沿 parentId 逐层查询（查询次数随树深增长）。
// 选全表：权限表 KB 级（36 节点）传输代价可忽略，换来固定往返次数 + 同一快照一致性 + 代码直白；
// 若表增长到万级且授权稀疏，逐层上溯（或 $graphLookup）是既定升级路径
async function aggregateForUser(userId: string) {
  const user = await User.findById(userId).select('roles').lean()
  if (!user) return null

  const roles = await Role.find({ _id: { $in: user.roles } })
    .select('permissions')
    .lean()

  const permissionIds = [
    ...new Set(roles.flatMap((r) => r.permissions ?? []).map((id) => String(id))),
  ]

  const perms = await Permission.find()
    .select('perms type parentId sortIndex name path component icon hidden')
    .lean()
  const byId = new Map<string, PermNodeLite>()
  for (const p of perms) {
    byId.set(String(p._id), {
      perms: p.perms,
      type: p.type,
      parentId: p.parentId,
      sortIndex: p.sortIndex,
      name: p.name,
      path: p.path,
      component: p.component,
      icon: p.icon,
      hidden: p.hidden,
    })
  }
  return { byId, permissionIds }
}

// 沿 parentId 上溯：visited 防环（权限树成环时 while 会同步死循环锁死整个事件循环——
// 宁可损失该链的祖先补全，也不能把服务拖死）
function walkAncestors(
  byId: Map<string, PermNodeLite>,
  id: unknown,
  visit: (node: PermNodeLite, key: string) => void,
) {
  let currentKey: string | undefined = String(id)
  const visited = new Set<string>()
  while (currentKey) {
    if (visited.has(currentKey)) break
    visited.add(currentKey)
    const node = byId.get(currentKey)
    if (!node) break
    visit(node, currentKey)
    currentKey = node.parentId ? String(node.parentId) : undefined
  }
}

// 算出「某个用户拥有的全部权限标识」，返回 Set<string>（requirePermission 中间件每请求调用）
export async function getPermsForUser(userId: string): Promise<Set<string>> {
  const agg = await aggregateForUser(userId)
  if (!agg) return new Set()
  const perms = new Set<string>()
  for (const id of agg.permissionIds) {
    walkAncestors(agg.byId, id, (node) => {
      // 空 perms（根节点/分组菜单）不是权限值，天然跳过
      if (node.perms) perms.add(node.perms)
    })
  }
  return perms
}

// ===== 路由表 DTO（login/getInfo 响应用）：perms + 授权菜单树，同一趟聚合产出 =====

export interface MenuRouteNode {
  path: string
  title: string
  icon: string
  hidden: boolean
  component: string // '' = 分组菜单
  children?: MenuRouteNode[]
}

// 静态页不进动态路由表（前端壳承载；其 perms 仍照常聚合供判权/v-permission 消费）
const STATIC_MENU_PATHS = new Set(['/home', '/screen'])

export async function getUserRbac(userId: string) {
  const agg = await aggregateForUser(userId)
  if (!agg) return { perms: new Set<string>(), routes: [] as MenuRouteNode[] }
  const perms = new Set<string>()
  const menuIds = new Set<string>()
  for (const id of agg.permissionIds) {
    walkAncestors(agg.byId, id, (node, key) => {
      if (node.perms) perms.add(node.perms)
      // 授权菜单 id（含祖先补全进来的父级）：menu 且 path 非空（排除根/按钮）且非静态页
      if (node.type === 'menu' && node.path && !STATIC_MENU_PATHS.has(node.path)) {
        menuIds.add(key)
      }
    })
  }
  return { perms, routes: buildMenuRouteTree(menuIds, agg.byId) }
}

interface TreeDraft {
  id: string
  node: MenuRouteNode
  parentId: string | null
  sortIndex: number
  children: TreeDraft[]
}

function buildMenuRouteTree(
  menuIds: Set<string>,
  byId: Map<string, PermNodeLite>,
): MenuRouteNode[] {
  const drafts = new Map<string, TreeDraft>()
  for (const id of menuIds) {
    const n = byId.get(id)
    if (!n?.path) continue
    drafts.set(id, {
      id,
      node: {
        path: n.path,
        title: n.name ?? n.path,
        icon: n.icon ?? '',
        hidden: n.hidden ?? false,
        component: n.component ?? '',
      },
      parentId: n.parentId ? String(n.parentId) : null,
      sortIndex: n.sortIndex ?? 0,
      children: [],
    })
  }

  // 防环挂载：从 p 沿 parentId 上溯能走到 d，说明 p 是 d 的后代，挂载会成环 → d 落根（只防脏数据，不修复）
  const reachesUpward = (startId: string, targetId: string): boolean => {
    let cur: string | undefined = startId
    const visited = new Set<string>()
    while (cur) {
      if (visited.has(cur)) return false
      visited.add(cur)
      if (cur === targetId) return true
      cur = byId.get(cur)?.parentId ? String(byId.get(cur)!.parentId) : undefined
    }
    return false
  }
  const roots: TreeDraft[] = []
  for (const d of drafts.values()) {
    const p = d.parentId ? drafts.get(d.parentId) : null
    if (p && !reachesUpward(p.id, d.id)) p.children.push(d)
    else roots.push(d)
  }

  // 空分组剪枝：自底向上单趟即达不动点——先递归剪子级，再判本级
  // （子分组被剪后父分组可能变成新空分组，单趟递归天然覆盖）
  const prune = (list: TreeDraft[]): TreeDraft[] => {
    for (const d of list) d.children = prune(d.children)
    return list.filter((d) => d.node.component !== '' || d.children.length > 0)
  }
  const prunedRoots = prune(roots)

  const sortRec = (list: TreeDraft[]) => {
    list.sort((a, b) => a.sortIndex - b.sortIndex)
    for (const d of list) sortRec(d.children)
  }
  sortRec(prunedRoots)

  const toDTO = (d: TreeDraft): MenuRouteNode => ({
    ...d.node,
    ...(d.children.length ? { children: d.children.map(toDTO) } : {}),
  })
  return prunedRoots.map(toDTO)
}
