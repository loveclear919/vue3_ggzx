// 数据体检：检查 RBAC 三表（users/roles/permissions）的引用完整性、形状一致性、树结构 + 其他集合行数
// 用法：pnpm run audit:data（上线前 / 种子改动后跑一遍）
// 只读：不修改任何数据；发现形状问题（如缺 permissions 键）请跑 seed:admin 修复
import 'dotenv/config'
import mongoose from 'mongoose'

await mongoose.connect(process.env.MONGODB_URI!)
const db = mongoose.connection.db!

const users = await db.collection('users').find().toArray()
const roles = await db.collection('roles').find().toArray()
const perms = await db.collection('permissions').find().toArray()

const roleIds = new Set(roles.map((r) => String(r._id)))
const permIds = new Set(perms.map((p) => String(p._id)))
const rootPerm = perms.find((p) => p.code === '/')
const grantSuper = perms.find((p) => p.code === 'role:grant-super')

let issues = 0
const report = (label: string, items: string[]) => {
  if (items.length === 0) {
    console.log(`  ${label}: ✓`)
  } else {
    issues += items.length
    console.log(`  ${label}: ⚠️ ${items.length} 处 —— ${items.join('; ')}`)
  }
}

console.log(`数据规模: users=${users.length} roles=${roles.length} permissions=${perms.length}`)
console.log('━━━━━━━━━━━━━━━━━━━━━━')

// ① 角色：形状 + 引用
console.log('【角色】')
report(
  '缺 permissions 键（seed:admin 可修）',
  roles.filter((r) => !('permissions' in r)).map((r) => String(r.roleName)),
)
report(
  '缺 builtin 键',
  roles.filter((r) => !('builtin' in r)).map((r) => String(r.roleName)),
)
report(
  'permissions 悬空引用',
  roles
    .filter((r) => (r.permissions ?? []).some((pid: unknown) => !permIds.has(String(pid))))
    .map((r) => String(r.roleName)),
)
report(
  '存了根节点 id（seed:admin 可洗）',
  roles
    .filter((r) => (r.permissions ?? []).map(String).includes(String(rootPerm?._id)))
    .map((r) => String(r.roleName)),
)
const rolesWithGrant = roles.filter((r) =>
  (r.permissions ?? []).map(String).includes(String(grantSuper?._id)),
)
console.log(
  `  持有 grant-super 的角色: ${rolesWithGrant.map((r) => r.roleName).join(', ') || '（无！特权体系失效）'}`,
)

// ② 用户：形状 + 引用
console.log('【用户】')
report(
  '缺 roles 键',
  users.filter((u) => !('roles' in u)).map((u) => String(u.phone)),
)
report(
  'roles 悬空引用',
  users
    .filter((u) => (u.roles ?? []).some((rid: unknown) => !roleIds.has(String(rid))))
    .map((u) => String(u.phone)),
)
report(
  'roles 为空数组',
  users.filter((u) => Array.isArray(u.roles) && u.roles.length === 0).map((u) => String(u.phone)),
)
const holderUsers = users.filter((u) =>
  (u.roles ?? [])
    .map(String)
    .some((rid: string) => rolesWithGrant.some((r) => String(r._id) === rid)),
)
console.log(
  `  grant-super 持有用户: ${holderUsers.map((u) => String(u.username || u.phone)).join(', ') || '（无！系统无超管）'}`,
)

// ③ 权限树：环 + 可达性 + 唯一性
console.log('【权限树】')
const byId = new Map(perms.map((p) => [String(p._id), p]))
const byCode = new Map(perms.map((p) => [p.code, p]))
report(
  'code 重复',
  perms
    .filter((p, i) => perms.findIndex((x) => x.code === p.code) !== i)
    .map((p) => String(p.code)),
)
report(
  'parentId 指向自己',
  perms
    .filter((p) => p.parentId && String(p.parentId) === String(p._id))
    .map((p) => String(p.code)),
)
const cyclic: string[] = []
for (const p of perms) {
  const seen = new Set<string>()
  let cur: unknown = p._id
  while (cur) {
    const key = String(cur)
    if (seen.has(key)) {
      cyclic.push(String(p.code))
      break
    }
    seen.add(key)
    cur = byId.get(key)?.parentId
  }
}
report('上溯成环', cyclic)
// 可达性：从根 BFS
const children = new Map<string, unknown[]>()
for (const p of perms) {
  const k = p.parentId ? String(p.parentId) : 'null'
  children.set(k, [...(children.get(k) ?? []), p._id])
}
const reachable = new Set<string>()
const queue: unknown[] = [byCode.get('/')?._id].filter(Boolean)
while (queue.length) {
  const cur = String(queue.pop()!)
  if (reachable.has(cur)) continue
  reachable.add(cur)
  queue.push(...(children.get(cur) ?? []))
}
report(
  '从根不可达（前端组树会消失）',
  perms.filter((p) => !reachable.has(String(p._id))).map((p) => String(p.code)),
)
// 同父级 sortIndex 冲突（复合唯一索引在库层兜底，这里是双检）
const seen = new Set<string>()
const sortDup: string[] = []
for (const p of perms) {
  const key = `${String(p.parentId ?? 'null')}:${p.sortIndex ?? 0}`
  if (seen.has(key)) sortDup.push(String(p.code))
  seen.add(key)
}
report('同父级 sortIndex 冲突', sortDup)
report(
  '缺 parentId 键',
  perms.filter((p) => !('parentId' in p)).map((p) => String(p.code)),
)

// ④ 其他集合行数
console.log('【其他集合】')
for (const col of ['spus', 'skus', 'brands', 'categories', 'attrs', 'basesaleattrs']) {
  try {
    console.log(`  ${col}: ${await db.collection(col).countDocuments()} 条`)
  } catch {
    console.log(`  ${col}: （集合不存在）`)
  }
}

await mongoose.disconnect()
if (issues > 0) {
  console.log(`\n⚠️ 共 ${issues} 处问题（形状类可跑 pnpm run seed:admin 修复）`)
  process.exit(1)
}
console.log('\n✅ 数据体检全部通过')
