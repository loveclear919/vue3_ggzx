// 权限种子：全量权限树（根节点 + 菜单 + 按钮），与前端 v-permission 绑定值及动态路由 path 对账
// 用法：pnpm --filter backend run seed:permissions
// 幂等：菜单按 path upsert、按钮按 perms upsert；已存在只同步 name/type/parentId/perms/path/component/icon/hidden，
//       同层重跑不动 sortIndex（尊重管理页手动排序）；节点被跨父移动过时，恢复父级同步重排到目标父级末尾
//       （原 sortIndex 属旧父级，带回必撞 {parentId, sortIndex} 唯一索引）
// v1 迁移：旧版 code 字段原位迁移为 perms/path（$unset code、保 _id —— 角色引用不断裂）；
//       legacyCode 只在旧库命中一次，迁移完成后的库重跑走正常幂等路径
// 种入节点放开可改可删：超管玩坏了重跑本种子即恢复（根节点除外，服务端保护）
import 'dotenv/config'
import mongoose from 'mongoose'
import { Permission } from '../src/models/Permission.js'

interface SeedNode {
  name: string
  perms: string // 权限标识：分组与根节点为 ''
  type: 'menu' | 'button'
  parentPath: string // 父节点的 path（根为 ''）；按钮的父也是菜单 path
  path?: string // menu 专用路由地址
  component?: string // menu 叶子专用
  icon?: string // menu 专用
  hidden?: boolean // menu 专用
  legacyCode?: string // v1 迁移键：旧库中该节点的 code 值（按钮 code = perms，无需显式声明）
}

// 根节点：结构键 parentId = null（全树唯一）；perms/path 均为 ''，不是权限值，聚合时天然跳过
const ROOT = { name: '全部数据', perms: '', path: '' }

