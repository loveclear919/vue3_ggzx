import type { Request, Response } from 'express'
import { AppError } from '../utils/AppError.js'
import { ok } from '../utils/respond.js'
import * as skuService from '../services/sku.js'
import type { SkuItemInput } from '../services/sku.js'

// 处理层：SKU 管理（形状校验在此，业务规则在 service）

export async function listSkus(req: Request, res: Response) {
  const spuId = req.query.spuId
  if (typeof spuId !== 'string' || !spuId) {
    throw AppError.badRequest('缺少 spuId 参数')
  }

  const page = Number(req.query.page) || 1
  const pageSize = Number(req.query.pageSize) || 10

  const data = await skuService.listSkus({ spuId, page, pageSize })
  ok(res, data)
}

// items 逐项形状校验：字段类型在此收口，清洗与业务规则在 service（分层约定）
function shapeCheckItem(item: unknown): SkuItemInput {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    throw AppError.badRequest('items 每项必须是对象')
  }
  const it = item as Record<string, unknown>

  if (!Array.isArray(it.skuSaleAttrValueList)) {
    throw AppError.badRequest('每项必须包含 skuSaleAttrValueList 数组')
  }
  const valueList = it.skuSaleAttrValueList.map((raw) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw AppError.badRequest('销售属性值格式不合法')
    }
    const value = raw as Record<string, unknown>
    if (typeof value.saleAttrName !== 'string' || typeof value.saleAttrValue !== 'string') {
      throw AppError.badRequest('销售属性值格式不合法')
    }
    return { saleAttrName: value.saleAttrName, saleAttrValue: value.saleAttrValue }
  })

  if (typeof it.price !== 'number') {
    throw AppError.badRequest('价格必须为数字（单位：分）')
  }
  if (typeof it.weight !== 'number') {
    throw AppError.badRequest('重量必须为数字（单位：克）')
  }
  if (typeof it.stock !== 'number') {
    throw AppError.badRequest('库存必须为数字')
  }
  if (it.skuName !== undefined && typeof it.skuName !== 'string') {
    throw AppError.badRequest('SKU 名称格式不合法')
  }
  if (it.skuDesc !== undefined && typeof it.skuDesc !== 'string') {
    throw AppError.badRequest('SKU 描述格式不合法')
  }
  if (it.skuDefaultImg !== undefined && typeof it.skuDefaultImg !== 'string') {
    throw AppError.badRequest('默认图格式不合法')
  }
  if (it.isSale !== undefined && typeof it.isSale !== 'boolean') {
    throw AppError.badRequest('上下架状态格式不合法')
  }

  return {
    skuSaleAttrValueList: valueList,
    price: it.price,
    weight: it.weight,
    stock: it.stock,
    skuName: it.skuName,
    skuDesc: it.skuDesc,
    skuDefaultImg: it.skuDefaultImg,
    isSale: it.isSale,
  }
}

export async function generateSkus(req: Request, res: Response) {
  const { spuId, items } = (req.body ?? {}) as Record<string, unknown>
  if (typeof spuId !== 'string' || !spuId) {
    throw AppError.badRequest('缺少 spuId 参数')
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw AppError.badRequest('items 不能为空且必须为数组')
  }

  const data = await skuService.generateSkus(spuId, items.map(shapeCheckItem))
  ok(res, data, '生成成功')
}

export async function updateSku(req: Request, res: Response) {
  const id = req.params.id
  // Express 5 将 params 标为 string | string[]（同名参数可重复），需收窄
  if (!id || Array.isArray(id)) {
    throw AppError.badRequest('缺少 SKU id')
  }

  const data = await skuService.updateSku(id, (req.body ?? {}) as Record<string, unknown>)
  ok(res, data, '更新成功')
}

export async function clearSkus(req: Request, res: Response) {
  const spuId = req.query.spuId
  if (typeof spuId !== 'string' || !spuId) {
    throw AppError.badRequest('缺少 spuId 参数')
  }

  const deletedCount = await skuService.clearSkus(spuId)
  ok(res, { deletedCount }, '清空成功')
}
