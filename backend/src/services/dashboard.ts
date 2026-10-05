import { Spu } from '../models/Spu.js'
import { Sku } from '../models/Sku.js'
import { Brand } from '../models/Brand.js'
import { Category } from '../models/Category.js'
import { bucketPrice, emptyBandCounts, PRICE_BAND_LABELS } from '../utils/priceBand.js'

// 业务层：数据大屏聚合（design/dashboard-design.md §4）
//
// 面板取舍原则（v3 定案，三条缺一不可）：可运营 / 有方差 / 不冗余。
// 据此砍掉了三个「看着有数、实则无信息」的面板，理由留档在实现处：
//   1. 月度趋势   —— 用 createdAt 按自然月分组，而 createdAt 是「入库时刻」不是业务事件时间。
//                    当年数据只跨 16 天时，6 个月窗口有 4 根空柱；讲「上新节奏」需要 publishedAt 字段。
//   2. 最新动态   —— 按 updatedAt 倒序取 10 条，但整表是同批写入（秒级时间戳全同），
//                    等值排序结果由存储引擎决定，10 行内容不构成事件流，纯随机。
//   3. categoryNodes —— 分类树 SPU 数对「商品运营」无叙事，且前端零消费（原面板已移除）。
//
// 实现口径：当前 SKU 量级 KB 级 —— 一次全量查询 + 内存聚合（单次往返）。
// SKU > 2000 时按 §7.1 切换 aggregate 管道 + 服务端聚合（详见 docs/design/dashboard-design.md）

export interface DashboardKpi {
  // SKU 总数（各种比率的隐含分母）
  skuCount: number
  // 可售 SKU = 已定价 且 在架 且 有货：大屏唯一的「健康度」总量指标
  // 「有货」这一项不能省：上架闸门只保证「在架 ⇒ 已定价」不含库存（在架+零库存 = 售罄，
  // 是正常经营状态，不该被拦），但售罄的商品买不走，不能计入「现在能买到」——
  // 漏掉它，sellable 会恒等于 onSale（见下方累积处的说明）
  sellable: number
  // 可售率（0~100 整数，后端算好，前端不做除法）
  sellableRate: number
  // 在架 SKU 数
  onSale: number
  // 待办 SKU = 未定价 ∪ 零库存 ∪ 已备货未上架（去重后计数）
  pending: number
  // 有 SPU 的品牌数（≠ Brand 集合大小：空品牌不该出现在运营大盘上）
  brandCovered: number
  brandTotal: number
}

export interface SkuStatus {
  onSale: number
  offPriced: number
  offUnpriced: number
}

// 待办三类：一屏回答「该补什么、该清什么、该上什么」
export type TodoCategory = 'unpriced' | 'zeroStock' | 'notPublished'

export interface SkuTodo {
  // 稳定唯一标识：前端列表 key 用它（数组下标做 key，30s 轮询重排后会错位复用 DOM）
  skuId: string
  category: TodoCategory
  categoryLabel: string
  spuName: string
  combo: string
  price: number // 分
  stock: number
}

export interface BrandValue {
  brandName: string
  value: number // 库存货值（分）
  skuCount: number
  onSale: number
}

export interface DashboardStats {
  kpi: DashboardKpi
  stockValue: number // 库存总价值（分）
  priceBands: Array<{ label: string; count: number }>
  brandTop: BrandValue[]
  skuStatus: SkuStatus
  todos: SkuTodo[]
  // 热力图数据源：按选中 SPU 在前端切分（stock 上色）
  skus: Array<{
    skuId: string
    spuId: string
    saleAttrValueList: Array<{ saleAttrName: string; saleAttrValue: string }>
    price: number
    stock: number
    isSale: boolean
  }>
  // SPU 下拉数据源（热力图切换）
  spus: Array<{
    spuId: string
    name: string
    saleAttrList: Array<{ saleAttrName: string; saleAttrValueList: string[] }>
    // 分类路径（一级 → 三级），供下拉按一级分类分组 + 支持按分类名搜索。
    // 空数组 = 该 SPU 的分类链不完整（脏数据），前端按「未分类」兜底分组
    categoryPath: Array<{ categoryId: string; name: string }>
  }>
}

