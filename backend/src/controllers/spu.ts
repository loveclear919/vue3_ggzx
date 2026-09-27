import type { Request, Response } from 'express'
import { AppError } from '../utils/AppError.js'
import { ok } from '../utils/respond.js'
import * as spuService from '../services/spu.js'

// 处理层：SPU 管理（形状校验在此，业务规则在 service）

export async function listSpus(req: Request, res: Response) {
  const categoryId = req.query.categoryId
  if (typeof categoryId !== 'string' || !categoryId) {
    throw AppError.badRequest('缺少 categoryId 参数')
  }

  const page = Number(req.query.page) || 1
  const pageSize = Number(req.query.pageSize) || 10
  const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : undefined

  const data = await spuService.listSpus({ category3Id: categoryId, page, pageSize, keyword })
  ok(res, data)
}

export async function createSpu(req: Request, res: Response) {
  const { name, description, brandId, category3Id, imageList, attrList, saleAttrList } =
    req.body ?? {}

  if (typeof name !== 'string' || !name.trim()) {
    throw AppError.badRequest('SPU 名称不能为空')
  }
  if (typeof brandId !== 'string' || !brandId) {
    throw AppError.badRequest('品牌不能为空')
  }
  if (typeof category3Id !== 'string' || !category3Id) {
    throw AppError.badRequest('三级分类不能为空')
  }
  if (description !== undefined && typeof description !== 'string') {
    throw AppError.badRequest('SPU 描述格式不合法')
  }
  if (imageList !== undefined && !Array.isArray(imageList)) {
    throw AppError.badRequest('图片列表格式不合法')
  }
  if (attrList !== undefined && !Array.isArray(attrList)) {
    throw AppError.badRequest('属性列表格式不合法')
  }
  if (saleAttrList !== undefined && !Array.isArray(saleAttrList)) {
    throw AppError.badRequest('销售属性列表格式不合法')
  }

  const data = await spuService.createSpu({
    name,
    description,
    brandId,
    category3Id,
    imageList,
    attrList,
    saleAttrList,
  })
  ok(res, data, '新增成功')
}

export async function updateSpu(req: Request, res: Response) {
  const id = req.params.id
  // Express 5 将 params 标为 string | string[]（同名参数可重复），需收窄
  if (!id || Array.isArray(id)) {
    throw AppError.badRequest('缺少 SPU id')
  }

  const data = await spuService.updateSpu(id, req.body)
  ok(res, data, '更新成功')
}

export async function deleteSpu(req: Request, res: Response) {
  const id = req.params.id
  if (!id || Array.isArray(id)) {
    throw AppError.badRequest('缺少 SPU id')
  }

  await spuService.deleteSpu(id)
  ok(res, null, '删除成功')
}

// SPU 详情：SKU 页刷新后靠它取上下文（名称、销售属性快照、图片），随 SKU 模块补上
export async function getSpuById(req: Request, res: Response) {
  const id = req.params.id
  if (!id || Array.isArray(id)) {
    throw AppError.badRequest('缺少 SPU id')
  }

  const data = await spuService.getSpuById(id)
  ok(res, data)
}
