// 品牌管理接口统一出口
import request from '@/utils/request'
import type {
  BrandInfo,
  BrandListParams,
  BrandListResponse,
  CreateBrandRequest,
  UpdateBrandRequest,
} from './type'

// 品牌接口基础路径：所有方法共用同一资源路径（含 :id 的用模板拼接）
const BASE_URL = '/brand'

// 分页列表（支持 keyword 搜索，后端缺省 page=1 / pageSize=10）
export const getBrandList = (params: BrandListParams) =>
  request.get<BrandListResponse>(BASE_URL, { params })

// 全量品牌（SPU 表单的品牌下拉用）
export const getAllBrands = () => request.get<BrandInfo[]>(`${BASE_URL}/all`)

// 新增品牌
export const createBrand = (data: CreateBrandRequest) => request.post<BrandInfo>(BASE_URL, data)

// 更新品牌
export const updateBrand = (id: string, data: UpdateBrandRequest) =>
  request.patch<BrandInfo>(`${BASE_URL}/${id}`, data)

// 删除品牌
export const deleteBrand = (id: string) => request.delete<null>(`${BASE_URL}/${id}`)
