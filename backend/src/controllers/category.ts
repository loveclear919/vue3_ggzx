import type { Request, Response } from 'express'
import { AppError } from '../utils/AppError.js'
import { ok } from '../utils/respond.js'
import * as categoryService from '../services/category.js'

// 处理层：商品分类（目前只读，种子数据由脚本写入）

// 平铺查询某父级下的子级（不传 parentId = 一级分类）
export async function listCategories(req: Request, res: Response) {
  const parentId = req.query.parentId
  if (parentId !== undefined && (typeof parentId !== 'string' || !parentId)) {
    throw AppError.badRequest('parentId 参数不合法')
  }

  const data = await categoryService.listChildCategories(
    typeof parentId === 'string' ? parentId : undefined,
  )
  ok(res, data)
}
