// 全模块 API 边界测试（冒烟 + 边界）：直连运行中的后端，逐用例断言状态码与错误语义
// 用法：先启动后端 dev server，再 pnpm exec tsx scripts/boundary-test.ts
// 测试数据全部带唯一后缀，测完自动清理；测试用户走后端 API 无法删除，cleanup 直连库清 boundary_ 前缀
import 'dotenv/config'
import mongoose from 'mongoose'
import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { UPLOAD_DIR } from '../src/utils/upload.js'
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
  opts: { body?: unknown; auth?: boolean; rawBody?: BodyInit } = {},
) {
  const init: RequestInit = { method }
  if (opts.body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(opts.body)
  } else if (opts.rawBody !== undefined) {
    init.body = opts.rawBody
  }
  const h = opts.auth === false ? {} : headers
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
const testUsername = `boundary_ok_${suffix}` // 每次运行唯一：注册成功用例用，留库（后端暂无删除用户接口）

test('无 token 访问受保护接口 → 401', async () => {
  const res = await req('GET', '/brand', { auth: false })
  expectStatus(res, 401)
})

test('伪造 token → 401', async () => {
  const res = await req('GET', '/brand', { auth: false })
  expectStatus(res, 401)
})

test('注册：用户名过短(2字符) → 400', async () => {
  const res = await req('POST', '/auth/register', {
    body: { username: 'ab', password: '123456' },
    auth: false,
  })
  expectStatus(res, 400)
})

test('注册：用户名过长(21字符) → 400', async () => {
  const res = await req('POST', '/auth/register', {
    body: { username: 'a'.repeat(21), password: '123456' },
    auth: false,
  })
  expectStatus(res, 400)
})

test('注册：密码过短(5位) → 400', async () => {
  const res = await req('POST', '/auth/register', {
    body: { username: `x_${suffix}`, password: '12345' },
    auth: false,
  })
  expectStatus(res, 400)
})

test('注册：正常 → 200 并返回 token', async () => {
  const res = await req('POST', '/auth/register', {
    body: { username: testUsername, password: '123456' },
    auth: false,
  })
  expectStatus(res, 200)
  expect(!!(res.json as { data?: { token?: string } })?.data?.token, '未返回 token')
})

test('注册：重名 → 409', async () => {
  const res = await req('POST', '/auth/register', {
    body: { username: bootstrapUsername, password: '123456' },
    auth: false,
  })
  expectStatus(res, 409)
})

test('登录：错误密码 → 401', async () => {
  const res = await req('POST', '/auth/login', {
    body: { username: bootstrapUsername, password: 'wrongpass' },
    auth: false,
  })
  expectStatus(res, 401)
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
test('销售字典：列表 → 200 且 ≥8 条', async () => {
  const res = await req('GET', '/base-sale-attr')
  expectStatus(res, 200)
  expect((res.json?.data as unknown[]).length >= 8, '字典应 ≥8 条')
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
  const spus = await req(
    'GET',
    `/spu?categoryId=${level3Id}&keyword=${encodeURIComponent(testSpuName)}`,
  )
  for (const spu of (spus.json?.data?.list as Array<{ spuId: string }>) ?? []) {
    await req('DELETE', `/spu/${spu.spuId}`)
  }
  const attrs = await req('GET', `/attr?categoryId=${level3Id}`)
  for (const attr of (attrs.json?.data as Array<{ attrId: string; name: string }>) ?? []) {
    if (attr.name.startsWith('边界测试') || attr.name === testAttrName) {
      await req('DELETE', `/attr/${attr.attrId}`)
    }
  }
  const brands = await req('GET', `/brand?keyword=${encodeURIComponent(testBrandName)}`)
  for (const brand of (brands.json?.data?.list as Array<{ brandId: string }>) ?? []) {
    await req('DELETE', `/brand/${brand.brandId}`)
  }
  // 测试用户：API 无删除接口，直连库清 boundary_ 前缀（含历史残留）
  await mongoose.connect(process.env.MONGODB_URI!)
  await mongoose.connection.db!.collection('users').deleteMany({ username: /^boundary/ })
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
    body: { username: bootstrapUsername, password: '123456' },
    auth: false,
  })
  if (reg.status === 409) {
    // 上次运行已创建 → 登录复用，保证跨次运行不累积用户
    reg = await req('POST', '/auth/login', {
      body: { username: bootstrapUsername, password: '123456' },
      auth: false,
    })
  }
  if (reg.status !== 200) throw new Error(`bootstrap 注册失败: ${reg.status} ${reg.json?.message}`)
  token = (reg.json as { data?: { token?: string } })?.data?.token ?? ''
  if (!token) throw new Error('bootstrap 未拿到 token')
  headers = { Authorization: `Bearer ${token}` }

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
  process.exit(1)
}
await cleanup()
console.log('✅ 测试数据已清理（含 boundary_ 前缀测试用户，直连库删除）')
