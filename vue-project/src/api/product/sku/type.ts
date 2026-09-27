// SKU（可下单的最小库存单位）模块请求/响应类型 —— 与后端 toSkuDTO / 接口契约对齐

// 组合值快照 — 与后端 skuSaleAttrValueSchema 对齐
export interface SkuSaleAttrValue {
  saleAttrName: string
  saleAttrValue: string
}

// SKU 对象 — 与后端 toSkuDTO 返回结构对齐
export interface SkuInfo {
  skuId: string
  spuId: string
  category3Id: string
  skuName: string
  price: number // 单位：分（展示用 centsToYuan 转换，输入用 yuanToCents 换算）
  weight: number // 单位：克
  stock: number
  skuDesc: string
  skuDefaultImg: string // 为空时展示回退 SPU 首图
  skuSaleAttrValueList: SkuSaleAttrValue[]
  isSale: boolean
}

// 列表查询参数
export interface SkuListParams {
  spuId: string
  page: number
  pageSize: number
}

// 列表返回数据（响应拦截器已剥掉 code/message 信封）
export interface SkuListResponse {
  list: SkuInfo[]
  total: number
}

// 整组生成的单行输入（price 单位：分）
export interface SkuItemInput {
  skuSaleAttrValueList: SkuSaleAttrValue[]
  price: number
  weight: number
  stock: number
  skuName?: string
  skuDesc?: string
  skuDefaultImg?: string
  isSale?: boolean
}

// 整组生成请求
export interface GenerateSkusRequest {
  spuId: string
  items: SkuItemInput[]
}

// 白名单更新请求 —— 组合字段与派生字段不接受
export type UpdateSkuRequest = Partial<
  Pick<SkuInfo, 'skuName' | 'price' | 'weight' | 'stock' | 'skuDesc' | 'skuDefaultImg' | 'isSale'>
>

// 清空整组返回
export interface ClearSkusResponse {
  deletedCount: number
}
