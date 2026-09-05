// 品牌管理（trademark）模块请求/响应类型

// 品牌对象 — 与后端 toBrandDTO 返回结构对齐
export interface BrandInfo {
  brandId: string
  name: string
  logoUrl: string
}

// 列表查询参数
export interface BrandListParams {
  page: number
  pageSize: number
  keyword?: string
}

// 列表返回数据（响应拦截器已剥掉 code/message 信封）
export interface BrandListResponse {
  list: BrandInfo[]
  total: number
}

// 新增品牌请求参数
export interface CreateBrandRequest {
  name: string
  logoUrl?: string
}

// 更新品牌请求参数 — 后端白名单只认 name/logoUrl，均可选
export interface UpdateBrandRequest {
  name?: string
  logoUrl?: string
}
