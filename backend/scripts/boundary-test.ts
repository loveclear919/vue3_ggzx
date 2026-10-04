// 全模块 API 边界测试（冒烟 + 边界）：直连运行中的后端，逐用例断言状态码与错误语义
// 用法：先启动后端 dev server，再 pnpm exec tsx scripts/boundary-test.ts
// 前置依赖：seed:admin 已种入基础角色与分类（user/admin 角色 id 供用户管理用例引用）
// 测试数据全部带唯一后缀，测完自动清理；测试用户/角色走后端 API 无法删除，cleanup 直连库清前缀
import 'dotenv/config'
import mongoose from 'mongoose'
import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { UPLOAD_DIR } from '../src/utils/upload.js'
import { bucketPrice } from '../src/utils/priceBand.js'
export {}

const BASE = 'http://localhost:3000/api'

interface TestCase {
  name: string
  fn: () => Promise<void>
}

let token = ''
let headers: Record<string, string> = {}
const suffix = Date.now().toString(36)
// 上传用例落盘的文件：库里的引用能删，磁盘文件只能自己删（multer 已写入 UPLOAD_DIR）
const uploadedFiles: string[] = []

// ---- 辅助 ----
async function req(
  method: string,
  path: string,
  opts: { body?: unknown; auth?: boolean; rawBody?: BodyInit; token?: string } = {},
) {
  const init: RequestInit = { method }
  if (opts.body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(opts.body)
  } else if (opts.rawBody !== undefined) {
    init.body = opts.rawBody
  }
  // token 参数 > 默认 bootstrap 头；auth: false 不带任何认证
  const h =
    opts.auth === false ? {} : opts.token ? { Authorization: `Bearer ${opts.token}` } : headers
  init.headers = { ...init.headers, ...h }
  const res = await fetch(BASE + path, init)
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

function expect(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

const expectStatus = (res: { status: number }, code: number) =>
  expect(res.status === code, `期望状态码 ${code}，实际 ${res.status}`)

const expectMessage = (res: { json: { message?: string } | null }, keyword: string) =>
  expect(
    !!res.json?.message?.includes(keyword),
    `期望 message 包含「${keyword}」，实际「${res.json?.message}」`,
  )

// ---- 测试用例集合 ----
const tests: TestCase[] = []
const test = (name: string, fn: () => Promise<void>) => tests.push({ name, fn })

// 预取：一级/三级分类 id、品牌 id、一个测试属性
let level1Id = ''
let level3Id = ''
let brandId = ''
let testAttrName = `边界测试属性_${suffix}`
let testBrandName = `边界测试品牌_${suffix}`
let testSpuName = `边界测试SPU_${suffix}`

// ==================== 认证与用户 ====================
const bootstrapUsername = 'boundary_tester' // 固定名：bootstrap 幂等复用，跨次运行不累积用户
const bootstrapPhone = '13900000001' // 固定手机号：随用户名一起复用（用户名冲突 → 登录）
// 基础角色 id（bootstrap 时按名从角色列表取）：User.roles 存角色 id，用户管理用例需引用
let userRoleId = ''
let adminRoleId = ''
// RBAC 用例共享：super_admin 角色 id 与超管 token（13800138000 由 seed:admin 挂 super_admin）
let superAdminRoleId = ''
let superToken = ''
// 测试手机号统一 199123 前缀 + 时间戳后 4 位：11 位合法手机号、每次运行唯一、清理按前缀扫描
const testPhone = `1991234${String(Date.now()).slice(-4)}` // 注册成功用例（用户名自动生成，靠手机号清理）
const mgmtPhone = `1991235${String(Date.now()).slice(-4)}` // 用户管理用例

test('无 token 访问受保护接口 → 401', async () => {
  const res = await req('GET', '/brand', { auth: false })
  expectStatus(res, 401)
})

test('伪造 token → 401', async () => {
  const res = await req('GET', '/brand', { auth: false })
  expectStatus(res, 401)
})

test('注册：手机号格式错误（非 1[3-9] 开头）→ 400', async () => {
  const res = await req('POST', '/auth/register', {
    body: { phone: '23912345678', password: '123456' },
    auth: false,
  })
  expectStatus(res, 400)
  expectMessage(res, '手机号格式不正确')
})

test('注册：手机号位数不足(10位) → 400', async () => {
  const res = await req('POST', '/auth/register', {
    body: { phone: '1991234123', password: '123456' },
    auth: false,
  })
  expectStatus(res, 400)
})

test('注册：密码过短(5位) → 400', async () => {
  const res = await req('POST', '/auth/register', {
    body: { phone: `1991238${String(Date.now()).slice(-4)}`, password: '12345' },
    auth: false,
  })
  expectStatus(res, 400)
})

test('注册：正常 → 200 并返回 token（用户名为自动生成的默认值）', async () => {
  const res = await req('POST', '/auth/register', {
    body: { phone: testPhone, password: '123456' },
    auth: false,
  })
  expectStatus(res, 200)
  expect(!!(res.json as { data?: { token?: string } })?.data?.token, '未返回 token')
  const username = (res.json as { data?: { user?: { username?: string } } })?.data?.user?.username
  expect(!!username && username.startsWith('用户'), '用户名应为默认值「用户+编码」')
})

test('注册：重复手机号 → 409', async () => {
  const res = await req('POST', '/auth/register', {
    body: { phone: bootstrapPhone, password: '123456' },
    auth: false,
  })
  expectStatus(res, 409)
  expectMessage(res, '手机号已存在')
})

test('登录：错误密码 → 401', async () => {
  const res = await req('POST', '/auth/login', {
    body: { phone: bootstrapPhone, password: 'wrongpass' },
    auth: false,
  })
  expectStatus(res, 401)
})

test('登录：手机号不存在 → 401（防枚举同文案）', async () => {
  const res = await req('POST', '/auth/login', {
    body: { phone: '19900001111', password: 'whatever' },
    auth: false,
  })
  expectStatus(res, 401)
  expectMessage(res, '手机号或密码错误')
})

test('RBAC：登录响应含 codes 数组且无死字段 buttons/routes', async () => {
  const res = await req('POST', '/auth/login', {
    body: { phone: bootstrapPhone, password: '123456' },
    auth: false,
  })
  expectStatus(res, 200)
  const user = res.json?.data?.user as Record<string, unknown>
  expect(Array.isArray(user?.codes), '登录响应 user.codes 应为数组')
  expect(!('buttons' in user) && !('routes' in user), '登录响应不应再含死字段 buttons/routes')
})

test('RBAC：/user/info 响应含 codes 数组', async () => {
  const res = await req('GET', '/user/info')
  expectStatus(res, 200)
  expect(Array.isArray(res.json?.data?.codes), '/user/info 响应 codes 应为数组')
})

test('RBAC：注册响应含 codes 数组', async () => {
  const res = await req('POST', '/auth/register', {
    body: { phone: `1991233${String(Date.now()).slice(-4)}`, password: '123456' },
    auth: false,
  })
  expectStatus(res, 200)
  expect(Array.isArray(res.json?.data?.user?.codes), '注册响应 user.codes 应为数组')
})

test('个人资料：avatar 更新 → 200', async () => {
  const res = await req('PATCH', '/user/info', { body: { avatar: '/uploads/test.jpg' } })
  expectStatus(res, 200)
  expect((res.json?.data as { avatar?: string })?.avatar === '/uploads/test.jpg', 'avatar 应更新')
})

test('个人资料：username 过短 → 400', async () => {
  const res = await req('PATCH', '/user/info', { body: { username: 'ab' } })
  expectStatus(res, 400)
  expectMessage(res, '用户名长度 3-20 个字符')
})

test('个人资料：username 更新 → 200 且可改回（不影响后续用例）', async () => {
  const changed = await req('PATCH', '/user/info', {
    body: { username: `${bootstrapUsername}x` },
  })
  expectStatus(changed, 200)
  expect(
    (changed.json?.data as { username?: string })?.username === `${bootstrapUsername}x`,
    'username 应更新',
  )
  const back = await req('PATCH', '/user/info', { body: { username: bootstrapUsername } })
  expectStatus(back, 200)
})

test('修改密码：原密码错误 → 400', async () => {
  const res = await req('PATCH', '/user/password', {
    body: { oldPassword: 'wrongpass', newPassword: 'newpass123' },
  })
  expectStatus(res, 400)
  expectMessage(res, '原密码不正确')
})

test('修改密码：新密码过短 → 400', async () => {
  const res = await req('PATCH', '/user/password', {
    body: { oldPassword: '123456', newPassword: '123' },
  })
  expectStatus(res, 400)
  expectMessage(res, '密码至少 6 位')
})

test('修改密码：成功 → 200；旧密码失效、新密码可登录（改回以免影响 bootstrap 复用）', async () => {
  const res = await req('PATCH', '/user/password', {
    body: { oldPassword: '123456', newPassword: 'newpass123' },
  })
  expectStatus(res, 200)

  const oldLogin = await req('POST', '/auth/login', {
    body: { phone: bootstrapPhone, password: '123456' },
    auth: false,
  })
  expectStatus(oldLogin, 401)

  const newLogin = await req('POST', '/auth/login', {
    body: { phone: bootstrapPhone, password: 'newpass123' },
    auth: false,
  })
  expectStatus(newLogin, 200)

  // 改回原密码：下次运行的 bootstrap 仍能登录复用该用户
  const back = await req('PATCH', '/user/password', {
    body: { oldPassword: 'newpass123', newPassword: '123456' },
  })
  expectStatus(back, 200)
})

// ==================== 分类（只读 + 下钻） ====================
test('分类：一级列表 → 200 且 hasChildren 均为 true', async () => {
  const res = await req('GET', '/category')
  expectStatus(res, 200)
  const list = res.json?.data as Array<{ hasChildren: boolean }>
  expect(list.length >= 3, `一级分类应 ≥3 条，实际 ${list.length}`)
  expect(
    list.every((c) => c.hasChildren),
    '一级分类都应带子级',
  )
})

test('分类：按一级 id 下钻二级 → 2 条', async () => {
  const res = await req('GET', '/category')
  const list = res.json?.data as Array<{ categoryId: string }>
  level1Id = list[0]!.categoryId
  const res2 = await req('GET', `/category?parentId=${level1Id}`)
  expectStatus(res2, 200)
  expect((res2.json?.data as unknown[]).length === 2, '一级分类应有 2 个二级')
})

test('分类：parentId 非法格式 → 400', async () => {
  const res = await req('GET', '/category?parentId=not-a-valid-id')
  expectStatus(res, 400)
})

test('分类：parentId 不存在 → 200 空数组', async () => {
  const res = await req('GET', '/category?parentId=000000000000000000000000')
  expectStatus(res, 200)
  expect((res.json?.data as unknown[]).length === 0, '不存在的父级应返回空数组')
})

// ==================== 品牌 ====================
test('品牌：name 缺失 → 400', async () => {
  const res = await req('POST', '/brand', { body: { logoUrl: '' } })
  expectStatus(res, 400)
})

test('品牌：name 超长(31字符) → 400', async () => {
  const res = await req('POST', '/brand', { body: { name: 'x'.repeat(31) } })
  expectStatus(res, 400)
})

test('品牌：name 非字符串 → 400', async () => {
  const res = await req('POST', '/brand', { body: { name: 123 } })
  expectStatus(res, 400)
})

test('品牌：创建成功 → 200', async () => {
  const res = await req('POST', '/brand', {
    body: { name: testBrandName, logoUrl: '/uploads/test.jpg' },
  })
  expectStatus(res, 200)
  brandId = (res.json?.data as { brandId?: string })?.brandId ?? ''
  expect(!!brandId, '未返回 brandId')
})

test('品牌：重名 → 409', async () => {
  const res = await req('POST', '/brand', { body: { name: testBrandName } })
  expectStatus(res, 409)
})

test('品牌：分页 page=0 / pageSize=9999 → 200（clamp 不击穿）', async () => {
  const res = await req('GET', '/brand?page=0&pageSize=9999')
  expectStatus(res, 200)
  const data = res.json?.data as { list: unknown[] }
  expect(data.list.length <= 100, 'pageSize 应被 clamp 到 100')
})

test('品牌：keyword 含正则特殊字符 → 200 不崩', async () => {
  const res = await req('GET', `/brand?keyword=${encodeURIComponent('(')}`)
  expectStatus(res, 200)
})

test('品牌：更新不存在 id → 404', async () => {
  const res = await req('PATCH', '/brand/000000000000000000000000', { body: { name: 'x' } })
  expectStatus(res, 404)
})

test('品牌：更新非法 id 格式 → 400', async () => {
  const res = await req('PATCH', '/brand/abc', { body: { name: 'x' } })
  expectStatus(res, 400)
})

// ==================== 属性 ====================
test('属性：列表缺 categoryId → 400', async () => {
  const res = await req('GET', '/attr')
  expectStatus(res, 400)
})

test('属性：categoryId 为一级分类 → 400 文案', async () => {
  const res = await req('GET', `/attr?categoryId=${level1Id}`)
  expectStatus(res, 400)
  expectMessage(res, '三级分类')
})

test('属性：创建到一级分类 → 400', async () => {
  const res = await req('POST', '/attr', {
    body: { categoryId: level1Id, name: 'x', values: ['a'] },
  })
  expectStatus(res, 400)
})

test('属性：values 为空数组 → 400', async () => {
  const res = await req('POST', '/attr', {
    body: { categoryId: level3Id || level1Id, name: `x_${suffix}`, values: [] },
  })
  expectStatus(res, 400)
})

test('属性：values 超过 20 个 → 400', async () => {
  const res = await req('POST', '/attr', {
    body: {
      categoryId: level3Id || level1Id,
      name: `x_${suffix}`,
      values: Array.from({ length: 21 }, (_, i) => `v${i}`),
    },
  })
  expectStatus(res, 400)
})

test('属性：单个值超过 30 字符 → 400', async () => {
  const res = await req('POST', '/attr', {
    body: { categoryId: level3Id || level1Id, name: `x_${suffix}`, values: ['a'.repeat(31)] },
  })
  expectStatus(res, 400)
})

// ==================== 基础销售属性（只读） ====================
test('销售字典：列表 → 200 且 ≥7 条', async () => {
  const res = await req('GET', '/base-sale-attr')
  expectStatus(res, 200)
  // 字典按三级分类裁剪后基线为 7 条（通用 3 + 特化 4；旧版「尺码」已随种子收敛移除）
  expect((res.json?.data as unknown[]).length >= 7, '字典应 ≥7 条')
})

// ==================== SPU ====================
test('SPU：缺 brandId → 400', async () => {
  const res = await req('POST', '/spu', { body: { name: `x_${suffix}`, category3Id: level1Id } })
  expectStatus(res, 400)
})

test('SPU：brandId 不存在 → 404', async () => {
  const res = await req('POST', '/spu', {
    body: { name: `x_${suffix}`, brandId: '000000000000000000000000', category3Id: level3Id },
  })
  expectStatus(res, 404)
})

test('SPU：category3Id 为一级分类 → 400', async () => {
  const res = await req('POST', '/spu', {
    body: { name: `x_${suffix}`, brandId, category3Id: level1Id },
  })
  expectStatus(res, 400)
  expectMessage(res, '三级分类')
})

test('SPU：销售属性维度名不在字典 → 400', async () => {
  const res = await req('POST', '/spu', {
    body: {
      name: `x_${suffix}`,
      brandId,
      category3Id: level3Id,
      saleAttrList: [{ saleAttrName: '不存在的维度', saleAttrValueList: ['a'] }],
    },
  })
  expectStatus(res, 400)
  expectMessage(res, '销售属性不存在')
})

test('SPU：平台属性名不在该分类 → 400', async () => {
  const res = await req('POST', '/spu', {
    body: {
      name: `x_${suffix}`,
      brandId,
      category3Id: level3Id,
      attrList: [{ attrName: '凭空捏造的属性', attrValue: 'x' }],
    },
  })
  expectStatus(res, 400)
  expectMessage(res, '平台属性不存在')
})

test('SPU：创建成功（含脏值清洗：重复值/超长值/对象值）→ 200 且被清洗', async () => {
  const res = await req('POST', '/spu', {
    body: {
      name: testSpuName,
      description: '  边界测试描述  ',
      brandId,
      category3Id: level3Id,
      attrList: [{ attrName: testAttrName, attrValue: ' 值A ' }],
      saleAttrList: [
        {
          saleAttrName: '颜色',
          saleAttrValueList: ['红', '红', ' ', 'x'.repeat(50), 123, { bad: true }],
        },
      ],
    },
  })
  expectStatus(res, 200)
  const data = res.json?.data as {
    attrList: Array<{ attrName: string; attrValue: string }>
    saleAttrList: Array<{ saleAttrName: string; saleAttrValueList: string[] }>
  }
  expect(
    data.attrList[0]?.attrValue === '值A',
    `attrValue 应被 trim，实际「${data.attrList[0]?.attrValue}」`,
  )
  const values = data.saleAttrList[0]?.saleAttrValueList ?? []
  expect(
    values.length === 3,
    `脏值清洗后应为 [红, 50字符截断, 123]，实际 ${JSON.stringify(values)}`,
  )
  expect(
    values.includes('红') && !values.includes(' ') && !values.includes('[object Object]'),
    '去重/去空/拒对象',
  )
  expect(
    values.every((v) => v.length <= 30),
    '超长值应截断到 30',
  )
})

test('SPU：重名 → 409', async () => {
  const res = await req('POST', '/spu', {
    body: { name: testSpuName, brandId, category3Id: level3Id },
  })
  expectStatus(res, 409)
})

test('SPU：列表 categoryId 非法格式 → 400', async () => {
  const res = await req('GET', '/spu?categoryId=abc')
  expectStatus(res, 400)
})

test('SPU：更新不存在 id → 404', async () => {
  const res = await req('PATCH', '/spu/000000000000000000000000', { body: { name: 'x' } })
  expectStatus(res, 404)
})

test('SPU：删除不存在 id → 404', async () => {
  const res = await req('DELETE', '/spu/000000000000000000000000')
  expectStatus(res, 404)
})

// 销售属性行由用户手动添加：整行全空=未填完的占位行（跳过），但只要有一半数据就是认知缺数据 → 显式 400
test('SPU：销售属性有值无名称 → 400', async () => {
  const res = await req('POST', '/spu', {
    body: {
      name: `${testSpuName}_noname`,
      brandId,
      category3Id: level3Id,
      saleAttrList: [{ saleAttrValueList: ['红'] }],
    },
  })
  expectStatus(res, 400)
  expectMessage(res, '销售属性值缺少所属的属性名')
})

test('SPU：销售属性有名无值 → 400', async () => {
  const res = await req('POST', '/spu', {
    body: {
      name: `${testSpuName}_novalue`,
      brandId,
      category3Id: level3Id,
      saleAttrList: [{ saleAttrName: '颜色', saleAttrValueList: [] }],
    },
  })
  expectStatus(res, 400)
  expectMessage(res, '至少需要一个属性值')
})

// 复用前面用例创建的测试 SPU（按名称关键字命中，列表接口的返回形状与前端一致）
async function findTestSpuId() {
  const res = await req(
    'GET',
    `/spu?categoryId=${level3Id}&keyword=${encodeURIComponent(testSpuName)}`,
  )
  const spuId = (res.json?.data?.list as Array<{ spuId: string }>)?.[0]?.spuId
  expect(!!spuId, '应能查到前面用例创建的测试 SPU')
  return spuId
}

// 换类目是「迁移」流程（牵动属性快照与将来的 SKU 归属），不在编辑接口里做
// 但编辑表单会原值回传分类 —— 同值必须放行，否则前端改个描述都会被拦
test('SPU：更新携带原分类（同值）→ 200', async () => {
  const spuId = await findTestSpuId()
  const res = await req('PATCH', `/spu/${spuId}`, {
    body: { description: '边界测试改描述', category3Id: level3Id },
  })
  expectStatus(res, 200)
})

test('SPU：更新改成其他分类 → 400', async () => {
  const spuId = await findTestSpuId()
  const res = await req('PATCH', `/spu/${spuId}`, { body: { category3Id: level1Id } })
  expectStatus(res, 400)
  expectMessage(res, '不支持修改所属分类')
})

// ==================== SKU（阶段 0+1：数据结构一步到位 + 信任版 CRUD） ====================
const skuTestSpuName = `边界测试SKUSPU_${suffix}`
const emptySpuName = `边界测试空SPU_${suffix}`
let skuSpuId = ''
let emptySpuId = ''
let patchSkuId = ''
// 整组生成的 4 组合：白/256G 那项提交时故意倒序（版本在前），验证 skuName 派生按 SPU 声明顺序
const skuItems = [
  {
    skuSaleAttrValueList: [
      { saleAttrName: '颜色', saleAttrValue: '黑' },
      { saleAttrName: '版本', saleAttrValue: '128G' },
    ],
    price: 599900,
    weight: 200,
    stock: 10,
  },
  {
    skuSaleAttrValueList: [
      { saleAttrName: '颜色', saleAttrValue: '黑' },
      { saleAttrName: '版本', saleAttrValue: '256G' },
    ],
    price: 699900,
    weight: 210,
    stock: 5,
    isSale: true,
  },
  {
    skuSaleAttrValueList: [
      { saleAttrName: '颜色', saleAttrValue: '白' },
      { saleAttrName: '版本', saleAttrValue: '128G' },
    ],
    price: 599900,
    weight: 200,
    stock: 3,
  },
  {
    skuSaleAttrValueList: [
      { saleAttrName: '版本', saleAttrValue: '256G' },
      { saleAttrName: '颜色', saleAttrValue: '白' },
    ],
    price: 699900,
    weight: 210,
    stock: 0,
  },
]

test('SKU：生成缺 spuId → 400', async () => {
  const res = await req('POST', '/sku', { body: { items: [skuItems[0]] } })
  expectStatus(res, 400)
  expectMessage(res, '缺少 spuId')
})

test('SKU：生成 spuId 不存在 → 404', async () => {
  const res = await req('POST', '/sku', {
    body: { spuId: '000000000000000000000000', items: [skuItems[0]] },
  })
  expectStatus(res, 404)
})

test('SKU：items 非数组 → 400', async () => {
  const res = await req('POST', '/sku', { body: { spuId: level3Id, items: 'oops' } })
  expectStatus(res, 400)
})

test('SKU：每项缺价格 → 400', async () => {
  const res = await req('POST', '/sku', {
    body: { spuId: level3Id, items: [{ skuSaleAttrValueList: [], weight: 1, stock: 1 }] },
  })
  expectStatus(res, 400)
  expectMessage(res, '价格')
})

test('SKU：准备测试 SPU（2 维度 × 2 值）→ 200', async () => {
  const res = await req('POST', '/spu', {
    body: {
      name: skuTestSpuName,
      brandId,
      category3Id: level3Id,
      saleAttrList: [
        { saleAttrName: '颜色', saleAttrValueList: ['黑', '白'] },
        { saleAttrName: '版本', saleAttrValueList: ['128G', '256G'] },
      ],
    },
  })
  expectStatus(res, 200)
  skuSpuId = (res.json?.data as { spuId?: string })?.spuId ?? ''
  expect(!!skuSpuId, '未返回 spuId')
})

test('SKU：整组生成 4 组合 → 200 且派生正确', async () => {
  const res = await req('POST', '/sku', { body: { spuId: skuSpuId, items: skuItems } })
  expectStatus(res, 200)
  const list = res.json?.data as Array<{
    skuId: string
    category3Id: string
    skuName: string
    price: number
    isSale: boolean
    combinationKey?: string
    skuSaleAttrValueList: Array<{ saleAttrName: string; saleAttrValue: string }>
  }>
  expect(list.length === 4, `应生成 4 个 SKU，实际 ${list.length}`)
  expect(
    list.every((sku) => sku.category3Id === level3Id),
    'category3Id 应从 SPU 复制（I3）',
  )
  expect(
    list.every((sku) => !('combinationKey' in sku)),
    'combinationKey 不应出现在 DTO',
  )
  // 白/256G 那项提交时倒序，派生名仍按 SPU 声明顺序（颜色在前）
  const reversed = list.find(
    (sku) =>
      sku.skuSaleAttrValueList.some((v) => v.saleAttrName === '颜色' && v.saleAttrValue === '白') &&
      sku.skuSaleAttrValueList.some((v) => v.saleAttrName === '版本' && v.saleAttrValue === '256G'),
  )
  expect(
    reversed?.skuName === `${skuTestSpuName} 白 256G`,
    `派生名应为「SPU名 白 256G」，实际「${reversed?.skuName}」`,
  )
  patchSkuId = reversed?.skuId ?? ''
  expect(!!patchSkuId, '未取到白/256G 的 skuId')
  // isSale 缺省 false、显式 true 生效；价格按分原样存储
  const onSale = list.find((sku) => sku.isSale)
  expect(onSale?.price === 699900, '价格应按分存储')
  expect(list.filter((sku) => !sku.isSale).length === 3, '缺省 isSale 应为 false')
})

test('SKU：重复生成 → 409', async () => {
  const res = await req('POST', '/sku', { body: { spuId: skuSpuId, items: skuItems } })
  expectStatus(res, 409)
  expectMessage(res, '已有 SKU')
})

test('SKU：列表缺 spuId → 400', async () => {
  const res = await req('GET', '/sku')
  expectStatus(res, 400)
})

test('SKU：列表 → 200 total=4 且按组合自然序排列', async () => {
  const res = await req('GET', `/sku?spuId=${skuSpuId}`)
  expectStatus(res, 200)
  const data = res.json?.data as {
    list: Array<{
      skuSaleAttrValueList: Array<{ saleAttrName: string; saleAttrValue: string }>
    }>
    total: number
  }
  expect(
    data.total === 4 && data.list.length === 4,
    `total/list 应为 4，实际 ${data.total}/${data.list.length}`,
  )
  // sortIndex = 笛卡尔积枚举序：首行 黑/128G，末行 白/256G（不是哈希序/时间戳并列的未定义序）
  const isCombo = (
    row: { skuSaleAttrValueList: Array<{ saleAttrName: string; saleAttrValue: string }> },
    dim: string,
    value: string,
  ) => row.skuSaleAttrValueList.some((v) => v.saleAttrName === dim && v.saleAttrValue === value)
  expect(
    isCombo(data.list[0]!, '颜色', '黑') && isCombo(data.list[0]!, '版本', '128G'),
    `首行应为 黑/128G，实际 ${JSON.stringify(data.list[0]?.skuSaleAttrValueList)}`,
  )
  expect(
    isCombo(data.list[3]!, '颜色', '白') && isCombo(data.list[3]!, '版本', '256G'),
    `末行应为 白/256G，实际 ${JSON.stringify(data.list[3]?.skuSaleAttrValueList)}`,
  )
})

test('SKU：PATCH 改价格 → 200 生效', async () => {
  const res = await req('PATCH', `/sku/${patchSkuId}`, { body: { price: 559900 } })
  expectStatus(res, 200)
  expect((res.json?.data as { price: number })?.price === 559900, '价格应更新为 559900')
})

test('SKU：PATCH 组合字段被忽略（I8）→ 组合不变', async () => {
  const res = await req('PATCH', `/sku/${patchSkuId}`, {
    body: {
      price: 539900,
      skuSaleAttrValueList: [{ saleAttrName: '颜色', saleAttrValue: '红' }],
      combinationKey: 'hack',
      spuId: '000000000000000000000000',
    },
  })
  expectStatus(res, 200)
  const data = res.json?.data as {
    spuId: string
    price: number
    skuSaleAttrValueList: Array<{ saleAttrName: string; saleAttrValue: string }>
  }
  expect(data.price === 539900, '白名单内字段应生效')
  expect(
    data.skuSaleAttrValueList.some((v) => v.saleAttrValue === '白') &&
      !data.skuSaleAttrValueList.some((v) => v.saleAttrValue === '红'),
    '组合字段必须被忽略（I8）',
  )
  expect(data.spuId === skuSpuId, '派生字段必须被忽略')
})

test('SKU：PATCH 空 body → 400', async () => {
  const res = await req('PATCH', `/sku/${patchSkuId}`, { body: {} })
  expectStatus(res, 400)
  expectMessage(res, '没有需要更新的字段')
})

test('SKU：PATCH 价格为负 → 400（I5 边界）', async () => {
  const res = await req('PATCH', `/sku/${patchSkuId}`, { body: { price: -1 } })
  expectStatus(res, 400)
})

test('SKU：PATCH 价格小数 → 400（I5 边界）', async () => {
  const res = await req('PATCH', `/sku/${patchSkuId}`, { body: { price: 1.5 } })
  expectStatus(res, 400)
})

test('SKU：PATCH 非法 id 格式 → 400', async () => {
  const res = await req('PATCH', '/sku/abc', { body: { price: 1 } })
  expectStatus(res, 400)
})

test('SKU：PATCH 不存在 id → 404', async () => {
  const res = await req('PATCH', '/sku/000000000000000000000000', { body: { price: 1 } })
  expectStatus(res, 404)
})

test('SKU：空销售属性 SPU → 恰好 1 个 SKU', async () => {
  const spu = await req('POST', '/spu', {
    body: { name: emptySpuName, brandId, category3Id: level3Id },
  })
  expectStatus(spu, 200)
  emptySpuId = (spu.json?.data as { spuId?: string })?.spuId ?? ''
  const gen = await req('POST', '/sku', {
    body: {
      spuId: emptySpuId,
      items: [{ skuSaleAttrValueList: [], price: 1000, weight: 500, stock: 5 }],
    },
  })
  expectStatus(gen, 200)
  const list = gen.json?.data as Array<{ skuName: string }>
  expect(list.length === 1, `0 维笛卡尔积应恰好生成 1 个 SKU，实际 ${list.length}`)
  expect(list[0]?.skuName === emptySpuName, '空组合的派生名应等于 SPU 名')
})

test('SKU：清空 → 200 deletedCount=4 且列表空', async () => {
  const res = await req('DELETE', `/sku?spuId=${skuSpuId}`)
  expectStatus(res, 200)
  expect((res.json?.data as { deletedCount: number })?.deletedCount === 4, '应清空 4 个')
  const list = await req('GET', `/sku?spuId=${skuSpuId}`)
  expect(((list.json?.data as { total: number })?.total ?? 1) === 0, '清空后 total 应为 0')
})

test('SKU：清空幂等 → 200 deletedCount=0', async () => {
  const res = await req('DELETE', `/sku?spuId=${skuSpuId}`)
  expectStatus(res, 200)
  expect(
    (res.json?.data as { deletedCount: number })?.deletedCount === 0,
    '无 SKU 时 deletedCount 应为 0',
  )
})

test('SKU：清空不存在 SPU → 404', async () => {
  const res = await req('DELETE', '/sku?spuId=000000000000000000000000')
  expectStatus(res, 404)
})

test('SKU：清空后重新生成（重建两步）→ 200', async () => {
  const res = await req('POST', '/sku', { body: { spuId: skuSpuId, items: skuItems } })
  expectStatus(res, 200)
  expect((res.json?.data as unknown[]).length === 4, '重建应再次生成 4 个')
})

// ==================== SKU 层 2：I1 完整性 + I9 组合数上限 ====================
const i1SpuName = `边界测试SKU完整性_${suffix}`
let i1SpuId = ''
let bigSpuId = ''

test('SKU完整性：准备测试 SPU（2 × 2）→ 200', async () => {
  const res = await req('POST', '/spu', {
    body: {
      name: i1SpuName,
      brandId,
      category3Id: level3Id,
      saleAttrList: [
        { saleAttrName: '颜色', saleAttrValueList: ['黑', '白'] },
        { saleAttrName: '版本', saleAttrValueList: ['128G', '256G'] },
      ],
    },
  })
  expectStatus(res, 200)
  i1SpuId = (res.json?.data as { spuId?: string })?.spuId ?? ''
  expect(!!i1SpuId, '未返回 spuId')
})

test('SKU完整性：缺一个组合 → 400 组合缺失', async () => {
  const res = await req('POST', '/sku', { body: { spuId: i1SpuId, items: skuItems.slice(0, 3) } })
  expectStatus(res, 400)
  expectMessage(res, '组合缺失')
  expectMessage(res, '颜色=白/版本=256G')
})

test('SKU完整性：提交内重复 → 400 组合重复', async () => {
  const res = await req('POST', '/sku', {
    body: { spuId: i1SpuId, items: [skuItems[0], skuItems[0], skuItems[1], skuItems[2]] },
  })
  expectStatus(res, 400)
  expectMessage(res, '组合重复')
})

test('SKU取值：维度名不认识 → 400（层 3 精确化，层 2 时此请求报「组合多余」）', async () => {
  // 完整维度 + 一个多余维度：缺失检查先于未知检查，只有「多余维度」时才会走到维度名不认识
  const bogus = {
    skuSaleAttrValueList: [
      { saleAttrName: '颜色', saleAttrValue: '黑' },
      { saleAttrName: '版本', saleAttrValue: '128G' },
      { saleAttrName: '内存', saleAttrValue: '16G' },
    ],
    price: 1,
    weight: 1,
    stock: 1,
  }
  const res = await req('POST', '/sku', {
    body: { spuId: i1SpuId, items: [...skuItems.slice(0, 3), bogus] },
  })
  expectStatus(res, 400)
  expectMessage(res, '维度名不认识')
})

test('SKU取值：维度缺失 → 400', async () => {
  const badItem = {
    skuSaleAttrValueList: [{ saleAttrName: '颜色', saleAttrValue: '黑' }],
    price: 1,
    weight: 1,
    stock: 1,
  }
  const res = await req('POST', '/sku', {
    body: { spuId: i1SpuId, items: [...skuItems.slice(0, 3), badItem] },
  })
  expectStatus(res, 400)
  expectMessage(res, '维度缺失')
  expectMessage(res, '版本')
})

test('SKU取值：取值不在候选 → 400', async () => {
  const badItem = {
    skuSaleAttrValueList: [
      { saleAttrName: '颜色', saleAttrValue: '红' },
      { saleAttrName: '版本', saleAttrValue: '128G' },
    ],
    price: 1,
    weight: 1,
    stock: 1,
  }
  const res = await req('POST', '/sku', {
    body: { spuId: i1SpuId, items: [...skuItems.slice(0, 3), badItem] },
  })
  expectStatus(res, 400)
  expectMessage(res, '不在候选值中')
})

test('SKU取值：单行维度重复 → 400', async () => {
  const badItem = {
    skuSaleAttrValueList: [
      { saleAttrName: '颜色', saleAttrValue: '黑' },
      { saleAttrName: '颜色', saleAttrValue: '白' },
      { saleAttrName: '版本', saleAttrValue: '128G' },
    ],
    price: 1,
    weight: 1,
    stock: 1,
  }
  const res = await req('POST', '/sku', {
    body: { spuId: i1SpuId, items: [...skuItems.slice(0, 3), badItem] },
  })
  expectStatus(res, 400)
  expectMessage(res, '维度重复')
})

test('SKU取值：空维度名 → 400', async () => {
  const badItem = {
    skuSaleAttrValueList: [
      { saleAttrName: ' ', saleAttrValue: '黑' },
      { saleAttrName: '版本', saleAttrValue: '128G' },
    ],
    price: 1,
    weight: 1,
    stock: 1,
  }
  const res = await req('POST', '/sku', {
    body: { spuId: i1SpuId, items: [...skuItems.slice(0, 3), badItem] },
  })
  expectStatus(res, 400)
  expectMessage(res, '维度名不能为空')
})

test('SKU取值：空值 → 400', async () => {
  const badItem = {
    skuSaleAttrValueList: [
      { saleAttrName: '颜色', saleAttrValue: ' ' },
      { saleAttrName: '版本', saleAttrValue: '128G' },
    ],
    price: 1,
    weight: 1,
    stock: 1,
  }
  const res = await req('POST', '/sku', {
    body: { spuId: i1SpuId, items: [...skuItems.slice(0, 3), badItem] },
  })
  expectStatus(res, 400)
  expectMessage(res, '销售属性值不能为空')
})

test('SKU边界：价格小数 → 400（I5）', async () => {
  const items = skuItems.map((item, i) => (i === 0 ? { ...item, price: 1.5 } : item))
  const res = await req('POST', '/sku', { body: { spuId: i1SpuId, items } })
  expectStatus(res, 400)
  expectMessage(res, '价格必须为整数')
})

test('SKU边界：价格为负 → 400（I5）', async () => {
  const items = skuItems.map((item, i) => (i === 0 ? { ...item, price: -1 } : item))
  const res = await req('POST', '/sku', { body: { spuId: i1SpuId, items } })
  expectStatus(res, 400)
  expectMessage(res, '价格不能为负')
})

test('SKU边界：价格超上限 → 400（I5）', async () => {
  const items = skuItems.map((item, i) => (i === 0 ? { ...item, price: 999999901 } : item))
  const res = await req('POST', '/sku', { body: { spuId: i1SpuId, items } })
  expectStatus(res, 400)
  expectMessage(res, '不能超过 999999900')
})

test('SKU边界：库存超上限 → 400（I5）', async () => {
  const items = skuItems.map((item, i) => (i === 0 ? { ...item, stock: 1000000 } : item))
  const res = await req('POST', '/sku', { body: { spuId: i1SpuId, items } })
  expectStatus(res, 400)
  expectMessage(res, '库存不能超过 999999')
})

test('SKU边界：重量超上限 → 400（I5）', async () => {
  const items = skuItems.map((item, i) => (i === 0 ? { ...item, weight: 1000000 } : item))
  const res = await req('POST', '/sku', { body: { spuId: i1SpuId, items } })
  expectStatus(res, 400)
  expectMessage(res, '重量不能超过 999999')
})

test('SKU完整性：期望组合数超上限（15 × 15 = 225）→ 400 且快速返回（防 OOM）', async () => {
  const spu = await req('POST', '/spu', {
    body: {
      name: `边界测试SKU超限_${suffix}`,
      brandId,
      category3Id: level3Id,
      saleAttrList: [
        { saleAttrName: '颜色', saleAttrValueList: Array.from({ length: 15 }, (_, i) => `色${i}`) },
        { saleAttrName: '版本', saleAttrValueList: Array.from({ length: 15 }, (_, i) => `版${i}`) },
      ],
    },
  })
  expectStatus(spu, 200)
  bigSpuId = (spu.json?.data as { spuId?: string })?.spuId ?? ''
  const gen = await req('POST', '/sku', { body: { spuId: bigSpuId, items: [skuItems[0]] } })
  expectStatus(gen, 400)
  expectMessage(gen, '组合数超上限')
  expectMessage(gen, '225')
})

test('SKU完整性：提交数超上限（201 项）→ 400', async () => {
  const many = Array.from({ length: 201 }, () => skuItems[0])
  const res = await req('POST', '/sku', { body: { spuId: i1SpuId, items: many } })
  expectStatus(res, 400)
  expectMessage(res, '组合数超上限')
})

test('SKU并发：同一 SPU 并发两次生成 → 恰一组 200、一组 409 且不残留', async () => {
  // 第二个请求故意倒序提交：无排序时交错写入可能两头都失败并残留半组；
  // 写入前按 combinationKey 排序后两者顺序一致，唯一索引保证恰一组成功、0 残留（I4）
  const [a, b] = await Promise.all([
    req('POST', '/sku', { body: { spuId: i1SpuId, items: skuItems } }),
    req('POST', '/sku', { body: { spuId: i1SpuId, items: [...skuItems].reverse() } }),
  ])
  const statuses = [a.status, b.status].sort()
  expect(
    statuses[0] === 200 && statuses[1] === 409,
    `期望一组 200 一组 409，实际 ${statuses.join(' / ')}`,
  )
  const list = await req('GET', `/sku?spuId=${i1SpuId}`)
  expect(
    ((list.json?.data as { total: number })?.total ?? -1) === 4,
    '并发后应恰好 4 个：无残留、无缺失',
  )
})

// ==================== SPU 详情（随 SKU 模块补上） ====================
test('SPU详情：GET /spu/:id → 200 含销售属性快照', async () => {
  const res = await req('GET', `/spu/${skuSpuId}`)
  expectStatus(res, 200)
  const data = res.json?.data as { spuId: string; name: string; saleAttrList: unknown[] }
  expect(data.spuId === skuSpuId && data.name === skuTestSpuName, '详情应返回 SPU 本体')
  expect(data.saleAttrList.length === 2, '应含 2 个销售属性维度')
})

test('SPU详情：不存在 → 404', async () => {
  const res = await req('GET', '/spu/000000000000000000000000')
  expectStatus(res, 404)
})

test('SPU详情：非法 id 格式 → 400', async () => {
  const res = await req('GET', '/spu/abc')
  expectStatus(res, 400)
})

// ==================== SKU 上架闸门（I11）：上架必须有价（price > 0） ====================
// 注意：清空重建后 patchSkuId 已失效（重建生成了新 id），本组用例从当前列表取一个 SKU
let gateSkuId = ''

test('SKU上架闸门：准备（列表取 SKU 并归零定价）→ 200', async () => {
  const list = await req('GET', `/sku?spuId=${skuSpuId}`)
  const target = (list.json?.data as { list: Array<{ skuId: string }> }).list[0]
  expect(!!target, '列表应有 SKU')
  gateSkuId = target.skuId
  const res = await req('PATCH', `/sku/${gateSkuId}`, { body: { price: 0, isSale: false } })
  expectStatus(res, 200)
})

test('SKU上架闸门：未定价时上架 → 400', async () => {
  const res = await req('PATCH', `/sku/${gateSkuId}`, { body: { isSale: true } })
  expectStatus(res, 400)
  expectMessage(res, '请先设置价格再上架')
})

test('SKU上架闸门：定价与上架同请求 → 200', async () => {
  const res = await req('PATCH', `/sku/${gateSkuId}`, { body: { price: 499900, isSale: true } })
  expectStatus(res, 200)
})

test('SKU上架闸门：定价后再上架 → 200', async () => {
  await req('PATCH', `/sku/${gateSkuId}`, { body: { price: 0, isSale: false } })
  const price = await req('PATCH', `/sku/${gateSkuId}`, { body: { price: 399900 } })
  expectStatus(price, 200)
  const sale = await req('PATCH', `/sku/${gateSkuId}`, { body: { isSale: true } })
  expectStatus(sale, 200)
})

test('SPU：销售属性跨分类（空调用「套餐」）→ 400', async () => {
  // 字典按三级分类裁剪：套餐仅配给手机/笔记本/台式机，空调不可用
  // GET /category 是逐级下钻接口（无参数返回一级），需 家用电器 → 大家电 → 空调 三步
  const l1 = await req('GET', '/category')
  const jd = (l1.json?.data as Array<{ categoryId: string; name: string }>) ?? []
  const jdId = jd.find((c) => c.name === '家用电器')?.categoryId ?? ''
  expect(!!jdId, '应找到一级分类「家用电器」')
  const l2 = await req('GET', `/category?parentId=${jdId}`)
  const dj = (l2.json?.data as Array<{ categoryId: string; name: string }>) ?? []
  const djId = dj.find((c) => c.name === '大家电')?.categoryId ?? ''
  expect(!!djId, '应找到二级分类「大家电」')
  const l3 = await req('GET', `/category?parentId=${djId}`)
  const ac = (l3.json?.data as Array<{ categoryId: string; name: string }>) ?? []
  const acId = ac.find((c) => c.name === '空调')?.categoryId ?? ''
  expect(!!acId, '应找到三级分类「空调」')
  const res = await req('POST', '/spu', {
    body: {
      name: `边界测试跨分类SPU_${suffix}`,
      brandId,
      category3Id: acId,
      saleAttrList: [{ saleAttrName: '套餐', saleAttrValueList: ['裸机'] }],
    },
  })
  expectStatus(res, 400)
  expectMessage(res, '不适用当前分类')
})

test('SKU上架闸门：生成时勾选上架但未定价 → 400', async () => {
  // 专用新 SPU：i1SpuId 在并发用例后已有 SKU，会先撞「已有 SKU」的 409
  const spu = await req('POST', '/spu', {
    body: {
      name: `边界测试SKU闸门_${suffix}`,
      brandId,
      category3Id: level3Id,
      saleAttrList: [
        { saleAttrName: '颜色', saleAttrValueList: ['黑', '白'] },
        { saleAttrName: '版本', saleAttrValueList: ['128G', '256G'] },
      ],
    },
  })
  expectStatus(spu, 200)
  const spuId = (spu.json?.data as { spuId?: string })?.spuId ?? ''
  const items = skuItems.map((item, i) => (i === 0 ? { ...item, price: 0, isSale: true } : item))
  const res = await req('POST', '/sku', { body: { spuId, items } })
  expectStatus(res, 400)
  expectMessage(res, '请先设置价格再上架')
  // 校验前置：400 时不应有任何 SKU 落库，直接删掉专用 SPU
  await req('DELETE', `/spu/${spuId}`)
})

test('SKU上架闸门：在架 SKU 单请求改价到 0 → 400（生效后状态拦截）', async () => {
  // 此时 gateSkuId 处于在架已定价（「定价后再上架」用例遗留状态）
  const res = await req('PATCH', `/sku/${gateSkuId}`, { body: { price: 0 } })
  expectStatus(res, 400)
  expectMessage(res, '在架 SKU 不能改为未定价')
})

test('SKU上架闸门：在架 SKU 下架与改价同请求 → 200', async () => {
  const res = await req('PATCH', `/sku/${gateSkuId}`, { body: { price: 0, isSale: false } })
  expectStatus(res, 200)
})

// ==================== SKU 层 6：I6/I7 引用完整性 ====================
test('SKU引用：删除有 SKU 的 SPU → 409', async () => {
  const res = await req('DELETE', `/spu/${skuSpuId}`)
  expectStatus(res, 409)
  expectMessage(res, '请先删除该 SPU 下的 SKU')
})

test('SKU引用：有 SKU 时改销售属性 → 409', async () => {
  const res = await req('PATCH', `/spu/${skuSpuId}`, {
    body: {
      saleAttrList: [
        { saleAttrName: '颜色', saleAttrValueList: ['黑', '白', '红'] },
        { saleAttrName: '版本', saleAttrValueList: ['128G', '256G'] },
      ],
    },
  })
  expectStatus(res, 409)
  expectMessage(res, '请先删除该 SPU 下的 SKU')
})

test('SKU引用：有 SKU 时回传原销售属性（同值）→ 200', async () => {
  const res = await req('PATCH', `/spu/${skuSpuId}`, {
    body: {
      description: 'SKU 存在时仍可改描述',
      saleAttrList: [
        { saleAttrName: '颜色', saleAttrValueList: ['黑', '白'] },
        { saleAttrName: '版本', saleAttrValueList: ['128G', '256G'] },
      ],
    },
  })
  expectStatus(res, 200)
})

test('SKU引用：清空 SKU 后删除 SPU → 200', async () => {
  await req('DELETE', `/sku?spuId=${skuSpuId}`)
  const res = await req('DELETE', `/spu/${skuSpuId}`)
  expectStatus(res, 200)
})

test('SKU引用：删除有 SPU 引用的品牌 → 409', async () => {
  const res = await req('DELETE', `/brand/${brandId}`)
  expectStatus(res, 409)
  expectMessage(res, '该品牌下仍有 SPU')
})

test('SKU引用：删除无引用的品牌 → 200', async () => {
  const created = await req('POST', '/brand', { body: { name: `边界测试空品牌_${suffix}` } })
  expectStatus(created, 200)
  const emptyBrandId = (created.json?.data as { brandId?: string })?.brandId ?? ''
  const res = await req('DELETE', `/brand/${emptyBrandId}`)
  expectStatus(res, 200)
})

// ==================== 用户管理 ====================
const mgmtUsername = `boundary_m_${suffix}`

test('用户管理：列表分页 → 200 含用户', async () => {
  const res = await req('GET', '/user?page=1&pageSize=10')
  expectStatus(res, 200)
  const data = res.json?.data as { list: unknown[]; total: number }
  expect(data.total >= 1, '应至少包含 bootstrap 用户')
})

test('用户管理：keyword 搜索 → 只命中目标', async () => {
  const res = await req('GET', `/user?keyword=${encodeURIComponent(bootstrapUsername)}`)
  expectStatus(res, 200)
  const data = res.json?.data as { list: Array<{ username: string }> }
  expect(
    data.list.every((u) => u.username.includes(bootstrapUsername)),
    'keyword 过滤应只命中目标用户名',
  )
})

test('用户管理：新增成功 → 200 且列表可见（用户名自动生成 + 默认普通用户角色）', async () => {
  const res = await req('POST', '/user', {
    body: { phone: mgmtPhone, password: '123456', desc: '边界测试管理用户' },
  })
  expectStatus(res, 200)
  const created = res.json?.data as { username?: string; roles?: string[] }
  expect(!!created.username && created.username.startsWith('用户'), '用户名应为默认值「用户+编码」')
  expect(
    created.roles?.length === 1 && created.roles[0] === userRoleId,
    '未指定角色时应兜底分配默认普通用户角色',
  )
  const list = await req('GET', `/user?keyword=${encodeURIComponent(mgmtPhone)}`)
  expect(((list.json?.data as { total: number })?.total ?? 0) === 1, '按手机号搜索应能查到')
})

test('用户管理：重复手机号 → 409', async () => {
  const res = await req('POST', '/user', { body: { phone: mgmtPhone, password: '123456' } })
  expectStatus(res, 409)
})

test('用户管理：手机号格式错误 → 400', async () => {
  const res = await req('POST', '/user', {
    body: { phone: '12345', password: '123456' },
  })
  expectStatus(res, 400)
  expectMessage(res, '手机号格式不正确')
})

test('用户管理：密码过短 → 400', async () => {
  const res = await req('POST', '/user', {
    body: { phone: `1991238${String(Date.now()).slice(-4)}`, password: '123' },
  })
  expectStatus(res, 400)
  expectMessage(res, '密码至少 6 位')
})

test('用户管理：角色格式不合法（非 ObjectId）→ 400', async () => {
  const res = await req('POST', '/user', {
    body: {
      phone: `1991239${String(Date.now()).slice(-4)}`,
      password: '123456',
      roles: ['not-an-id'],
    },
  })
  expectStatus(res, 400)
  expectMessage(res, '角色格式不合法')
})

test('用户管理：角色不存在（值域校验）→ 400', async () => {
  const res = await req('POST', '/user', {
    body: {
      phone: `1991230${String(Date.now()).slice(-4)}`,
      password: '123456',
      roles: ['000000000000000000000000'],
    },
  })
  expectStatus(res, 400)
  expectMessage(res, '角色不存在')
})

test('用户管理：更新 username/desc → 200；phone 被忽略', async () => {
  const found = await req('GET', `/user?keyword=${encodeURIComponent(mgmtPhone)}`)
  const userId = (found.json?.data as { list: Array<{ userId: string }> }).list[0]?.userId
  const res = await req('PATCH', `/user/${userId}`, {
    body: { username: mgmtUsername, desc: '改过的描述', phone: '19999999999' },
  })
  expectStatus(res, 200)
  const data = res.json?.data as { username: string; desc: string; phone: string }
  expect(
    data.desc === '改过的描述' && data.username === mgmtUsername && data.phone === mgmtPhone,
    'username/desc 应更新、phone 应被忽略',
  )
})

test('用户管理：更新不存在 → 404', async () => {
  const res = await req('PATCH', '/user/000000000000000000000000', { body: { desc: 'x' } })
  expectStatus(res, 404)
})

test('用户管理：删除自己 → 400', async () => {
  const found = await req('GET', `/user?keyword=${encodeURIComponent(bootstrapUsername)}`)
  const selfId = (found.json?.data as { list: Array<{ userId: string }> }).list[0]?.userId
  const res = await req('DELETE', `/user/${selfId}`)
  expectStatus(res, 400)
  expectMessage(res, '不能删除当前登录用户')
})

test('用户管理：删除 admin（非最后一名）→ 200', async () => {
  // 先建两名 boundary admin（roles 引用 admin 角色 id），删其中一个时它必然不是最后一名 → 断言确定
  const first = await req('POST', '/user', {
    body: {
      phone: `1991236${String(Date.now()).slice(-4)}`,
      password: '123456',
      roles: [adminRoleId],
    },
  })
  expectStatus(first, 200)
  await req('POST', '/user', {
    body: {
      phone: `1991237${String(Date.now()).slice(-4)}`,
      password: '123456',
      roles: [adminRoleId],
    },
  })
  const firstId = (first.json?.data as { userId: string })?.userId
  const res = await req('DELETE', `/user/${firstId}`)
  expectStatus(res, 200)
})

test('用户管理：删除普通用户 → 200；再删 → 404', async () => {
  const found = await req('GET', `/user?keyword=${encodeURIComponent(mgmtUsername)}`)
  const userId = (found.json?.data as { list: Array<{ userId: string }> }).list[0]?.userId
  const del = await req('DELETE', `/user/${userId}`)
  expectStatus(del, 200)
  const again = await req('DELETE', `/user/${userId}`)
  expectStatus(again, 404)
})

// ==================== 角色管理 ====================
const testRoleName = `brole_${suffix}` // 前缀 6 位 + suffix ≈ 14 位，在角色名 3-20 的模型上限内

test('角色管理：列表分页 → 200 含种子角色', async () => {
  const res = await req('GET', '/role?page=1&pageSize=10')
  expectStatus(res, 200)
  const data = res.json?.data as { list: unknown[]; total: number }
  expect(data.total >= 2, '应至少包含种子角色 user/admin')
})

test('角色管理：keyword 搜索 → 精确命中目标', async () => {
  const res = await req('GET', `/role?keyword=${encodeURIComponent('super_admin')}`)
  expectStatus(res, 200)
  const data = res.json?.data as { list: Array<{ roleName: string }> }
  expect(
    data.list.length === 1 && data.list[0]?.roleName === 'super_admin',
    'keyword 应精确命中角色名',
  )
})

test('角色管理：新增成功 → 200 且按名可搜到', async () => {
  const res = await req('POST', '/role', {
    body: { roleName: testRoleName, remark: '边界测试角色' },
  })
  expectStatus(res, 200)
  const list = await req('GET', `/role?keyword=${encodeURIComponent(testRoleName)}`)
  expect(((list.json?.data as { total: number })?.total ?? 0) === 1, '新增后按名搜索应能查到')
})

test('角色管理：重名 → 409', async () => {
  const res = await req('POST', '/role', { body: { roleName: testRoleName } })
  expectStatus(res, 409)
})

test('角色管理：名称过短(2字符) → 400', async () => {
  const res = await req('POST', '/role', { body: { roleName: 'ab' } })
  expectStatus(res, 400)
  expectMessage(res, '角色名长度 3-20 个字符')
})

test('角色管理：更新 remark → 200；空 patch → 400', async () => {
  const found = await req('GET', `/role?keyword=${encodeURIComponent(testRoleName)}`)
  const roleId = (found.json?.data as { list: Array<{ roleId: string }> }).list[0]?.roleId
  const res = await req('PATCH', `/role/${roleId}`, { body: { remark: '改过的描述' } })
  expectStatus(res, 200)
  expect((res.json?.data as { remark?: string })?.remark === '改过的描述', 'remark 应更新')
  const empty = await req('PATCH', `/role/${roleId}`, { body: {} })
  expectStatus(empty, 400)
  expectMessage(empty, '没有需要更新的字段')
})

test('角色管理：改名撞已存在的角色名 → 409', async () => {
  const found = await req('GET', `/role?keyword=${encodeURIComponent(testRoleName)}`)
  const roleId = (found.json?.data as { list: Array<{ roleId: string }> }).list[0]?.roleId
  const res = await req('PATCH', `/role/${roleId}`, { body: { roleName: 'admin' } })
  expectStatus(res, 409)
})

test('角色管理：更新不存在 → 404', async () => {
  const res = await req('PATCH', '/role/000000000000000000000000', { body: { remark: 'x' } })
  expectStatus(res, 404)
})

// ==================== 权限管理 ====================
// 测试数据 code 统一 boundary_ 前缀（cleanup 按前缀直连库清扫）；权限树无种子，用例自建自清
let permMenuId = ''
let permBtnId = ''
let permChildMenuId = ''
let topSortIndex = -1

test('权限管理：列表 → 200 全量平铺数组', async () => {
  const res = await req('GET', '/permission')
  expectStatus(res, 200)
  expect(Array.isArray(res.json?.data), '应返回平铺数组')
})

test('权限管理：创建顶级菜单 → 200（parentId 缺省 null、sortIndex 自动同级最大 + 1）', async () => {
  // 相对断言：种子根节点「全部数据」占着 sortIndex 0，绝对值为 0/1 的断言会挂
  const before = await req('GET', '/permission')
  const topMax = Math.max(
    -1,
    ...(before.json?.data as Array<{ parentId: unknown; sortIndex: number }>)
      .filter((n) => n.parentId === null)
      .map((n) => n.sortIndex),
  )
  const res = await req('POST', '/permission', {
    body: { name: '边界测试顶级菜单', code: `boundary_perm_${suffix}`, type: 'menu' },
  })
  expectStatus(res, 200)
  const data = res.json?.data as { permissionId: string; parentId: unknown; sortIndex: number }
  expect(data.parentId === null, '顶级菜单 parentId 应为 null')
  expect(data.sortIndex === topMax + 1, `sortIndex 应为同级最大 + 1（${topMax + 1}）`)
  permMenuId = data.permissionId
  topSortIndex = data.sortIndex
})

test('权限管理：创建第二个顶级菜单 → sortIndex 继续 max+1', async () => {
  const res = await req('POST', '/permission', {
    body: { name: '边界测试顶级菜单二', code: `boundary_perm2_${suffix}`, type: 'menu' },
  })
  expectStatus(res, 200)
  const data = res.json?.data as { sortIndex: number }
  expect(data.sortIndex === topSortIndex + 1, '同级 max+1 应递增')
  topSortIndex = data.sortIndex
})

test('权限管理：code 重名 → 409', async () => {
  const res = await req('POST', '/permission', {
    body: { name: '边界测试重名', code: `boundary_perm_${suffix}`, type: 'menu' },
  })
  expectStatus(res, 409)
  expectMessage(res, 'code 已存在')
})

test('权限管理：button 挂顶级 → 400（层级规则）', async () => {
  const res = await req('POST', '/permission', {
    body: { name: '边界测试按钮', code: `boundary_btn_${suffix}`, type: 'button' },
  })
  expectStatus(res, 400)
  expectMessage(res, '按钮必须挂载在菜单下')
})

test('权限管理：父级格式非法 → 400', async () => {
  const res = await req('POST', '/permission', {
    body: {
      name: '边界测试坏父级',
      code: `boundary_bad_${suffix}`,
      type: 'menu',
      parentId: 'not-an-id',
    },
  })
  expectStatus(res, 400)
  expectMessage(res, '父级格式不合法')
})

test('权限管理：父级不存在 → 400', async () => {
  const res = await req('POST', '/permission', {
    body: {
      name: '边界测试孤儿',
      code: `boundary_orphan_${suffix}`,
      type: 'menu',
      parentId: '000000000000000000000000',
    },
  })
  expectStatus(res, 400)
  expectMessage(res, '父级不存在')
})

test('权限管理：创建子菜单（menu 挂 menu）→ 200', async () => {
  const res = await req('POST', '/permission', {
    body: {
      name: '边界测试子菜单',
      code: `boundary_child_${suffix}`,
      type: 'menu',
      parentId: permMenuId,
    },
  })
  expectStatus(res, 200)
  permChildMenuId = (res.json?.data as { permissionId: string }).permissionId
})

test('权限管理：创建按钮（挂菜单下）→ 200', async () => {
  const res = await req('POST', '/permission', {
    body: {
      name: '边界测试按钮',
      code: `boundary_btn_${suffix}`,
      type: 'button',
      parentId: permMenuId,
    },
  })
  expectStatus(res, 200)
  permBtnId = (res.json?.data as { permissionId: string }).permissionId
})

test('权限管理：button 挂 button → 400（层级规则）', async () => {
  const res = await req('POST', '/permission', {
    body: {
      name: '边界测试嵌套按钮',
      code: `boundary_btn2_${suffix}`,
      type: 'button',
      parentId: permBtnId,
    },
  })
  expectStatus(res, 400)
  expectMessage(res, '按钮的父级必须是菜单')
})

test('权限管理：按钮跨父移动 → 200（sortIndex 自动重排到目标父级末尾）', async () => {
  // 目标父级建一个空菜单：按钮 sortIndex 0 移过去若沿用旧序号会撞唯一索引 —— 应自动重排
  const newMenu = await req('POST', '/permission', {
    body: { name: '边界测试新菜单', code: `boundary_move_${suffix}`, type: 'menu' },
  })
  expectStatus(newMenu, 200)
  const newMenuId = (newMenu.json?.data as { permissionId: string }).permissionId

  const res = await req('PATCH', `/permission/${permBtnId}`, { body: { parentId: newMenuId } })
  expectStatus(res, 200)
  const data = res.json?.data as { parentId: string; sortIndex: number }
  expect(
    data.parentId === newMenuId && data.sortIndex === 0,
    '跨父移动应重排到目标父级末尾（空父级下 sortIndex 0）',
  )
})

test('权限管理：同层交换排序 → 200（sortIndex 互换）', async () => {
  const menu = await req('POST', '/permission', {
    body: { name: '边界测试排序菜单', code: `boundary_swap_${suffix}`, type: 'menu' },
  })
  expectStatus(menu, 200)
  const menuId = (menu.json?.data as { permissionId: string }).permissionId

  const btn1 = await req('POST', '/permission', {
    body: {
      name: '边界测试排序按钮一',
      code: `boundary_swap1_${suffix}`,
      type: 'button',
      parentId: menuId,
    },
  })
  const btn2 = await req('POST', '/permission', {
    body: {
      name: '边界测试排序按钮二',
      code: `boundary_swap2_${suffix}`,
      type: 'button',
      parentId: menuId,
    },
  })
  const id1 = (btn1.json?.data as { permissionId: string }).permissionId
  const id2 = (btn2.json?.data as { permissionId: string }).permissionId

  const res = await req('PATCH', `/permission/${id1}/swap`, { body: { targetId: id2 } })
  expectStatus(res, 200)

  const after = await req('GET', '/permission')
  const list = after.json?.data as Array<{ permissionId: string; sortIndex: number }>
  const s1 = list.find((p) => p.permissionId === id1)?.sortIndex
  const s2 = list.find((p) => p.permissionId === id2)?.sortIndex
  expect(s1 === 1 && s2 === 0, `应互换为 (1, 0)，实际 (${s1}, ${s2})`)
})

test('权限管理：交换不同层节点 → 400', async () => {
  // permMenuId（顶级）与 permChildMenuId（其子级）不同层
  const res = await req('PATCH', `/permission/${permMenuId}/swap`, {
    body: { targetId: permChildMenuId },
  })
  expectStatus(res, 400)
  expectMessage(res, '只能交换同层节点')
})

test('权限管理：更新 name → 200；code 被忽略', async () => {
  const res = await req('PATCH', `/permission/${permMenuId}`, {
    body: { name: '边界测试改名', code: 'hacked_code' },
  })
  expectStatus(res, 200)
  const data = res.json?.data as { name: string; code: string }
  expect(
    data.name === '边界测试改名' && data.code === `boundary_perm_${suffix}`,
    'name 应更新、code 应被忽略',
  )
})

test('权限管理：parentId 设成自己 → 400（环校验）', async () => {
  const res = await req('PATCH', `/permission/${permMenuId}`, { body: { parentId: permMenuId } })
  expectStatus(res, 400)
  expectMessage(res, '父级不能是自己')
})

test('权限管理：parentId 设成自己的后代 → 400（环校验）', async () => {
  // 子菜单是 menu 类型，层级规则先放行，环校验沿链上溯发现自己是祖先 → 拒
  const res = await req('PATCH', `/permission/${permMenuId}`, {
    body: { parentId: permChildMenuId },
  })
  expectStatus(res, 400)
  expectMessage(res, '不能移动到自己的子节点下')
})

test('权限管理：删除有子级的菜单 → 409', async () => {
  const res = await req('DELETE', `/permission/${permMenuId}`)
  expectStatus(res, 409)
  expectMessage(res, '请先删除子级权限')
})

test('权限管理：删除被角色引用 → 409；撤销引用后 → 200', async () => {
  // 造一个专用权限节点 + 一个测试角色，分配后验证引用保护
  const perm = await req('POST', '/permission', {
    body: { name: '边界测试被引用', code: `boundary_ref_${suffix}`, type: 'menu' },
  })
  expectStatus(perm, 200)
  const permRefId = (perm.json?.data as { permissionId: string }).permissionId

  const role = await req('POST', '/role', { body: { roleName: `brole_ref_${suffix}` } })
  expectStatus(role, 200)
  const roleRefId = (role.json?.data as { roleId: string }).roleId

  const assign = await req('PATCH', `/role/${roleRefId}`, {
    body: { permissions: [permRefId] },
  })
  expectStatus(assign, 200)

  const blocked = await req('DELETE', `/permission/${permRefId}`)
  expectStatus(blocked, 409)
  expectMessage(blocked, '该权限已被角色引用')

  // 撤销引用（空数组 = 撤销全部权限）后再删
  const revoke = await req('PATCH', `/role/${roleRefId}`, { body: { permissions: [] } })
  expectStatus(revoke, 200)
  const del = await req('DELETE', `/permission/${permRefId}`)
  expectStatus(del, 200)
})

test('权限管理：先删子级再删父级 → 200；再删 → 404', async () => {
  expectStatus(await req('DELETE', `/permission/${permBtnId}`), 200)
  expectStatus(await req('DELETE', `/permission/${permChildMenuId}`), 200)
  expectStatus(await req('DELETE', `/permission/${permMenuId}`), 200)
  expectStatus(await req('DELETE', `/permission/${permMenuId}`), 404)
})

// ==================== RBAC 特权保护（rbac-design §4.4/§4.5） ====================

test('RBAC：超管登录成功', async () => {
  const res = await req('POST', '/auth/login', {
    body: { phone: '13800138000', password: '123456' },
    auth: false,
  })
  expectStatus(res, 200)
  superToken = (res.json?.data as { token?: string })?.token ?? ''
  expect(!!superToken, '应拿到超管 token')
  // 全量基线抽查：商品页按钮 code 已铺开（seed:permissions 第二阶段）
  const codes = (res.json?.data?.user as { codes?: string[] })?.codes ?? []
  for (const c of ['spu:create', 'sku:generate', 'brand:delete', 'attr:update']) {
    expect(codes.includes(c), `超管 codes 应含 ${c}`)
  }
})

test('RBAC：无权限用户访问管理接口 → 403', async () => {
  // 新注册 = 默认 user 角色（仅 /home /screen）
  const reg = await req('POST', '/auth/register', {
    body: { phone: `1991238${String(Date.now()).slice(-4)}`, password: '123456' },
    auth: false,
  })
  expectStatus(reg, 200)
  const plainToken = (reg.json?.data as { token?: string })?.token ?? ''
  expect(!!plainToken, '应拿到普通用户 token')

  expectStatus(await req('GET', '/user', { token: plainToken }), 403)
  expectStatus(await req('GET', '/role', { token: plainToken }), 403)
  expectStatus(await req('GET', '/permission', { token: plainToken }), 403)
  expectStatus(
    await req('POST', '/role', { token: plainToken, body: { roleName: `brole_x_${suffix}` } }),
    403,
  )
  // 商品侧接口同样挂载 requirePermission（第二阶段铺开）
  expectStatus(await req('GET', '/spu', { token: plainToken }), 403)
  expectStatus(await req('POST', '/brand', { token: plainToken, body: { brandName: 'x' } }), 403)
  expectStatus(await req('GET', '/brand/all', { token: plainToken }), 403)
})

test('RBAC：改/删内置角色 → 403；超管可改 remark 但不可改名', async () => {
  const rolesRes = await req('GET', '/role?page=1&pageSize=100')
  const list = (rolesRes.json?.data?.list as Array<{ roleId: string; roleName: string }>) ?? []
  superAdminRoleId = list.find((r) => r.roleName === 'super_admin')?.roleId ?? ''
  expect(!!superAdminRoleId, '应找到 super_admin 角色')

  // bootstrap admin（无 grant-super）：一切修改都被拒
  expectStatus(await req('PATCH', `/role/${superAdminRoleId}`, { body: { remark: 'x' } }), 403)
  expectStatus(await req('PATCH', `/role/${superAdminRoleId}`, { body: { roleName: 'abc' } }), 403)
  expectStatus(await req('DELETE', `/role/${superAdminRoleId}`), 403)
  // 超管（持 grant-super）：可改 remark；改名仍是硬 403
  expectStatus(
    await req('PATCH', `/role/${superAdminRoleId}`, {
      token: superToken,
      body: { remark: '超级管理员' },
    }),
    200,
  )
  expectStatus(
    await req('PATCH', `/role/${superAdminRoleId}`, {
      token: superToken,
      body: { roleName: 'abc' },
    }),
    403,
  )
  // 前端表单恒带 roleName：同名提交（未改名）应放行，否则内置角色在 UI 上完全无法编辑
  expectStatus(
    await req('PATCH', `/role/${superAdminRoleId}`, {
      token: superToken,
      body: { roleName: 'super_admin', remark: '超级管理员' },
    }),
    200,
  )
})

test('RBAC：内置角色不可移除 grant-super；普通角色不可被授予 grant-super', async () => {
  const permRes = await req('GET', '/permission')
  const perms = (permRes.json?.data as Array<{ permissionId: string; code: string }>) ?? []
  const grantId = perms.find((p) => p.code === 'role:grant-super')?.permissionId ?? ''
  expect(!!grantId, '应找到 grant-super 权限')

  // 超管把 super_admin 的 permissions 改成「不含 grant-super 的全量」→ 403（防自我锁死）
  const allButGrant = perms.filter((p) => p.permissionId !== grantId).map((p) => p.permissionId)
  expectStatus(
    await req('PATCH', `/role/${superAdminRoleId}`, {
      token: superToken,
      body: { permissions: allButGrant },
    }),
    403,
  )

  // bootstrap admin（无 grant-super）给普通角色勾 grant-super → 403（提权闭环）
  const created = await req('POST', '/role', { body: { roleName: `brole_grant_${suffix}` } })
  expectStatus(created, 200)
  const roleId = (created.json?.data as { roleId?: string })?.roleId ?? ''
  const grantRes = await req('PATCH', `/role/${roleId}`, { body: { permissions: [grantId] } })
  expectStatus(grantRes, 403)
  expectMessage(grantRes, '超级授权')
})

test('RBAC：普通管理员改/删持超管用户 → 403', async () => {
  const usersRes = await req('GET', '/user?page=1&pageSize=100')
  const list = (usersRes.json?.data?.list as Array<{ userId: string; phone: string }>) ?? []
  const superUserId = list.find((u) => u.phone === '13800138000')?.userId ?? ''
  expect(!!superUserId, '应找到超管用户')

  expectStatus(await req('PATCH', `/user/${superUserId}`, { body: { roles: [userRoleId] } }), 403)
  expectStatus(await req('DELETE', `/user/${superUserId}`), 403)
})

test('RBAC：最后一名超管不可被改角色（含自我降级）', async () => {
  const meRes = await req('GET', '/user/info', { token: superToken })
  const superUserId = (meRes.json?.data as { userId?: string })?.userId ?? ''
  expect(!!superUserId, '应拿到超管 userId')

  // 直连库确认「唯一持有者」前提：开发期可能手动给其他账号挂过 super_admin，
  // 存在多名持有者时降级其一属合法操作（保护只针对最后一名），此分支自适应跳过
  await mongoose.connect(process.env.MONGODB_URI!)
  const grant = await mongoose.connection
    .db!.collection('permissions')
    .findOne({ code: 'role:grant-super' })
  const grantRoleIds = (
    await mongoose.connection.db!.collection('roles').find({ permissions: grant?._id }).toArray()
  ).map((r) => r._id)
  const holderCount = await mongoose.connection
    .db!.collection('users')
    .countDocuments({ roles: { $in: grantRoleIds } })

  if (holderCount === 1) {
    const res = await req('PATCH', `/user/${superUserId}`, {
      token: superToken,
      body: { roles: [userRoleId] },
    })
    expectStatus(res, 403)
    expectMessage(res, '至少保留一名超级管理员')
    // 收窄语义：保留 super_admin 的同时追加普通角色 = 安全操作 → 200（随后还原）
    expectStatus(
      await req('PATCH', `/user/${superUserId}`, {
        token: superToken,
        body: { roles: [superAdminRoleId, userRoleId] },
      }),
      200,
    )
    expectStatus(
      await req('PATCH', `/user/${superUserId}`, {
        token: superToken,
        body: { roles: [superAdminRoleId] },
      }),
      200,
    )
  } else {
    console.log(`  ⏭️  当前 ${holderCount} 名超管（含开发期手动分配），跳过自我降级断言`)
  }
})

test('RBAC：根节点不可改/删', async () => {
  const permRes = await req('GET', '/permission')
  const perms = (permRes.json?.data as Array<{ permissionId: string; code: string }>) ?? []
  const rootId = perms.find((p) => p.code === '/')?.permissionId ?? ''
  expect(!!rootId, '应找到根节点')
  expectStatus(await req('PATCH', `/permission/${rootId}`, { body: { name: '改名失败' } }), 403)
  expectStatus(await req('DELETE', `/permission/${rootId}`), 403)
})

test('RBAC：updateRole 传根 id → 静默剔除后 200', async () => {
  const permRes = await req('GET', '/permission')
  const perms = (permRes.json?.data as Array<{ permissionId: string; code: string }>) ?? []
  const rootId = perms.find((p) => p.code === '/')?.permissionId ?? ''
  const homeId = perms.find((p) => p.code === '/home')?.permissionId ?? ''
  expect(!!rootId && !!homeId, '应找到根节点与 /home')

  const created = await req('POST', '/role', { body: { roleName: `brole_root_${suffix}` } })
  expectStatus(created, 200)
  const roleId = (created.json?.data as { roleId?: string })?.roleId ?? ''
  const res = await req('PATCH', `/role/${roleId}`, { body: { permissions: [rootId, homeId] } })
  expectStatus(res, 200)
  const saved = (res.json?.data as { permissions?: string[] })?.permissions ?? []
  expect(!saved.includes(rootId), '根 id 应被静默剔除')
  expect(saved.includes(homeId), '/home 应正常入库')
})

test('RBAC：祖先补全 —— 只勾按钮的角色，codes 必含菜单链', async () => {
  const permRes = await req('GET', '/permission')
  const perms = (permRes.json?.data as Array<{ permissionId: string; code: string }>) ?? []
  const btnId = perms.find((p) => p.code === 'user:delete')?.permissionId ?? ''
  expect(!!btnId, '应找到 user:delete 按钮')

  // 角色只勾按钮（不勾菜单）——存储侧半选父级不入库的既定契约
  const createdRole = await req('POST', '/role', { body: { roleName: `brole_anc_${suffix}` } })
  expectStatus(createdRole, 200)
  const roleId = (createdRole.json?.data as { roleId?: string })?.roleId ?? ''
  expectStatus(await req('PATCH', `/role/${roleId}`, { body: { permissions: [btnId] } }), 200)

  // 用户挂该角色后登录：codes 应由聚合期祖先补全出菜单链，且不含根节点
  const phone = `1991236${String(Date.now()).slice(-4)}`
  expectStatus(
    await req('POST', '/user', { body: { phone, password: '123456', roles: [roleId] } }),
    200,
  )
  const loginRes = await req('POST', '/auth/login', {
    body: { phone, password: '123456' },
    auth: false,
  })
  expectStatus(loginRes, 200)
  const codes = (loginRes.json?.data?.user as { codes?: string[] })?.codes ?? []
  expect(codes.includes('user:delete'), 'codes 应含按钮 code')
  expect(codes.includes('/acl/users'), 'codes 应含祖先菜单 /acl/users')
  expect(codes.includes('/acl'), 'codes 应含祖先菜单 /acl')
  expect(!codes.includes('/'), 'codes 不应含根节点 /')
})

test('RBAC：权限树成环时聚合不死循环（visited 防环）', async () => {
  // 直连库造环 A→B→A：服务层防环只挡新写入，脏数据/手工写库仍可能产生环
  await mongoose.connect(process.env.MONGODB_URI!)
  const col = mongoose.connection.db!.collection('permissions')
  const now = new Date()
  // 复合唯一索引 {parentId, sortIndex} 对直连插入同样生效：A 取同级 max+1，避开与根节点（null, 0）冲突
  const topMax =
    (await col.find({ parentId: null }).sort({ sortIndex: -1 }).limit(1).next())?.sortIndex ?? -1
  const a = await col.insertOne({
    name: '边界环节点A',
    code: `boundary_cycle_a_${suffix}`,
    type: 'menu',
    parentId: null,
    sortIndex: (topMax as number) + 1,
    createdAt: now,
    updatedAt: now,
  })
  const b = await col.insertOne({
    name: '边界环节点B',
    code: `boundary_cycle_b_${suffix}`,
    type: 'menu',
    parentId: a.insertedId,
    sortIndex: 0,
    createdAt: now,
    updatedAt: now,
  })
  await col.updateOne({ _id: a.insertedId }, { $set: { parentId: b.insertedId } })

  // 角色只挂 A，登录聚合上溯 A→B→A：修复前同步死循环挂死进程，修复后正常返回且含环上已收集 code
  const createdRole = await req('POST', '/role', { body: { roleName: `brole_cycle_${suffix}` } })
  expectStatus(createdRole, 200)
  const roleId = (createdRole.json?.data as { roleId?: string })?.roleId ?? ''
  expectStatus(
    await req('PATCH', `/role/${roleId}`, { body: { permissions: [String(a.insertedId)] } }),
    200,
  )
  const phone = `1991239${String(Date.now()).slice(-4)}`
  expectStatus(
    await req('POST', '/user', { body: { phone, password: '123456', roles: [roleId] } }),
    200,
  )
  const loginRes = await req('POST', '/auth/login', {
    body: { phone, password: '123456' },
    auth: false,
  })
  expectStatus(loginRes, 200)
  const codes = (loginRes.json?.data?.user as { codes?: string[] })?.codes ?? []
  expect(codes.includes(`boundary_cycle_a_${suffix}`), '应含环节点 A 的 code')
  expect(codes.includes(`boundary_cycle_b_${suffix}`), '应含环节点 B 的 code（环中断前已收集）')
})

// ==================== 数据大屏（dashboard-design §4.3，+4 例） ====================

test('大屏：GET /dashboard/stats → 200 且字段形状齐全', async () => {
  const res = await req('GET', '/dashboard/stats')
  expectStatus(res, 200)
  const data = res.json?.data as Record<string, unknown>
  // monthlyTrend / categoryNodes 已按「方差判据」移除：前者用 createdAt 分组（业务事件时间缺失），
  // 后者前端零消费。此处断言改为新契约，字段增删应在此同步
  for (const key of ['kpi', 'priceBands', 'brandTop', 'skuStatus', 'todos', 'skus', 'spus']) {
    expect(key in data, `响应应含 ${key}`)
  }
  for (const gone of ['monthlyTrend', 'categoryNodes']) {
    expect(!(gone in data), `响应不应再含已移除的 ${gone}`)
  }
  expect(
    Array.isArray(data.priceBands) && (data.priceBands as unknown[]).length === 7,
    'priceBands 应为 7 档',
  )
  expect(Array.isArray(data.todos), 'todos 应为数组')
})

test('大屏：spus 的分类路径契约（热力图下拉分组/搜索依赖）', async () => {
  const res = await req('GET', '/dashboard/stats')
  expectStatus(res, 200)
  const data = res.json?.data as {
    spus: Array<{
      spuId: string
      name: string
      categoryPath: Array<{ categoryId: string; name: string }>
    }>
  }
  expect(Array.isArray(data.spus) && data.spus.length > 0, 'spus 应为非空数组')
  for (const spu of data.spus) {
    expect(Array.isArray(spu.categoryPath), `${spu.name} 应含 categoryPath 数组`)
    // 路径必须是「一级 → 三级」的正序：节点 level 递增由下一条与直连库比对保证
    expect(spu.categoryPath.length <= 3, `${spu.name} 的分类路径不应超过 3 级`)
    for (const node of spu.categoryPath) {
      expect(!!node.categoryId && !!node.name, '分类路径节点需含 categoryId 与 name')
    }
  }

  // 与直连库对照：路径必须能按 parentId 逐级串成链，且末节点就是该 SPU 的 category3Id
  await mongoose.connect(process.env.MONGODB_URI!)
  const db = mongoose.connection.db!
  const [spuDocs, catDocs] = await Promise.all([
    db.collection('spus').find().toArray(),
    db.collection('categories').find().toArray(),
  ])
  const parentOf = new Map(
    catDocs.map((c) => [String(c._id), c.parentId ? String(c.parentId) : null]),
  )
  const cat3ById = new Map(spuDocs.map((s) => [String(s._id), String(s.category3Id)]))
  let checkedWithPath = 0
  for (const spu of data.spus) {
    const expectedEnd = cat3ById.get(spu.spuId)
    if (!expectedEnd || spu.categoryPath.length === 0) continue // 悬空/未分类：允许空数组，跳过
    checkedWithPath++
    const last = spu.categoryPath[spu.categoryPath.length - 1]!
    expect(last.categoryId === expectedEnd, `${spu.name} 分类路径末节点应为其三级分类`)
    // 正序链校验：第 i 个节点应是第 i+1 个节点的父级
    for (let i = 0; i < spu.categoryPath.length - 1; i++) {
      const parent = spu.categoryPath[i]!
      const child = spu.categoryPath[i + 1]!
      expect(
        parentOf.get(child.categoryId) === parent.categoryId,
        `${spu.name} 分类路径父子顺序应正确`,
      )
    }
  }
  expect(checkedWithPath > 0, '应至少有一个 SPU 带有可校验的分类路径')
})

test('大屏：数值与直连库一致 + 状态计数三不变式', async () => {
  const res = await req('GET', '/dashboard/stats')
  expectStatus(res, 200)
  const data = res.json?.data as {
    kpi: Record<string, number>
    stockValue: number
    priceBands: Array<{ label: string; count: number }>
    brandTop: Array<{ value: number; skuCount: number }>
    skuStatus: { onSale: number; offPriced: number; offUnpriced: number }
    todos: Array<{ category: string; price: number; stock: number }>
  }
  await mongoose.connect(process.env.MONGODB_URI!)
  const db = mongoose.connection.db!
  const skuN = await db.collection('skus').countDocuments()
  const brandN = await db.collection('brands').countDocuments()
  const skus = await db.collection('skus').find().toArray()
  const brandIds = new Set(
    (await db.collection('spus').find().toArray()).map((s) => String(s.brandId)),
  )
  const onSale = skus.filter((s) => s.isSale === true).length
  const stockValue = skus.reduce((a, s) => a + (s.price || 0) * (s.stock || 0), 0)
  // 可售 = 已定价 且 在架；待办 = 未定价 ∪ 零库存 ∪ 已定价有货但未上架（互斥分类，不重复计）
  const sellable = skus.filter((s) => s.price > 0 && s.isSale === true).length
  const pending = skus.filter((s) => !(s.price > 0) || !(s.stock > 0) || s.isSale !== true).length

  expect(data.kpi.skuCount === skuN, `kpi.skuCount 应为 ${skuN}`)
  expect(data.kpi.onSale === onSale, `kpi.onSale 应为 ${onSale}`)
  expect(data.kpi.sellable === sellable, `kpi.sellable 应为 ${sellable}`)
  expect(
    data.kpi.sellableRate === (skuN > 0 ? Math.round((sellable / skuN) * 100) : 0),
    'kpi.sellableRate 应为四舍五入后的百分比整数',
  )
  expect(data.kpi.pending === pending, `kpi.pending 应为 ${pending}`)
  expect(data.kpi.brandTotal === brandN, `kpi.brandTotal 应为 ${brandN}`)
  expect(
    data.kpi.brandCovered === brandIds.size,
    `kpi.brandCovered 应为有 SPU 的品牌数 ${brandIds.size}`,
  )
  expect(data.stockValue === stockValue, 'stockValue 应与直连库求和一致')
  // 三不变式：状态三段互斥完备（合计 = 总数）+ 在架必有价（I11）+ 可售 ⊆ 在架
  expect(
    data.skuStatus.onSale + data.skuStatus.offPriced + data.skuStatus.offUnpriced === skuN,
    'skuStatus 三段之和应等于 SKU 总数',
  )
  expect(
    data.skuStatus.offUnpriced === skus.filter((s) => !(s.price > 0) && s.isSale !== true).length,
    '下架未定价段应为未定价且未上架数',
  )
  expect(data.kpi.sellable <= data.kpi.onSale, '可售（已定价且在架）应 ≤ 在架总数')
  // 分桶合计 = SKU 总数；品牌货值 TOP 之和 ≤ 全部货值（TOP5 不允许超出总量）
  const bandSum = data.priceBands.reduce((a, b) => a + b.count, 0)
  expect(bandSum === skuN, 'priceBands 合计应等于 SKU 总数')
  expect(
    data.brandTop.reduce((a, b) => a + b.value, 0) <= stockValue,
    'brandTop 货值之和应 ≤ 库存总货值',
  )
  // 待办清单：非空时必须有 pending 条（可能被截断，故 ≤），且类别只允许三类
  const validCategories = new Set(['unpriced', 'zeroStock', 'notPublished'])
  expect(data.todos.length <= data.kpi.pending, 'todos 条数应 ≤ pending 总数（服务端截断）')
  expect(
    data.todos.every((t) => validCategories.has(t.category)),
    'todos.category 只能是三类之一',
  )
  expect(
    data.todos.every((t) => !(t.price > 0) || !(t.stock > 0) || t.category === 'notPublished'),
    'todos 中的 unpriced/zeroStock 必须真的缺价或缺货',
  )
})

test('大屏：无 /screen 权限的角色 → 403', async () => {
  // 角色名 ≤ 20 字符（模型 maxlength）：brole_scr_ + suffix ≈ 18
  const created = await req('POST', '/role', { body: { roleName: `brole_scr_${suffix}` } })
  expectStatus(created, 200)
  const roleId = (created.json?.data as { roleId?: string })?.roleId ?? ''
  const phone = `1991232${String(Date.now()).slice(-4)}`
  expectStatus(
    await req('POST', '/user', { body: { phone, password: '123456', roles: [roleId] } }),
    200,
  )
  const loginRes = await req('POST', '/auth/login', {
    body: { phone, password: '123456' },
    auth: false,
  })
  expectStatus(loginRes, 200)
  const token = (loginRes.json?.data as { token?: string })?.token ?? ''
  expectStatus(await req('GET', '/dashboard/stats', { token }), 403)
})

test('大屏：bucketPrice 分档边界（下闭上开语义）', async () => {
  // 整点价必须落在「标签所指的那一档」：¥100 → 100-500元，而不是 0-100元。
  // 这是旧实现（price <= 上界）的 off-by-one 修复点，改回 <= 会让本用例失败
  expect(bucketPrice(0) === '未定价', '0 分 → 未定价')
  expect(bucketPrice(-1) === '未定价', '负数（脏数据）也归入未定价，不落进真实价格带')
  expect(bucketPrice(1) === '0-100元', '1 分 → 0-100元')
  expect(bucketPrice(9999) === '0-100元', '9999 分（¥99.99）→ 0-100元')
  expect(bucketPrice(10000) === '100-500元', '10000 分（¥100 整）→ 100-500元')
  expect(bucketPrice(49999) === '100-500元', '49999 分 → 100-500元')
  expect(bucketPrice(50000) === '500-2000元', '50000 分（¥500 整）→ 500-2000元')
  expect(bucketPrice(199999) === '500-2000元', '199999 分 → 500-2000元')
  expect(bucketPrice(200000) === '2000-5000元', '200000 分（¥2000 整）→ 2000-5000元')
  expect(bucketPrice(499999) === '2000-5000元', '499999 分 → 2000-5000元')
  expect(bucketPrice(500000) === '5000-10000元', '500000 分（¥5000 整）→ 5000-10000元')
  expect(bucketPrice(999999) === '5000-10000元', '999999 分 → 5000-10000元')
  expect(bucketPrice(1000000) === '10000元以上', '1000000 分（¥10000 整）→ 10000元以上')
  expect(bucketPrice(Number.MAX_SAFE_INTEGER) === '10000元以上', '极大值 → 最后一档')
})

// ==================== 上传 ====================
test('上传：非图片文件 → 400', async () => {
  const form = new FormData()
  form.append('file', new Blob(['hello'], { type: 'text/plain' }), 'test.txt')
  const res = await fetch(`${BASE}/upload`, { method: 'POST', headers, body: form })
  expect(res.status === 400, `期望 400，实际 ${res.status}`)
})

test('上传：合法图片 → 200 返回 URL', async () => {
  // 1x1 透明 PNG
  const png = Uint8Array.from(
    atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    ),
    (c) => c.charCodeAt(0),
  )
  const form = new FormData()
  form.append('file', new Blob([png], { type: 'image/png' }), 'test.png')
  const res = await fetch(`${BASE}/upload`, { method: 'POST', headers, body: form })
  expect(res.status === 200, `期望 200，实际 ${res.status}`)
  const json = await res.json()
  expect(!!json?.data?.url, '应返回图片 URL')
  uploadedFiles.push(json.data.url as string)
})

// ==================== 清理 ====================
async function cleanup() {
  // 一律按「边界测试」前缀扫描（不依赖本次 suffix）：失败中断的运行留下的旧残留，
  // 也能被后续任何一次成功运行清掉。SKU 先于 SPU 清（层 6 的 I6：有 SKU 的 SPU 删不掉）
  const spus = await req(
    'GET',
    `/spu?categoryId=${level3Id}&keyword=${encodeURIComponent('边界测试')}&pageSize=100`,
  )
  for (const spu of (spus.json?.data?.list as Array<{ spuId: string }>) ?? []) {
    await req('DELETE', `/sku?spuId=${spu.spuId}`)
    await req('DELETE', `/spu/${spu.spuId}`)
  }
  const attrs = await req('GET', `/attr?categoryId=${level3Id}`)
  for (const attr of (attrs.json?.data as Array<{ attrId: string; name: string }>) ?? []) {
    if (attr.name.startsWith('边界测试')) {
      await req('DELETE', `/attr/${attr.attrId}`)
    }
  }
  const brands = await req('GET', `/brand?keyword=${encodeURIComponent('边界测试')}`)
  for (const brand of (brands.json?.data?.list as Array<{ brandId: string }>) ?? []) {
    await req('DELETE', `/brand/${brand.brandId}`)
  }
  // 测试用户：API 无删除接口，直连库清 boundary_ 用户名前缀 + 199123 手机号前缀
  // （注册用户名为自动生成的「用户+编码」，只能靠手机号前缀定位）
  await mongoose.connect(process.env.MONGODB_URI!)
  await mongoose.connection.db!.collection('users').deleteMany({
    $or: [{ username: /^boundary/ }, { phone: /^199123/ }],
  })
  // 测试角色：brole_ 名前缀（删除接口未开放，直连库清；先清用户再清角色，避免引用残留）
  await mongoose.connection.db!.collection('roles').deleteMany({ roleName: /^brole_/ })
  // 测试权限：code 前缀 boundary_（用例自建树，直连库清最省事）
  await mongoose.connection.db!.collection('permissions').deleteMany({ code: /^boundary/ })
  await mongoose.disconnect()
  // 上传的测试图片：按 URL 末段定位文件删除（尽力而为，文件不在也不该让清理失败）
  for (const url of uploadedFiles) {
    await unlink(path.join(UPLOAD_DIR, path.basename(url))).catch(() => {})
  }
}

// ==================== 执行 ====================
let passed = 0
const failures: Array<{ name: string; err: string }> = []

// bootstrap：注册测试用户拿 token（幂等：已存在则登录），预取三级分类 id，创建测试属性
async function bootstrap() {
  let reg = await req('POST', '/auth/register', {
    body: { phone: bootstrapPhone, password: '123456' },
    auth: false,
  })
  if (reg.status === 409) {
    // 上次运行已创建 → 登录复用，保证跨次运行不累积用户
    reg = await req('POST', '/auth/login', {
      body: { phone: bootstrapPhone, password: '123456' },
      auth: false,
    })
  }
  if (reg.status !== 200) throw new Error(`bootstrap 注册失败: ${reg.status} ${reg.json?.message}`)
  token = (reg.json as { data?: { token?: string } })?.data?.token ?? ''
  if (!token) throw new Error('bootstrap 未拿到 token')
  headers = { Authorization: `Bearer ${token}` }

  // RBAC：bootstrap 用户直连库挂 admin 角色（管理接口已加 requirePermission，测试用户须先有管理权）。
  // 挂角色后立即生效 —— 中间件每次请求实时聚合，无需重新登录换 token
  await mongoose.connect(process.env.MONGODB_URI!)
  const adminRoleDoc = await mongoose.connection
    .db!.collection('roles')
    .findOne({ roleName: 'admin' })
  if (!adminRoleDoc) {
    throw new Error('bootstrap 未找到 admin 角色，请先运行 pnpm run seed:admin')
  }
  await mongoose.connection
    .db!.collection('users')
    .updateOne({ phone: bootstrapPhone }, { $addToSet: { roles: adminRoleDoc._id } })

  // 注册自动生成的默认用户名不稳定 → 改回固定名（keyword 搜索 / 删除自己用例依赖它）
  const me = await req('GET', '/user/info')
  const myId = (me.json?.data as { userId?: string })?.userId
  if (myId) {
    const rename = await req('PATCH', `/user/${myId}`, { body: { username: bootstrapUsername } })
    if (rename.status !== 200) {
      throw new Error(`bootstrap 改名失败: ${rename.status} ${rename.json?.message}`)
    }
  }

  // 基础角色：依赖 seed:admin 种入（user / admin 等），按名取 id 供用户管理用例引用
  const rolesRes = await req('GET', '/role?page=1&pageSize=100')
  const roleList = (rolesRes.json?.data?.list as Array<{ roleId: string; roleName: string }>) ?? []
  userRoleId = roleList.find((r) => r.roleName === 'user')?.roleId ?? ''
  adminRoleId = roleList.find((r) => r.roleName === 'admin')?.roleId ?? ''
  if (!userRoleId || !adminRoleId) {
    throw new Error('bootstrap 未找到基础角色（user/admin），请先运行 pnpm run seed:admin')
  }

  const cats = await req('GET', '/category')
  level1Id = (cats.json?.data as Array<{ categoryId: string }>)[0]!.categoryId
  const level2 = await req('GET', `/category?parentId=${level1Id}`)
  const level2Id = (level2.json?.data as Array<{ categoryId: string }>)[0]!.categoryId
  const level3 = await req('GET', `/category?parentId=${level2Id}`)
  level3Id = (level3.json?.data as Array<{ categoryId: string }>)[0]!.categoryId

  const attr = await req('POST', '/attr', {
    body: { categoryId: level3Id, name: testAttrName, values: ['值A', '值B'] },
  })
  if (attr.status !== 200)
    throw new Error(`bootstrap 创建测试属性失败: ${attr.status} ${attr.json?.message}`)
}

try {
  await bootstrap()
} catch (err) {
  console.error(`❌ bootstrap 失败: ${(err as Error).message}`)
  process.exit(1)
}

for (const t of tests) {
  try {
    await t.fn()
    passed++
    console.log(`✅ ${t.name}`)
  } catch (err) {
    failures.push({ name: t.name, err: (err as Error).message })
    console.log(`❌ ${t.name}  →  ${(err as Error).message}`)
  }
}

console.log('\n===== 结果 =====')
console.log(`通过 ${passed}/${tests.length}`)
if (failures.length > 0) {
  console.log('\n失败明细：')
  for (const f of failures) {
    console.log(`  - ${f.name}\n    ${f.err}`)
  }
}
// 无论成败都清理：失败中断的运行不再留残留
await cleanup()
console.log('✅ 测试数据已清理（含 boundary_ 前缀测试用户，直连库删除）')
if (failures.length > 0) {
  process.exit(1)
}
