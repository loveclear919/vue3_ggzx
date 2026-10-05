import {
  Spu,
  SPU_LIMITS,
  toSpuDTO,
  type ISpuAttr,
  type ISpuImage,
  type ISpuSaleAttr,
} from '../models/Spu.js'
import { Sku } from '../models/Sku.js'
import { Brand } from '../models/Brand.js'
import { Category } from '../models/Category.js'
import { Attr } from '../models/Attr.js'
import { BaseSaleAttr } from '../models/BaseSaleAttr.js'
import { AppError } from '../utils/AppError.js'
import { escapeRegExp } from '../utils/escapeRegExp.js'
import { rethrowConflict } from '../utils/mongoError.js'
import { normalizePage } from '../utils/pagination.js'

// 业务层：SPU 管理

export interface ListSpusParams {
  category3Id: string
  page: number
  pageSize: number
  keyword?: string
}

// 判断是否为普通对象（非 null、非数组），用于类型收窄
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 清洗字符串：去空白、空串转 undefined
function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined
}

// 字符串数组归一化
function normalizeStringList(list: unknown[], maxLen: number): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const item of list) {
    if (typeof item !== 'string' && typeof item !== 'number') continue
    const value = String(item).trim().slice(0, maxLen)
    if (!value || seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}

// 三级分类才能挂 SPU（与属性模块规则一致）
async function ensureCategory3(categoryId: string) {
  const category = await Category.findById(categoryId)
  if (!category) {
    throw AppError.notFound('分类不存在')
  }
  if (category.level !== 3) {
    throw AppError.badRequest('只有三级分类下才有 SPU')
  }
}

// 确保品牌存在
async function ensureBrand(brandId: string) {
  const brand = await Brand.findById(brandId)
  if (!brand) {
    throw AppError.notFound('品牌不存在')
  }
}

// 图片归一化：缺文件名的从 URL 末段派生
function normalizeImageList(input: unknown): ISpuImage[] {
  if (!Array.isArray(input)) return []
  const images: ISpuImage[] = []
  for (const item of input) {
    if (!isRecord(item)) continue
    const imageUrl = cleanString(item.imageUrl)
    if (!imageUrl) continue
    const imageName = (cleanString(item.imageName) ?? imageUrl.split('/').pop() ?? '').slice(
      0,
      SPU_LIMITS.IMAGE_NAME_LENGTH,
    )
    images.push({ imageUrl, imageName })
    if (images.length >= SPU_LIMITS.MAX_IMAGE_COUNT) break
  }
  return images
}

// 平台属性归一化：用户只填其中几个是正常状态，丢弃等于删掉可填项
function normalizeAttrList(input: unknown): ISpuAttr[] {
  if (!Array.isArray(input)) return []
  const attrs: ISpuAttr[] = []
  const seen = new Set<string>()
  for (const item of input) {
    if (!isRecord(item)) continue
    const attrName = cleanString(item.attrName)
    // 同名属性只保留首次出现的行（前端从平台属性初始化，正常不会重复；这里兜底恶意/脏请求）
    if (!attrName || seen.has(attrName)) continue
    seen.add(attrName)
    attrs.push({
      attrName: attrName.slice(0, SPU_LIMITS.ATTR_NAME_LENGTH),
      attrValue: (cleanString(item.attrValue) ?? '').slice(0, SPU_LIMITS.ATTR_VALUE_LENGTH),
    })
    if (attrs.length >= SPU_LIMITS.MAX_ATTR_COUNT) break
  }
  return attrs
}

// 销售属性归一化
function normalizeSaleAttrList(input: unknown): ISpuSaleAttr[] {
  if (!Array.isArray(input)) return []
  const saleAttrs: ISpuSaleAttr[] = []
  const seen = new Set<string>()
  for (const item of input) {
    if (!isRecord(item)) continue
    const saleAttrName = cleanString(item.saleAttrName)
    const saleAttrValueList = normalizeStringList(
      Array.isArray(item.saleAttrValueList) ? item.saleAttrValueList : [],
      SPU_LIMITS.SALE_ATTR_VALUE_LENGTH,
    )

    if (!saleAttrName && saleAttrValueList.length === 0) continue
    if (!saleAttrName) {
      throw AppError.badRequest('销售属性值缺少所属的属性名')
    }
    if (saleAttrValueList.length === 0) {
      throw AppError.badRequest(`销售属性「${saleAttrName}」至少需要一个属性值`)
    }

    // 同名维度只保留首次出现的行（前端已按行去重，这里兜底恶意/脏请求）
    if (seen.has(saleAttrName)) continue
    seen.add(saleAttrName)
    saleAttrs.push({
      saleAttrName: saleAttrName.slice(0, SPU_LIMITS.SALE_ATTR_NAME_LENGTH),
      saleAttrValueList: saleAttrValueList.slice(0, SPU_LIMITS.MAX_SALE_ATTR_VALUES),
    })
    if (saleAttrs.length >= SPU_LIMITS.MAX_SALE_ATTR_COUNT) break
  }
  return saleAttrs
}

// 平台属性名必须属于该三级分类已定义的属性，避免绕过前端自由塞属性名
async function ensureAttrNamesValid(category3Id: string, attrs: ISpuAttr[]) {
  if (attrs.length === 0) return
  const known = new Set(
    (await Attr.find({ categoryId: category3Id }).select('name').lean()).map((attr) => attr.name),
  )
  const unknown = attrs.filter((attr) => !known.has(attr.attrName)).map((attr) => attr.attrName)
  if (unknown.length > 0) {
    throw AppError.badRequest(`平台属性不存在：${unknown.join('、')}`)
  }
}

// 更新场景的宽松校验：属性名 ∈ (原快照 ∪ 当前分类属性集合)
// 快照里「属性管理中已删除」的行允许保留（快照语义），但仍拒绝凭空捏造的名字
function ensureAttrNamesValidOnUpdate(
  snapshotAttrList: ISpuAttr[],
  category3Id: string,
  attrs: ISpuAttr[],
) {
  if (attrs.length === 0) return
  return ensureAttrNamesValid(
    category3Id,
    attrs.filter((attr) => !snapshotAttrList.some((snap) => snap.attrName === attr.attrName)),
  )
}

// 销售属性维度名必须来自字典，且维度须对当前三级分类开放（通用维度 categoryIds 空 = 全分类可用；
// 特化维度如「网络/套餐」只配了对应分类 —— 空调不能用「套餐」这类跨域维度）
async function ensureSaleAttrNamesValid(saleAttrs: ISpuSaleAttr[], category3Id: string) {
  if (saleAttrs.length === 0) return
  const dict = await BaseSaleAttr.find().select('name categoryIds').lean()
  const known = new Map(dict.map((saleAttr) => [saleAttr.name, saleAttr.categoryIds]))
  const unknown: string[] = []
  const categoryMismatch: string[] = []
  for (const saleAttr of saleAttrs) {
    const categoryIds = known.get(saleAttr.saleAttrName)
    if (categoryIds === undefined) {
      unknown.push(saleAttr.saleAttrName)
    } else if (categoryIds.length > 0 && !categoryIds.some((id) => String(id) === category3Id)) {
      categoryMismatch.push(saleAttr.saleAttrName)
    }
  }
  if (unknown.length > 0) {
    throw AppError.badRequest(`销售属性不存在：${unknown.join('、')}`)
  }
  if (categoryMismatch.length > 0) {
    throw AppError.badRequest(`销售属性不适用当前分类：${categoryMismatch.join('、')}`)
  }
}

// 分页列表（keyword 为空时不加正则条件）
export async function listSpus({ category3Id, page, pageSize, keyword }: ListSpusParams) {
  await ensureCategory3(category3Id)

  const filter: { category3Id: string; name?: { $regex: string; $options: string } } = {
    category3Id,
  }
  if (keyword) {
    // 转义后作为字面量匹配：用户输入 `(` 等字符时不会破坏正则语法
    filter.name = { $regex: escapeRegExp(keyword), $options: 'i' }
  }

  const { page: safePage, pageSize: safePageSize } = normalizePage(page, pageSize)

  const [list, total] = await Promise.all([
    Spu.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safePageSize)
      .limit(safePageSize),
    Spu.countDocuments(filter),
  ])

  return { list: list.map(toSpuDTO), total }
}

