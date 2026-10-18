// 本地开发种子：基础角色（含权限分配）+ 管理员账号（清库 / 新库后跑一次，保证登录体系始终可用）
// 用法：pnpm --filter backend run seed:admin（依赖 seed:permissions 已跑：权限树必须先存在）
// 幂等：角色按 roleName upsert 并覆盖 permissions（种子语义 = 恢复到基线分配）；
//       管理员按手机号复用（已存在则改挂 super_admin，不动密码）
// 顺序：先权限树（外部依赖）→ 角色 → 用户 —— User.roles 存角色 id，用户种入时必须能引用到角色文档
import 'dotenv/config'
import mongoose from 'mongoose'
import { User } from '../src/models/User.js'
import { Role } from '../src/models/Role.js'
import { Permission } from '../src/models/Permission.js'

const ADMIN_PHONE = '13800138000'
const ADMIN_PASSWORD = '123456' // 与边界测试超管登录用例保持一致；已存在的账号 seed 不改密码

// 特权专用 perms：仅 super_admin 角色持有，四向特权保护统一判据
const GRANT_SUPER_PERMS = 'role:grant-super'

// 基础角色：与前端用户管理「角色分配」抽屉的选项保持一致
// builtin = 内置角色标记：不可改名/删除，授予/撤销需持 role:grant-super
const BASE_ROLES: Array<{ roleName: string; remark: string; builtin: boolean }> = [
  { roleName: 'super_admin', remark: '超级管理员', builtin: true },
  { roleName: 'admin', remark: '管理员', builtin: false },
  { roleName: 'operator', remark: '运营人员', builtin: false },
  { roleName: 'auditor', remark: '审核员', builtin: false },
  { roleName: 'finance', remark: '财务', builtin: false },
  { roleName: 'customer_service', remark: '客服', builtin: false },
  { roleName: 'editor', remark: '内容编辑', builtin: false },
  { roleName: 'viewer', remark: '访客（只读）', builtin: false },
  { roleName: 'user', remark: '普通用户', builtin: false },
]

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI 未配置，请检查 backend/.env')
    process.exit(1)
  }
  await mongoose.connect(process.env.MONGODB_URI)

  // 前置：权限树必须已种（否则 super_admin 会拿到空权限，特权保护静默失效）
  const permCount = await Permission.countDocuments()
  if (permCount === 0) {
    throw new Error('权限树为空：请先运行 seed:permissions')
  }

  // ① 角色：roleName 为键 upsert（已存在只同步描述与 builtin，不重复创建）
  for (const base of BASE_ROLES) {
    await Role.updateOne(
      { roleName: base.roleName },
      { $set: { remark: base.remark, builtin: base.builtin } },
      { upsert: true },
    )
  }

  // ② 权限分配（种子语义 = 覆盖到基线）：
  //    super_admin → 全量；admin → 除 grant-super 外全量；user → 空权限（静态页人人可见，放开判权定案）
  const allPerms = await Permission.find().select('perms').lean()
  const grantSuper = allPerms.find((p) => p.perms === GRANT_SUPER_PERMS)
  if (!grantSuper) {
    throw new Error(`权限树缺少 ${GRANT_SUPER_PERMS}：请先运行 seed:permissions`)
  }
  const allIds = allPerms.map((p) => p._id)
  const adminIds = allPerms.filter((p) => p.perms !== GRANT_SUPER_PERMS).map((p) => p._id)
  const userIds: unknown[] = []

  await Role.updateOne({ roleName: 'super_admin' }, { $set: { permissions: allIds } })
  await Role.updateOne({ roleName: 'admin' }, { $set: { permissions: adminIds } })
  await Role.updateOne({ roleName: 'user' }, { $set: { permissions: userIds } })
  console.log(`✅ 基础角色已就绪（${BASE_ROLES.length} 个），权限分配已同步基线`)

  // 洗存量（rbac-design §4.5）：历史角色可能存过根节点 id（开发期勾选过「全部数据」），统一 $pull
  // 根节点按结构键定位：全树唯一 parentId = null（v2 起无 code 字段）
  const root = await Permission.findOne({ parentId: null }).select('_id').lean()
  if (root) {
    const { modifiedCount } = await Role.updateMany({}, { $pull: { permissions: root._id } })
    if (modifiedCount > 0) {
      console.log(`✅ 已从 ${modifiedCount} 个角色中剔除根节点权限（洗存量）`)
    }
  }

  // 形状修复：权限模块落地前创建的存量角色没有 permissions 键（服务端读取会 undefined 崩溃），补成空数组
  const { modifiedCount: shapeFixed } = await Role.updateMany(
    { permissions: { $exists: false } },
    { $set: { permissions: [] } },
  )
  if (shapeFixed > 0) {
    console.log(`✅ 已为 ${shapeFixed} 个存量角色补上 permissions 空数组（形状修复）`)
  }

  // ③ 管理员：改挂 super_admin（$set 覆盖而非 $addToSet —— 追加会与旧 admin 角色并存）
  const superAdminRole = await Role.findOne({ roleName: 'super_admin' }).lean()
  if (!superAdminRole) {
    throw new Error('super_admin 角色种入失败')
  }
  const exists = await User.findOne({ phone: ADMIN_PHONE })
  if (exists) {
    await User.updateOne({ phone: ADMIN_PHONE }, { $set: { roles: [superAdminRole._id] } })
    console.log(`✅ 该手机号用户已存在，已改挂 super_admin 角色：${exists.username}`)
  } else {
    await User.create({
      phone: ADMIN_PHONE,
      password: ADMIN_PASSWORD,
      username: 'admin',
      roles: [superAdminRole._id],
    })
    console.log(`✅ 管理员已创建：手机号 ${ADMIN_PHONE} / 密码 ${ADMIN_PASSWORD}`)
  }
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('❌ 种子失败:', err)
  process.exit(1)
})