// 分类 id → 精简节点：供 SPU 上溯分类链
function buildCategoryIndex(categories: Array<{ _id: unknown; name: string; parentId: unknown }>) {
  return new Map(
    categories.map((c) => [
      String(c._id),
      { name: c.name, parentId: c.parentId ? String(c.parentId) : null },
    ]),
  )
}

// 从三级分类上溯到一级，返回「一级 → 三级」路径。
//
// 两条边界都是**有意防御**，不是防错：
//   1. visited 防环：分类表是自引用结构，脏数据成环时必须停，否则死循环挂在请求里
//   2. MAX_DEPTH 封顶：与「分类只有三级」的业务约定解耦 —— 约定若将来放宽，
//      这里不会因为一条超深链路把整个响应拖住
const CATEGORY_MAX_DEPTH = 5

function buildCategoryPath(
  category3Id: unknown,
  byId: Map<string, { name: string; parentId: string | null }>,
): Array<{ categoryId: string; name: string }> {
  if (!category3Id) return []
  const chain: Array<{ categoryId: string; name: string }> = []
  const visited = new Set<string>()
  let current: string | null = String(category3Id)
  while (current && !visited.has(current) && chain.length < CATEGORY_MAX_DEPTH) {
    visited.add(current)
    const node: { name: string; parentId: string | null } | undefined = byId.get(current)
    if (!node) break // 悬空引用：链到此为止，已收集的部分照常返回
    chain.push({ categoryId: current, name: node.name })
    current = node.parentId
  }
  return chain.reverse() // 上溯得到的是「三级 → 一级」，返回给前端要正的
}

// 待办清单**不截断**（原 TODO_LIMIT = 12 → 50 已移除）：前端列表是定高 + 虚拟列表，
// DOM 只渲染窗口内那几行，全量给过去也只是滚动范围变大，用户能翻完所有待办 ——
// 截断反而跟「查看全部」的诉求冲突。清单仍按「类别优先级 → 货值」排序，翻到最上面就是最该处理的。
// 代价是响应体随待办数线性增长（每条约 180B：24 位 skuId + 中文商品名/组合）：实测本库 96 条待办
// = 17.6KB（整个 stats 响应 66KB）；涨到上千条约 200KB，而当前没挂 compression。这个量级在当下
// 可忽略；等它真的变得不可接受，再改成游标/增量拉取 —— 大屏 30s 轮询一次，本来也只需要增量，
// 而不是重新在这里砍条数

// 待办类别的展示文案与优先级（模块级常量：聚合循环与排序共用同一份，避免两处口径漂移）
const TODO_LABELS: Record<TodoCategory, string> = {
  unpriced: '待定价',
  zeroStock: '待备货',
  notPublished: '待上架',
}

const TODO_ORDER: Record<TodoCategory, number> = {
  unpriced: 0,
  zeroStock: 1,
  notPublished: 2,
}

