// 数据大屏聚合接口类型（与后端 services/dashboard.ts 的 DashboardStats 对齐）

export interface DashboardKpi {
  /** SKU 总数（各比率的隐含分母） */
  skuCount: number
  /** 可售 SKU = 已定价 且 在架 */
  sellable: number
  /** 可售率 0~100（后端算好，前端不做除法） */
  sellableRate: number
  /** 在架 SKU 数 */
  onSale: number
  /** 待办 SKU 数（未定价 ∪ 零库存 ∪ 未上架，去重） */
  pending: number
  /** 有 SPU 的品牌数 */
  brandCovered: number
  /** 品牌表总数（含空品牌，用于展示「覆盖 9 / 21」的落差） */
  brandTotal: number
}

export interface PriceBand {
  label: string
  count: number
}

/** 品牌货值（分）——按库存货值排序，替代「SPU 建档数」口径 */
export interface BrandValue {
  brandName: string
  value: number
  skuCount: number
  onSale: number
}

/** SKU 状态三段（互斥且完备：合计 = skuCount） */
export interface SkuStatus {
  onSale: number
  offPriced: number
  offUnpriced: number
}

/** 待办类别：回答「该补什么价 / 该清什么货 / 该上什么架」 */
export type TodoCategory = 'unpriced' | 'zeroStock' | 'notPublished'

export interface SkuTodo {
  /** 稳定唯一标识：列表 key 用它（下标做 key，30s 轮询重排后会错位复用 DOM） */
  skuId: string
  category: TodoCategory
  categoryLabel: string
  spuName: string
  combo: string
  /** 分 */
  price: number
  stock: number
}

/** 热力图数据源：按选中 SPU 在前端切分，按 stock 上色 */
export interface SkuSnapshot {
  skuId: string
  spuId: string
  saleAttrValueList: Array<{ saleAttrName: string; saleAttrValue: string }>
  price: number
  stock: number
  isSale: boolean
}

/** SPU 的分类链节点（一级 → 三级），用于下拉分组与按分类名搜索 */
export interface CategoryPathNode {
  categoryId: string
  name: string
}

/** SPU 下拉数据源（热力图切换） */
export interface SpuDim {
  spuId: string
  name: string
  saleAttrList: Array<{ saleAttrName: string; saleAttrValueList: string[] }>
  /** 空数组 = 分类链不完整（脏数据），前端按「未分类」分组兜底 */
  categoryPath: CategoryPathNode[]
}

export interface DashboardStats {
  kpi: DashboardKpi
  /** 库存总价值（分） */
  stockValue: number
  priceBands: PriceBand[]
  brandTop: BrandValue[]
  skuStatus: SkuStatus
  todos: SkuTodo[]
  skus: SkuSnapshot[]
  spus: SpuDim[]
}
