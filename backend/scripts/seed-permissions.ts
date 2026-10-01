// 权限种子：全量权限树（根节点 + 菜单 + 按钮），与前端 routes.ts 的 meta.code 及 v-permission 绑定值对账
// 用法：pnpm --filter backend run seed:permissions
// 幂等：按 code upsert；已存在只同步 name/type/parentId，同层重跑不动 sortIndex（尊重管理页手动排序）；
//       节点被跨父移动过时，恢复父级同步重排到目标父级末尾（原 sortIndex 属旧父级，带回必撞唯一索引）
// 创建时 sortIndex 取「同级 max+1」——默认 0 会让同父级多节点撞 {parentId, sortIndex} 唯一索引（11000）
// 种入节点放开可改可删：超管玩坏了重跑本种子即恢复（根节点除外，服务端保护）
import 'dotenv/config'
import mongoose from 'mongoose'
import { Permission } from '../src/models/Permission.js'

// 根节点：code 取 '/'（vue-router 根路径语义）；不是权限值，聚合时被剔除
const ROOT: { name: string; code: string; type: 'menu' } = {
  name: '全部数据',
  code: '/',
  type: 'menu',
}

// parent = 父节点 code（'/ ' 为根）；按父先子后顺序声明，upsert 时用 codeToId 解析父 id
const NODES: Array<{ name: string; code: string; type: 'menu' | 'button'; parent: string }> = [
  { name: '系统首页', code: '/home', type: 'menu', parent: '/' },
  { name: '数据大屏', code: '/screen', type: 'menu', parent: '/' },
  { name: '权限管理', code: '/acl', type: 'menu', parent: '/' },
  { name: '用户管理', code: '/acl/users', type: 'menu', parent: '/acl' },
  { name: '新增用户', code: 'user:create', type: 'button', parent: '/acl/users' },
  { name: '编辑用户', code: 'user:update', type: 'button', parent: '/acl/users' },
  { name: '删除用户', code: 'user:delete', type: 'button', parent: '/acl/users' },
  { name: '分配角色', code: 'user:assign-role', type: 'button', parent: '/acl/users' },
  { name: '角色管理', code: '/acl/roles', type: 'menu', parent: '/acl' },
  { name: '新增角色', code: 'role:create', type: 'button', parent: '/acl/roles' },
  { name: '编辑角色', code: 'role:update', type: 'button', parent: '/acl/roles' },
  { name: '删除角色', code: 'role:delete', type: 'button', parent: '/acl/roles' },
  { name: '分配权限', code: 'role:assign-perm', type: 'button', parent: '/acl/roles' },
  { name: '超级授权', code: 'role:grant-super', type: 'button', parent: '/acl/roles' },
  { name: '菜单管理', code: '/acl/menus', type: 'menu', parent: '/acl' },
  { name: '新增权限', code: 'permission:create', type: 'button', parent: '/acl/menus' },
  { name: '编辑权限', code: 'permission:update', type: 'button', parent: '/acl/menus' },
  { name: '删除权限', code: 'permission:delete', type: 'button', parent: '/acl/menus' },
  { name: '交换排序', code: 'permission:swap', type: 'button', parent: '/acl/menus' },
  { name: '商品管理', code: '/product', type: 'menu', parent: '/' },
  { name: '品牌管理', code: '/product/trademark', type: 'menu', parent: '/product' },
  { name: '添加品牌', code: 'brand:create', type: 'button', parent: '/product/trademark' },
  { name: '编辑品牌', code: 'brand:update', type: 'button', parent: '/product/trademark' },
  { name: '删除品牌', code: 'brand:delete', type: 'button', parent: '/product/trademark' },
  { name: '属性管理', code: '/product/attr', type: 'menu', parent: '/product' },
  { name: '添加属性', code: 'attr:create', type: 'button', parent: '/product/attr' },
  { name: '编辑属性', code: 'attr:update', type: 'button', parent: '/product/attr' },
  { name: '删除属性', code: 'attr:delete', type: 'button', parent: '/product/attr' },
  { name: 'SPU管理', code: '/product/spu', type: 'menu', parent: '/product' },
  { name: '添加SPU', code: 'spu:create', type: 'button', parent: '/product/spu' },
  { name: '编辑SPU', code: 'spu:update', type: 'button', parent: '/product/spu' },
  { name: '删除SPU', code: 'spu:delete', type: 'button', parent: '/product/spu' },
  { name: 'SKU管理', code: '/product/spu/sku', type: 'menu', parent: '/product/spu' },
  { name: '生成SKU', code: 'sku:generate', type: 'button', parent: '/product/spu/sku' },
  { name: '编辑SKU', code: 'sku:update', type: 'button', parent: '/product/spu/sku' },
  { name: '清空SKU', code: 'sku:clear', type: 'button', parent: '/product/spu/sku' },
]

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI 未配置，请检查 backend/.env')
    process.exit(1)
  }
  await mongoose.connect(process.env.MONGODB_URI)

  // ① 根节点：按 code='/' upsert 一次完成（不存在则创建），返回值保证 _id 可用于解析子节点父级
  const rootDoc = await Permission.findOneAndUpdate(
    { code: ROOT.code },
    { $set: { name: ROOT.name, type: ROOT.type, parentId: null, sortIndex: 0 } },
    { upsert: true, returnDocument: 'after' },
  )

  // ② 全量节点：父先子后 upsert，codeToId 解析父 id
  const codeToId = new Map<string, mongoose.Types.ObjectId>([[ROOT.code, rootDoc._id]])
  let created = 0
  let synced = 0

  for (const node of NODES) {
    const parentId = codeToId.get(node.parent)
    if (!parentId) {
      throw new Error(`父节点未就绪：${node.code} 的 parent ${node.parent}`)
    }
    const exists = await Permission.findOne({ code: node.code })
    if (exists) {
      // 同层重跑不动 sortIndex（尊重管理页手动排序）；
      // 但节点被管理页跨父移动过时，恢复父级必须同步重排 —— 原 sortIndex 属「新父级下的序号」，
      // 直接带回必撞 {parentId, sortIndex} 唯一索引（与 updatePermission 跨父重排同口径）
      const parentChanged = String(exists.parentId ?? null) !== String(parentId)
      const sync: Record<string, unknown> = { name: node.name, type: node.type, parentId }
      if (parentChanged) {
        const last = await Permission.findOne({ parentId })
          .sort({ sortIndex: -1 })
          .select('sortIndex')
          .lean()
        sync.sortIndex = (last?.sortIndex ?? -1) + 1
      }
      await Permission.updateOne({ code: node.code }, { $set: sync })
      codeToId.set(node.code, exists._id)
      synced++
    } else {
      // 同级 max+1：避免默认 0 撞 {parentId, sortIndex} 唯一索引
      const last = await Permission.findOne({ parentId })
        .sort({ sortIndex: -1 })
        .select('sortIndex')
        .lean()
      const createdDoc = await Permission.create({
        name: node.name,
        code: node.code,
        type: node.type,
        parentId,
        sortIndex: (last?.sortIndex ?? -1) + 1,
      })
      codeToId.set(node.code, createdDoc._id)
      created++
    }
  }

  console.log(
    `✅ 权限树就绪：根节点 1 + 菜单/按钮 ${NODES.length}（本次新建 ${created}，同步 ${synced}）`,
  )
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('❌ 种子失败:', err)
  process.exit(1)
})
