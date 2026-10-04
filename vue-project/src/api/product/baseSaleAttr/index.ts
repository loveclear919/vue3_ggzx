// 基础销售属性接口统一出口
import request from '@/utils/request'
import type { BaseSaleAttrInfo } from './type'

enum Api {
  BASE_SALE_ATTR = '/base-sale-attr',
}

// 获取基础销售属性字典（SPU 销售属性维度下拉）
// category3Id：按三级分类过滤 —— 通用维度恒返回，特化维度（网络/套餐等）仅对应分类返回
export const getBaseSaleAttrList = (category3Id?: string) =>
  request.get<BaseSaleAttrInfo[]>(Api.BASE_SALE_ATTR, {
    params: category3Id ? { category3Id } : undefined,
  })