// SPU 详情（SKU 页入口依赖：页面刷新后需要 SPU 上下文，列表行数据带不过来）
export async function getSpuById(id: string) {
  const spu = await Spu.findById(id)
  if (!spu) {
    throw AppError.notFound('SPU 不存在')
  }
  return toSpuDTO(spu)
}

export interface CreateSpuParams {
  name: string
  description?: string
  brandId: string
  category3Id: string
  imageList?: unknown
  attrList?: unknown
  saleAttrList?: unknown
}

export async function createSpu(params: CreateSpuParams) {
  const name = params.name.trim()
  if (!name) {
    throw AppError.badRequest('SPU 名称不能为空')
  }

  await ensureBrand(params.brandId)
  await ensureCategory3(params.category3Id)

  const imageList = normalizeImageList(params.imageList)
  const attrList = normalizeAttrList(params.attrList)
  const saleAttrList = normalizeSaleAttrList(params.saleAttrList)
  await ensureAttrNamesValid(params.category3Id, attrList)
  await ensureSaleAttrNamesValid(saleAttrList, params.category3Id)

  try {
    const spu = await Spu.create({
      name,
      description: cleanString(params.description) ?? '',
      brandId: params.brandId,
      category3Id: params.category3Id,
      imageList,
      attrList,
      saleAttrList,
    })
    return toSpuDTO(spu)
  } catch (err) {
    rethrowConflict(err, [null, 'SPU 名称已存在'])
  }
}

