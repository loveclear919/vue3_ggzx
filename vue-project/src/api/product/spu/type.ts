// SPU（标准产品单元）模块请求/响应类型

// 图片墙条目 — 与后端 spuImageSchema 对齐
export interface SpuImage {
  imageUrl: string
  imageName: string
}

// 平台属性值 — 与后端 spuAttrSchema 对齐
export interface SpuAttr {
  attrName: string
  attrValue: string
}

// 销售属性维度 — 与后端 spuSaleAttrSchema 对齐
export interface SpuSaleAttr {
  saleAttrName: string
  saleAttrValueList: string[]
}

// SPU 对象 — 与后端 toSpuDTO 返回结构对齐
export interface SpuInfo {
  spuId: string
  name: string
  description: string
  brandId: string
  category3Id: string
  imageList: SpuImage[]
  attrList: SpuAttr[]
  saleAttrList: SpuSaleAttr[]
}

// 列表查询参数
export interface SpuListParams {
  categoryId: string
  page: number
  pageSize: number
  keyword?: string
}

// 列表返回数据（响应拦截器已剥掉 code/message 信封）
export interface SpuListResponse {
  list: SpuInfo[]
  total: number
}

// 新增 SPU 请求参数
export interface CreateSpuRequest {
  name: string
  description?: string
  brandId: string
  category3Id: string
  imageList?: SpuImage[]
  attrList?: SpuAttr[]
  saleAttrList?: SpuSaleAttr[]
}

// 更新 SPU 请求参数 — 后端白名单字段均可选
export type UpdateSpuRequest = Partial<CreateSpuRequest>
