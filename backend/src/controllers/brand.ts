import type { Request, Response } from 'express'
import { AppError } from '../utils/AppError.js'
import { ok } from '../utils/respond.js'
import * as brandService from '../services/brand.js'

// 处理层：品牌管理接口
// 分页参数默认值 + 数值转换（非法值经 Number() 变 NaN → || 兜底回默认）

export async function listBrands(req: Request, res: Response) {
  const page = Number(req.query.page) || 1
  const pageSize = Number(req.query.pageSize) || 10
  // trim 后为空的关键词视为没传，避免正则匹配空串
  const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : undefined

  const data = await brandService.listBrands({ page, pageSize, keyword })
  ok(res, data)
}

export async function createBrand(req: Request, res: Response) {
  const { name, logoUrl } = req.body

  if (!name || typeof name !== 'string') {
    throw AppError.badRequest('品牌名称不能为空')
  }

  const data = await brandService.createBrand(name, typeof logoUrl === 'string' ? logoUrl : '')
  ok(res, data, '新增成功')
}

export async function updateBrand(req: Request, res: Response) {
  const id = req.params.id
  // Express 5 将 params 标为 string | string[]（同名参数可重复），需收窄
  if (!id || Array.isArray(id)) {
    throw AppError.badRequest('缺少品牌 id')
  }

  const data = await brandService.updateBrand(id, req.body)
  ok(res, data, '更新成功')
}

export async function deleteBrand(req: Request, res: Response) {
  const id = req.params.id
  // Express 5 将 params 标为 string | string[]（同名参数可重复），需收窄
  if (!id || Array.isArray(id)) {
    throw AppError.badRequest('缺少品牌 id')
  }

  await brandService.deleteBrand(id)
  ok(res, null, '删除成功')
}
