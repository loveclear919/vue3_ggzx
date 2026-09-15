// 基础销售属性接口统一出口
import request from '@/utils/request'
import type { BaseSaleAttrInfo } from './type'

enum Api {
  BASE_SALE_ATTR = '/base-sale-attr',
}

// 获取基础销售属性字典（SPU 销售属性维度下拉）
export const getBaseSaleAttrList = () => request.get<BaseSaleAttrInfo[]>(Api.BASE_SALE_ATTR)
