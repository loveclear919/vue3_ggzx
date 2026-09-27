// 本地开发种子：基础角色 + 管理员账号（清库 / 新库后跑一次，保证登录体系始终可用）
// 用法：pnpm --filter backend run seed:admin
// 幂等：角色按 roleName upsert；管理员按手机号复用（已存在则补角色，不动密码）
// 顺序：先角色后用户 —— User.roles 存角色 id，用户种入时必须能引用到角色文档
import 'dotenv/config'
import mongoose from 'mongoose'
import { User } from '../src/models/User.js'
import { Role } from '../src/models/Role.js'

const ADMIN_PHONE = '13800138000'
const ADMIN_PASSWORD = 'admin123'

// 基础角色：与前端用户管理「角色分配」抽屉的选项保持一致
const BASE_ROLES: Array<{ roleName: string; remark: string }> = [
  { roleName: 'super_admin', remark: '超级管理员' },
  { roleName: 'admin', remark: '管理员' },
  { roleName: 'operator', remark: '运营人员' },
  { roleName: 'auditor', remark: '审核员' },
  { roleName: 'finance', remark: '财务' },
  { roleName: 'customer_service', remark: '客服' },
  { roleName: 'editor', remark: '内容编辑' },
  { roleName: 'viewer', remark: '访客（只读）' },
  { roleName: 'user', remark: '普通用户' },
]

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI 未配置，请检查 backend/.env')
    process.exit(1)
  }
  await mongoose.connect(process.env.MONGODB_URI)

  // ① 角色：roleName 为键 upsert（已存在只同步描述，不重复创建）
  for (const base of BASE_ROLES) {
    await Role.updateOne(
      { roleName: base.roleName },
      { $set: { remark: base.remark } },
      { upsert: true },
    )
  }
  console.log(`✅ 基础角色已就绪（${BASE_ROLES.length} 个）`)

  // ② 管理员：roles 引用 admin 角色的 _id
  const adminRole = await Role.findOne({ roleName: 'admin' }).lean()
  if (!adminRole) {
    throw new Error('admin 角色种入失败')
  }
  const exists = await User.findOne({ phone: ADMIN_PHONE })
  if (exists) {
    await User.updateOne({ phone: ADMIN_PHONE }, { $addToSet: { roles: adminRole._id } })
    console.log(`✅ 该手机号用户已存在，已补上 admin 角色：${exists.username}`)
  } else {
    await User.create({
      phone: ADMIN_PHONE,
      password: ADMIN_PASSWORD,
      username: 'admin',
      roles: [adminRole._id],
    })
    console.log(`✅ 管理员已创建：手机号 ${ADMIN_PHONE} / 密码 ${ADMIN_PASSWORD}`)
  }
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('❌ 种子失败:', err)
  process.exit(1)
})