// 销售属性列表的规范化形式（I6 同值放行比对用）：
// 维度按码点排序、每个维度的值去重后排序 —— 与提交顺序无关，只关心语义集合
function canonicalSaleAttrList(saleAttrList: ISpuSaleAttr[]): string {
  return JSON.stringify(
    saleAttrList
      .map((dim) => [dim.saleAttrName, [...new Set(dim.saleAttrValueList)].sort()] as const)
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
  )
}

// 更新走白名单
export async function updateSpu(id: string, updates: Record<string, unknown>) {
  const patch: Record<string, unknown> = {}

  // 分类比对与属性名校验都要当前文档：惰性取一次，两处共用（避免重复查库）
  type CurrentSpu = { category3Id: unknown; attrList: ISpuAttr[]; saleAttrList: ISpuSaleAttr[] }
  let current: CurrentSpu | undefined // 不缓存"没查到"：直接抛 404，避免 null 在调用处需要二次收窄
  const loadCurrent = async (): Promise<CurrentSpu> => {
    if (current === undefined) {
      const found = await Spu.findById(id).select('category3Id attrList saleAttrList').lean()
      if (!found) {
        throw AppError.notFound('SPU 不存在')
      }
      current = found
    }
    return current
  }

  if (updates.name !== undefined) {
    if (typeof updates.name !== 'string' || !updates.name.trim()) {
      throw AppError.badRequest('SPU 名称不能为空')
    }
    patch.name = updates.name.trim()
  }

  if (updates.description !== undefined) {
    if (typeof updates.description !== 'string') {
      throw AppError.badRequest('SPU 描述格式不合法')
    }
    patch.description = updates.description.trim()
  }

  if (updates.brandId !== undefined) {
    if (typeof updates.brandId !== 'string' || !updates.brandId) {
      throw AppError.badRequest('品牌不能为空')
    }
    await ensureBrand(updates.brandId)
    patch.brandId = updates.brandId
  }

  if (updates.category3Id !== undefined) {
    if (typeof updates.category3Id !== 'string' || !updates.category3Id) {
      throw AppError.badRequest('三级分类不能为空')
    }

    const { category3Id } = await loadCurrent()
    if (String(category3Id) !== updates.category3Id) {
      throw AppError.badRequest('不支持修改所属分类')
    }
  }

  if (updates.imageList !== undefined) {
    if (!Array.isArray(updates.imageList)) {
      throw AppError.badRequest('图片列表格式不合法')
    }
    patch.imageList = normalizeImageList(updates.imageList)
  }

  if (updates.attrList !== undefined) {
    if (!Array.isArray(updates.attrList)) {
      throw AppError.badRequest('属性列表格式不合法')
    }
    const attrList = normalizeAttrList(updates.attrList)

    // 允许保留「属性管理中已删除」的历史快照行
    const snapshot = await loadCurrent()
    await ensureAttrNamesValidOnUpdate(snapshot.attrList, String(snapshot.category3Id), attrList)
    patch.attrList = attrList
  }

  if (updates.saleAttrList !== undefined) {
    if (!Array.isArray(updates.saleAttrList)) {
      throw AppError.badRequest('销售属性列表格式不合法')
    }
    const saleAttrList = normalizeSaleAttrList(updates.saleAttrList)
    // 分类不在此接口白名单内（category3Id 创建后不可改）：用 SPU 自身分类校验维度适用性
    const snapshotForCategory = await Spu.findById(id).select('category3Id').lean()
    if (!snapshotForCategory) {
      throw AppError.notFound('SPU 不存在')
    }
    await ensureSaleAttrNamesValid(saleAttrList, String(snapshotForCategory.category3Id))

    // I6：存在 SKU 时销售属性冻结 —— 组合集变了会让已生成的 SKU 变孤儿。
    // 编辑表单总是带全量 saleAttrList，用规范化形式比对（与顺序无关）：一致才放行
    const snapshot = await loadCurrent()
    if (
      (await Sku.countDocuments({ spuId: id })) > 0 &&
      canonicalSaleAttrList(snapshot.saleAttrList) !== canonicalSaleAttrList(saleAttrList)
    ) {
      throw AppError.conflict('更改 SPU 前请先删除该 SPU 下的 SKU')
    }
    patch.saleAttrList = saleAttrList
  }

  if (Object.keys(patch).length === 0) {
    throw AppError.badRequest('没有需要更新的字段')
  }

  const spu = await Spu.findByIdAndUpdate(id, patch, {
    returnDocument: 'after',
    runValidators: true,
  }).catch((err) => {
    rethrowConflict(err, [null, 'SPU 名称已存在'])
  })
  if (!spu) {
    throw AppError.notFound('SPU 不存在')
  }
  return toSpuDTO(spu)
}

export async function deleteSpu(id: string) {
  // I6：先查 SKU 引用（不存在的 SPU 自然计数为 0，404 由下面的删除结果收口）
  if (await Sku.countDocuments({ spuId: id })) {
    throw AppError.conflict('删除 SPU 前请先删除该 SPU 下的 SKU')
  }
  const spu = await Spu.findByIdAndDelete(id)
  if (!spu) {
    throw AppError.notFound('SPU 不存在')
  }
}
