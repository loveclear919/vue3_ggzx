import type { Request, Response } from 'express'
import { ok } from '../utils/respond.js'
import * as baseSaleAttrService from '../services/baseSaleAttr.js'

// 处理层：基础销售属性（只读）
export async function listBaseSaleAttrs(_req: Request, res: Response) {
  const data = await baseSaleAttrService.listBaseSaleAttrs()
  ok(res, data)
}
