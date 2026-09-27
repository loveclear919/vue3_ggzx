// 权限种子：初始化权限树的根节点（系统虚拟容器，所有菜单/按钮的祖先）
// 用法：pnpm --filter backend run seed:permissions
// 幂等：按 code='/' 定位根节点，已存在则同步名称与层级，不重复创建
import 'dotenv/config'
import mongoose from 'mongoose'
import { Permission } from '../src/models/Permission.js'

// 根节点：code 取 '/'（vue-router 根路径语义）；被所有子节点挂靠，子级保护使它不可被误删
const ROOT_NAME = '全部数据'
const ROOT_CODE = '/'

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI 未配置，请检查 backend/.env')
    process.exit(1)
  }
  await mongoose.connect(process.env.MONGODB_URI)

  const exists = await Permission.findOne({ code: ROOT_CODE })
  if (exists) {
    await Permission.updateOne(
      { code: ROOT_CODE },
      { $set: { name: ROOT_NAME, parentId: null, sortIndex: 0 } },
    )
    console.log('✅ 权限根节点已存在，已同步为「全部数据」')
  } else {
    await Permission.create({
      name: ROOT_NAME,
      code: ROOT_CODE,
      type: 'menu',
      parentId: null,
      sortIndex: 0,
    })
    console.log('✅ 权限根节点已创建：全部数据（code: /）')
  }
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('❌ 权限种子失败:', err)
  process.exit(1)
})