// parentPath 按父先子后声明：迁移与 upsert 都要靠 pathToId 解析父 id，父必须先就绪
const NODES: SeedNode[] = [
  // ===== 静态页（前端壳承载，人人可见 —— 放开判权定案：perms 与分组同为 ''，path 不进动态路由表） =====
  { name: '系统首页', perms: '', type: 'menu', parentPath: '', path: '/home', component: 'home/index', icon: 'HomeFilled', legacyCode: '/home' },
  { name: '数据大屏', perms: '', type: 'menu', parentPath: '', path: '/screen', component: 'screen/index', icon: 'Monitor', legacyCode: '/screen' },
  // ===== 权限管理 =====
  { name: '权限管理', perms: '', type: 'menu', parentPath: '', path: '/acl', icon: 'Lock', legacyCode: '/acl' },
  { name: '用户管理', perms: 'user:list', type: 'menu', parentPath: '/acl', path: '/acl/users', component: 'acl/user/index', icon: 'User', legacyCode: '/acl/users' },
  { name: '新增用户', perms: 'user:create', type: 'button', parentPath: '/acl/users' },
  { name: '编辑用户', perms: 'user:update', type: 'button', parentPath: '/acl/users' },
  { name: '删除用户', perms: 'user:delete', type: 'button', parentPath: '/acl/users' },
  { name: '分配角色', perms: 'user:assign-role', type: 'button', parentPath: '/acl/users' },
  { name: '角色管理', perms: 'role:list', type: 'menu', parentPath: '/acl', path: '/acl/roles', component: 'acl/role/index', icon: 'UserFilled', legacyCode: '/acl/roles' },
  { name: '新增角色', perms: 'role:create', type: 'button', parentPath: '/acl/roles' },
  { name: '编辑角色', perms: 'role:update', type: 'button', parentPath: '/acl/roles' },
  { name: '删除角色', perms: 'role:delete', type: 'button', parentPath: '/acl/roles' },
  { name: '分配权限', perms: 'role:assign-perm', type: 'button', parentPath: '/acl/roles' },
  { name: '超级授权', perms: 'role:grant-super', type: 'button', parentPath: '/acl/roles' },
  { name: '菜单管理', perms: 'permission:list', type: 'menu', parentPath: '/acl', path: '/acl/menus', component: 'acl/permission/index', icon: 'Menu', legacyCode: '/acl/menus' },
  { name: '新增权限', perms: 'permission:create', type: 'button', parentPath: '/acl/menus' },
  { name: '编辑权限', perms: 'permission:update', type: 'button', parentPath: '/acl/menus' },
  { name: '删除权限', perms: 'permission:delete', type: 'button', parentPath: '/acl/menus' },
  { name: '交换排序', perms: 'permission:swap', type: 'button', parentPath: '/acl/menus' },
  // ===== 商品管理 =====
  { name: '商品管理', perms: '', type: 'menu', parentPath: '', path: '/product', icon: 'Goods', legacyCode: '/product' },
  { name: '品牌管理', perms: 'brand:list', type: 'menu', parentPath: '/product', path: '/product/trademark', component: 'product/trademark/index', icon: 'CollectionTag', legacyCode: '/product/trademark' },
  { name: '添加品牌', perms: 'brand:create', type: 'button', parentPath: '/product/trademark' },
  { name: '编辑品牌', perms: 'brand:update', type: 'button', parentPath: '/product/trademark' },
  { name: '删除品牌', perms: 'brand:delete', type: 'button', parentPath: '/product/trademark' },
  { name: '属性管理', perms: 'attr:list', type: 'menu', parentPath: '/product', path: '/product/attr', component: 'product/attr/index', icon: 'ChromeFilled', legacyCode: '/product/attr' },
  { name: '添加属性', perms: 'attr:create', type: 'button', parentPath: '/product/attr' },
  { name: '编辑属性', perms: 'attr:update', type: 'button', parentPath: '/product/attr' },
  { name: '删除属性', perms: 'attr:delete', type: 'button', parentPath: '/product/attr' },
  { name: 'SPU管理', perms: 'spu:list', type: 'menu', parentPath: '/product', path: '/product/spu', component: 'product/spu/index', icon: 'Management', legacyCode: '/product/spu' },
  { name: '添加SPU', perms: 'spu:create', type: 'button', parentPath: '/product/spu' },
  { name: '编辑SPU', perms: 'spu:update', type: 'button', parentPath: '/product/spu' },
  { name: '删除SPU', perms: 'spu:delete', type: 'button', parentPath: '/product/spu' },
  // SKU 与 SPU 平级挂 /product（对齐若依：C 类页面无子菜单，权限树 = 路由树）；
  // 旧库中 sku 的 parentId 是 spu，迁移只换字段不动父级，父级纠正在第 ③ 步 upsert 的 parentChanged 逻辑完成（同步重排防唯一索引冲突）
  { name: 'SKU管理', perms: 'sku:list', type: 'menu', parentPath: '/product', path: '/product/spu/sku', component: 'product/sku/index', icon: 'List', hidden: true, legacyCode: '/product/spu/sku' },
  { name: '生成SKU', perms: 'sku:generate', type: 'button', parentPath: '/product/spu/sku' },
  { name: '编辑SKU', perms: 'sku:update', type: 'button', parentPath: '/product/spu/sku' },
  { name: '清空SKU', perms: 'sku:clear', type: 'button', parentPath: '/product/spu/sku' },
]

