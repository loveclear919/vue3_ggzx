import { BaseSaleAttr, toBaseSaleAttrDTO } from '../models/BaseSaleAttr.js'

// 业务层：基础销售属性（只读字典，种子写入）
export async function listBaseSaleAttrs() {
  const list = await BaseSaleAttr.find().sort({ createdAt: 1 })
  return list.map(toBaseSaleAttrDTO)
}
