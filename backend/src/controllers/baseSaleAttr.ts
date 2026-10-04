import type { Request, Response } from 'express'
import { ok } from '../utils/respond.js'
import * as baseSaleAttrService from '../services/baseSaleAttr.js'

// 处理层：基础销售属性（只读）
// 支持 ?category3Id= 按三级分类过滤（SPU 表单按当前分类拉维度候选）
export async function listBaseSaleAttrs(req: Request, res: Response) {
  const category3Id = typeof req.query.category3Id === 'string' ? req.query.category3Id : undefined
  const data = await baseSaleAttrService.listBaseSaleAttrs(category3Id)
  ok(res, data)
}