const BASE_FIELDS = (node: SeedNode): Record<string, unknown> => ({
  name: node.name,
  type: node.type,
  perms: node.perms,
  path: node.path ?? '',
  component: node.component ?? '',
  icon: node.icon ?? '',
  hidden: node.hidden ?? false,
})

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI 未配置，请检查 backend/.env')
    process.exit(1)
  }
  await mongoose.connect(process.env.MONGODB_URI)

  const pathToId = new Map<string, mongoose.Types.ObjectId>()

  // ① 根节点：v1 按 code='/' 找旧文档原位迁移；否则按结构键（parentId: null，全树唯一）upsert
  // strict: false —— code 已不在 schema，Mongoose update 严格模式会把 $unset code 静默剥掉（不传库），
  // 必须显式关严格模式，legacy 字段才能真正删除
  const legacyRoot = await Permission.findOne({ code: '/' })
  const rootDoc = legacyRoot
    ? await Permission.findOneAndUpdate(
        { _id: legacyRoot._id },
        {
          $set: { ...BASE_FIELDS({ name: ROOT.name, perms: ROOT.perms, type: 'menu', parentPath: '' }), parentId: null, sortIndex: 0 },
          $unset: { code: '' },
        },
        { returnDocument: 'after', strict: false },
      )
    : await Permission.findOneAndUpdate(
        { parentId: null },
        {
          $set: { ...BASE_FIELDS({ name: ROOT.name, perms: ROOT.perms, type: 'menu', parentPath: '' }), sortIndex: 0 },
          $setOnInsert: { parentId: null },
        },
        { upsert: true, returnDocument: 'after' },
      )
  pathToId.set(ROOT.path, rootDoc!._id) // upsert + returnDocument 保证非空

  // ② v1 迁移：legacyCode 命中旧文档 → 原位换字段 + $unset code（保 _id，角色引用不断裂）。
  //    parentId 此处不动（SKU 的跨父纠正交给第 ③ 步的 parentChanged 逻辑，它会重排 sortIndex 防唯一索引冲突）
  let migrated = 0
  for (const node of NODES) {
    const legacyKey = node.legacyCode ?? node.perms
    const legacy = await Permission.findOne({ code: legacyKey })
    if (!legacy) continue
    // strict: false 同上：$unset code 才能穿透 Mongoose 严格模式真正删掉 legacy 字段
    await Permission.updateOne({ _id: legacy._id }, { $set: BASE_FIELDS(node), $unset: { code: '' } }, { strict: false })
    if (node.path !== undefined) pathToId.set(node.path, legacy._id)
    migrated++
  }

  // ③ 幂等 upsert：菜单按 path、按钮按 perms
  let created = 0
  let synced = 0
  for (const node of NODES) {
    const parentId = pathToId.get(node.parentPath)
    if (!parentId) {
      throw new Error(`父节点未就绪：${node.name} 的 parentPath ${node.parentPath}`)
    }
    const key = node.path !== undefined ? { path: node.path } : { perms: node.perms }
    const exists = await Permission.findOne(key)
    if (exists) {
      // 同层重跑不动 sortIndex（尊重管理页手动排序）；跨父移动（含迁移带来的父级纠正）时
      // 原 sortIndex 属旧父级，直接带回必撞 {parentId, sortIndex} 唯一索引 → 重排到目标父级末尾
      const parentChanged = String(exists.parentId ?? null) !== String(parentId)
      const sync: Record<string, unknown> = { ...BASE_FIELDS(node), parentId }
      if (parentChanged) {
        const last = await Permission.findOne({ parentId })
          .sort({ sortIndex: -1 })
          .select('sortIndex')
          .lean()
        sync.sortIndex = (last?.sortIndex ?? -1) + 1
      }
      await Permission.updateOne({ _id: exists._id }, { $set: sync })
      if (node.path !== undefined) pathToId.set(node.path, exists._id)
      synced++
    } else {
      // 同级 max+1：避免默认 0 撞 {parentId, sortIndex} 唯一索引
      const last = await Permission.findOne({ parentId })
        .sort({ sortIndex: -1 })
        .select('sortIndex')
        .lean()
      const createdDoc = await Permission.create({
        ...BASE_FIELDS(node),
        parentId,
        sortIndex: (last?.sortIndex ?? -1) + 1,
      })
      if (node.path !== undefined) pathToId.set(node.path, createdDoc._id)
      created++
    }
  }

  console.log(
    `✅ 权限树就绪：根节点 1 + 菜单/按钮 ${NODES.length}（v1 迁移 ${migrated}，本次新建 ${created}，同步 ${synced}）`,
  )
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('❌ 种子失败:', err)
  process.exit(1)
})