export async function getDashboardStats(): Promise<DashboardStats> {
  // 一次并行全量查询。
  // categories 重新入场：不再服务 categoryNodes 面板（已删），而是给热力图下拉提供分类路径 ——
  // 下拉要按「一级分类」分组、并让「手机数码」这类分类名也能被搜到（详见 §5.3 选择器契约）
  const [skus, spus, brands, categories] = await Promise.all([
    Sku.find().select('spuId skuSaleAttrValueList price stock isSale').lean(),
    Spu.find().select('name brandId saleAttrList category3Id').lean(),
    Brand.find().select('name').lean(),
    Category.find().select('name level parentId').lean(),
  ])

  // ---- 单次遍历：KPI 累积 + 分带计数 + 待办分类（三处关注点合并，避免多次全表扫描）----
  const bandCounts = emptyBandCounts()
  const spuNameById = new Map(spus.map((s) => [String(s._id), s.name]))
  // 分类索引：SPU 上溯分类链用（与品牌名映射同惯例 —— 一次查询建 Map，不做 $lookup / N+1）
  const categoryById = buildCategoryIndex(categories)
  const skuStatus: SkuStatus = { onSale: 0, offPriced: 0, offUnpriced: 0 }
  const todos: SkuTodo[] = []
  let sellable = 0
  let stockValue = 0

  for (const sku of skus) {
    const priced = sku.price > 0
    const inStock = sku.stock > 0
    if (sku.isSale) skuStatus.onSale++
    else if (priced) skuStatus.offPriced++
    else skuStatus.offUnpriced++

    // 可售 = 能真正被买走：定价 ∧ 在架 ∧ 有货。
    // 缺了「有货」这项，因上架闸门保证「在架 ⇒ 已定价」，sellable 会恒等于 onSale，
    // 可售率就成了在架率的复读机（两张 KPI 卡指向同一个数）
    if (sku.isSale && priced && inStock) sellable++
    stockValue += (sku.price ?? 0) * (sku.stock ?? 0)
    const band = bucketPrice(sku.price)
    bandCounts.set(band, (bandCounts.get(band) ?? 0) + 1)

    // 待办三分类互斥（if/else 链）：未定价优先于零库存，避免同一条 SKU 重复计数
    const category: TodoCategory | null = !priced
      ? 'unpriced'
      : !inStock
        ? 'zeroStock'
        : !sku.isSale
          ? 'notPublished'
          : null
    if (category) {
      todos.push({
        skuId: String(sku._id),
        category,
        categoryLabel: TODO_LABELS[category],
        spuName: spuNameById.get(String(sku.spuId)) ?? '未知商品',
        combo: sku.skuSaleAttrValueList.map((v) => v.saleAttrValue).join('/'),
        price: sku.price,
        stock: sku.stock,
      })
    }
  }

  // ---- 品牌货值 TOP5：按库存货值排序（替代旧的「SPU 建档数」—— 建档数不反映运营重要性）----
  const brandNameById = new Map(brands.map((b) => [String(b._id), b.name]))
  const spuBrandId = new Map(spus.map((s) => [String(s._id), String(s.brandId)]))
  interface BrandAgg {
    value: number
    skuCount: number
    onSale: number
  }
  const brandAgg = new Map<string, BrandAgg>()
  const brandById = new Map<string, BrandAgg>()
  for (const sku of skus) {
    const brandId = spuBrandId.get(String(sku.spuId))
    if (!brandId) continue
    let agg = brandById.get(brandId)
    if (!agg) {
      agg = { value: 0, skuCount: 0, onSale: 0 }
      brandById.set(brandId, agg)
    }
    agg.value += (sku.price ?? 0) * (sku.stock ?? 0)
    agg.skuCount++
    if (sku.isSale) agg.onSale++
  }
  for (const [brandId, agg] of brandById) {
    brandAgg.set(brandNameById.get(brandId) ?? '未知品牌', agg)
  }
  const brandTop: BrandValue[] = [...brandAgg.entries()]
    .map(([brandName, agg]) => ({ brandName, ...agg }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)

  // ---- 待办排序：按类别优先级（未定价 → 零库存 → 未上架），类内货值大的在前 ----
  todos.sort((a, b) => {
    const order = TODO_ORDER[a.category] - TODO_ORDER[b.category]
    return order !== 0 ? order : b.price * b.stock - a.price * a.stock
  })

  return {
    kpi: {
      skuCount: skus.length,
      sellable,
      sellableRate: skus.length > 0 ? Math.round((sellable / skus.length) * 100) : 0,
      onSale: skuStatus.onSale,
      pending: todos.length,
      brandCovered: brandAgg.size,
      brandTotal: brands.length,
    },
    stockValue,
    // 输出顺序固定为 PRICE_BAND_LABELS（Map 的插入序即标签序，此处显式映射避免隐式依赖）
    priceBands: PRICE_BAND_LABELS.map((label) => ({ label, count: bandCounts.get(label) ?? 0 })),
    brandTop,
    skuStatus,
    // 全量待办（不截断，理由见文件上方说明）；因而不截断后 kpi.pending 恒等于 todos.length
    todos,
    skus: skus.map((s) => ({
      skuId: String(s._id),
      spuId: String(s.spuId),
      saleAttrValueList: s.skuSaleAttrValueList,
      price: s.price,
      stock: s.stock,
      isSale: s.isSale,
    })),
    spus: spus.map((s) => ({
      spuId: String(s._id),
      name: s.name,
      saleAttrList: s.saleAttrList,
      categoryPath: buildCategoryPath(s.category3Id, categoryById),
    })),
  }
}
