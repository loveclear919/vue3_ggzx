import { BaseSaleAttr, toBaseSaleAttrDTO } from '../models/BaseSaleAttr.js'
import { AppError } from '../utils/AppError.js'
import mongoose from 'mongoose'

// 业务层：基础销售属性（只读字典，种子写入）
// category3Id：按三级分类过滤 —— 通用维度（categoryIds 空）恒可见；特化维度（网络/套餐等）仅对应分类可见
export async function listBaseSaleAttrs(category3Id?: string) {
  const filter: Record<string, unknown> = {}
  if (category3Id !== undefined && category3Id !== '') {
    if (!mongoose.isValidObjectId(category3Id)) {
      throw AppError.badRequest('分类格式不合法')
    }
    filter.$or = [{ categoryIds: { $size: 0 } }, { categoryIds: category3Id }]
  }
  const list = await BaseSaleAttr.find(filter).sort({ createdAt: 1 })
  return list.map(toBaseSaleAttrDTO)
}
