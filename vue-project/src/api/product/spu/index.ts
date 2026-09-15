// SPU 管理接口统一出口
import request from '@/utils/request'
import type {
  SpuInfo,
  SpuListParams,
  SpuListResponse,
  CreateSpuRequest,
  UpdateSpuRequest,
} from './type'

const BASE_URL = '/spu'

// 按三级分类分页查询 SPU 列表（支持 keyword 搜索）
export const getSpuList = (params: SpuListParams) =>
  request.get<SpuListResponse>(BASE_URL, { params })

// 新增 SPU
export const createSpu = (data: CreateSpuRequest) => request.post<SpuInfo>(BASE_URL, data)

// 更新 SPU
export const updateSpu = (id: string, data: UpdateSpuRequest) =>
  request.patch<SpuInfo>(`${BASE_URL}/${id}`, data)

// 删除 SPU
export const deleteSpu = (id: string) => request.delete<null>(`${BASE_URL}/${id}`)
