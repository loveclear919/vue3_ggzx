import { Brand, toBrandDTO } from '../models/Brand.js'
import { AppError } from '../utils/AppError.js'
import { isDuplicateKeyError } from '../utils/mongoError.js'

// 业务层：品牌管理（分页列表 / 新增 / 更新 / 删除）

export interface ListBrandsParams {
  page: number
  pageSize: number
  keyword?: string
}

// 分页
export async function listBrands({ page, pageSize, keyword }: ListBrandsParams) {
  // keyword 为空时不加正则条件，避免不必要的全表正则扫描
  // 内联类型即可（mongoose 9 将 FilterQuery 重构为 QueryFilter 且未从入口导出）
  const filter: { name?: { $regex: string; $options: string } } = {}
  if (keyword) {
    filter.name = { $regex: keyword, $options: 'i' }
  }

  // 防御：非法页码/页大小规范化（0、负数、超大 pageSize 都不击穿查询）
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)))

  // 列表与总数并行查询，互不阻塞
  const [list, total] = await Promise.all([
    Brand.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safePageSize)
      .limit(safePageSize),
    Brand.countDocuments(filter),
  ])

  return { list: list.map(toBrandDTO), total }
}

// 新增
export async function createBrand(name: string, logoUrl: string) {
  try {
    const brand = await Brand.create({ name, logoUrl })
    return toBrandDTO(brand)
  } catch (err) {
    // Mongo 11000 重复键错误 → 转成预期错误
    if (isDuplicateKeyError(err)) {
      throw AppError.conflict('品牌名称已存在')
    }
    throw err
  }
}

// 更新走白名单：请求体里再多字段也只认 name / logoUrl
// 长度上限交给模型的 maxlength + runValidators 校验（超出走 ValidationError → 400）
export async function updateBrand(id: string, updates: Record<string, unknown>) {
  const allowed = ['name', 'logoUrl'] as const
  const patch: Record<string, string> = {}

  for (const key of allowed) {
    const val = updates[key]
    if (val !== undefined) {
      if (typeof val !== 'string') {
        throw AppError.badRequest(`${key} 格式不合法`)
      }
      patch[key] = val
    }
  }

  if (Object.keys(patch).length === 0) {
    throw AppError.badRequest('没有需要更新的字段')
  }

  // catch 只负责「数据库错误 → 409」的转换；notFound 是正常流程判断，留在 try 外面
  // new: 返回更新后的文档；runValidators: 走模型校验
  const brand = await Brand.findByIdAndUpdate(id, patch, { new: true, runValidators: true }).catch(
    (err) => {
      // 改成已存在的品牌名 → 唯一索引冲突
      if (isDuplicateKeyError(err)) {
        throw AppError.conflict('品牌名称已存在')
      }
      throw err
    },
  )
  if (!brand) {
    throw AppError.notFound('品牌不存在')
  }
  return toBrandDTO(brand)
}

// 删除
export async function deleteBrand(id: string) {
  const brand = await Brand.findByIdAndDelete(id)
  if (!brand) {
    throw AppError.notFound('品牌不存在')
  }
}
