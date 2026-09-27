// SKU 管理接口统一出口
import request from '@/utils/request'
import type {
  SkuInfo,
  SkuListParams,
  SkuListResponse,
  GenerateSkusRequest,
  UpdateSkuRequest,
  ClearSkusResponse,
} from './type'

const BASE_URL = '/sku'

// 按 SPU 分页查询 SKU 列表
export const getSkuList = (params: SkuListParams) =>
  request.get<SkuListResponse>(BASE_URL, { params })

// 整组生成（首次）：该 SPU 当前无 SKU，否则 409
export const generateSkus = (data: GenerateSkusRequest) => request.post<SkuInfo[]>(BASE_URL, data)

// 白名单更新（定价/库存/上下架/改名等；组合不可变 I8）
export const updateSku = (id: string, data: UpdateSkuRequest) =>
  request.patch<SkuInfo>(`${BASE_URL}/${id}`, data)

// 清空整组（撤销生成）：删除该 SPU 的全部 SKU，幂等
export const clearSkus = (spuId: string) =>
  request.delete<ClearSkusResponse>(BASE_URL, { params: { spuId } })
