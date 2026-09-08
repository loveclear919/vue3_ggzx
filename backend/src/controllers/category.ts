import type { Request, Response } from 'express'
import { ok } from '../utils/respond.js'
import * as categoryService from '../services/category.js'

// 处理层：商品分类（目前只读，种子数据由脚本写入）

export async function getTree(_req: Request, res: Response) {
  const data = await categoryService.listCategoryTree()
  ok(res, data)
}
