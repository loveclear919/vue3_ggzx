import type { Request, Response } from 'express'
import { AppError } from '../utils/AppError.js'
import { ok } from '../utils/respond.js'
import * as attrService from '../services/attr.js'

// 处理层：平台属性

//获取指定分类下的所有属性，确保分类存在且是三级分类，并返回属性列表
export async function listAttrs(req: Request, res: Response) {
  const categoryId = req.query.categoryId
  if (typeof categoryId !== 'string' || !categoryId) {
    throw AppError.badRequest('缺少 categoryId 参数')
  }

  const data = await attrService.listAttrsByCategory(categoryId)
  ok(res, data)
}

// 新增
export async function createAttr(req: Request, res: Response) {
  const { categoryId, name, values } = req.body

  if (!categoryId || typeof categoryId !== 'string') {
    throw AppError.badRequest('所属分类不能为空')
  }
  if (!name || typeof name !== 'string') {
    throw AppError.badRequest('属性名称不能为空')
  }
  if (!Array.isArray(values) || values.length === 0 || !values.every((v) => typeof v === 'string')) {
    throw AppError.badRequest('属性值不能为空且必须为字符串数组')
  }

  // 清洗（trim/去空/去重）由 service 统一负责，controller 只做形状校验
  const data = await attrService.createAttr(categoryId, name, values)
  ok(res, data, '新增成功')
}

// 修改
export async function updateAttr(req: Request, res: Response) {
  const id = req.params.id
  // Express 5 将 params 标为 string | string[]（同名参数可重复），需收窄
  if (!id || Array.isArray(id)) {
    throw AppError.badRequest('缺少属性 id')
  }

  const data = await attrService.updateAttr(id, req.body)
  ok(res, data, '更新成功')
}

export async function deleteAttr(req: Request, res: Response) {
  const id = req.params.id
  if (!id || Array.isArray(id)) {
    throw AppError.badRequest('缺少属性 id')
  }

  await attrService.deleteAttr(id)
  ok(res, null, '删除成功')
}
