import { createHash } from 'node:crypto'
import { Sku, SKU_LIMITS, toSkuDTO, type ISkuSaleAttrValue } from '../models/Sku.js'
import { Spu, type ISpuSaleAttr } from '../models/Spu.js'
import { AppError } from '../utils/AppError.js'
import { isDuplicateKeyError } from '../utils/mongoError.js'
import { normalizePage } from '../utils/pagination.js'

// 业务层：SKU 管理

// 组合的规范化形式（排序 + JSON.stringify）：维度名升序，维度值原样
export function canonicalCombination(
  list: { saleAttrName: string; saleAttrValue: string }[],
): string {
  const pairs = list.map((v) => [v.saleAttrName, v.saleAttrValue] as const)
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  return JSON.stringify(pairs)
}

// 组合的哈希值（SHA256）：用于唯一索引
export function combinationKeyOf(list: { saleAttrName: string; saleAttrValue: string }[]): string {
  return createHash('sha256').update(canonicalCombination(list)).digest('hex')
}

// 派生 SKU 名称：SPU 名称 + 销售属性值列表（空格分隔）
function deriveSkuName(
  spuName: string,
  saleAttrList: ISpuSaleAttr[],
  valueList: ISkuSaleAttrValue[],
): string {
  const valuesStr = saleAttrList
    .map((dim) => valueList.find((v) => v.saleAttrName === dim.saleAttrName)?.saleAttrValue ?? '')
    .join(' ')
  if (!valuesStr) return spuName.slice(0, SKU_LIMITS.NAME_LENGTH)
  const spare = SKU_LIMITS.NAME_LENGTH - valuesStr.length - 1
  return spare >= 1
    ? `${spuName.slice(0, spare)} ${valuesStr}`
    : valuesStr.slice(0, SKU_LIMITS.NAME_LENGTH)
}

// 确保 SPU 存在：后续操作依赖 SPU 的销售属性维度定义
async function ensureSpu(spuId: string) {
  const spu = await Spu.findById(spuId).select('name category3Id saleAttrList')
  if (!spu) {
    throw AppError.notFound('SPU 不存在')
  }
  return spu
}

// 分页查询 SKU：按 SPU 分页查询，返回 DTO 列表和总数
export interface ListSkusParams {
  spuId: string
  page: number
  pageSize: number
}

// 按 SPU 分页查询
export async function listSkus({ spuId, page, pageSize }: ListSkusParams) {
  await ensureSpu(spuId)

  const { page: safePage, pageSize: safePageSize } = normalizePage(page, pageSize)

  const [list, total] = await Promise.all([
    Sku.find({ spuId })
      .sort({ sortIndex: 1 })
      .skip((safePage - 1) * safePageSize)
      .limit(safePageSize),
    Sku.countDocuments({ spuId }),
  ])

  return { list: list.map(toSkuDTO), total }
}

// SKU 项输入接口
export interface SkuItemInput {
  skuSaleAttrValueList: ISkuSaleAttrValue[]
  price: number
  weight: number
  stock: number
  skuName?: string
  skuDesc?: string
  skuDefaultImg?: string
  isSale?: boolean
}

// 笛卡尔积：销售属性维度 × 值 → 组合列表
function cartesianProduct(saleAttrList: ISpuSaleAttr[]): ISkuSaleAttrValue[][] {
  let combos: ISkuSaleAttrValue[][] = [[]]
  for (const dim of saleAttrList) {
    const next: ISkuSaleAttrValue[][] = []
    for (const combo of combos) {
      for (const value of dim.saleAttrValueList) {
        next.push([...combo, { saleAttrName: dim.saleAttrName, saleAttrValue: value }])
      }
    }
    combos = next
  }
  return combos
}

// 数值边界校验：整数 / 非负 / 上限，字段级提示
function assertNumberBoundary(label: string, unit: string | null, value: number, max: number) {
  if (!Number.isInteger(value)) {
    throw AppError.badRequest(unit ? `${label}必须为整数（单位：${unit}）` : `${label}必须为整数`)
  }
  if (value < 0) {
    throw AppError.badRequest(`${label}不能为负`)
  }
  if (value > max) {
    throw AppError.badRequest(unit ? `${label}不能超过 ${max} ${unit}` : `${label}不能超过 ${max}`)
  }
}

// 组合的可读形式（报错文案用）：颜色=黑/版本=128G；空组合显示「（空组合）」
function formatCombos(combos: ISkuSaleAttrValue[][]): string {
  return combos
    .map((combo) =>
      combo.length === 0
        ? '（空组合）'
        : combo.map((v) => `${v.saleAttrName}=${v.saleAttrValue}`).join('/'),
    )
    .join('、')
}

// SKU 的核心逻辑，包含了多层校验和数据处理，确保生成的 SKU 数据符合业务规则和数据库约束。
export async function generateSkus(spuId: string, items: SkuItemInput[]) {
  const spu = await ensureSpu(spuId)

  // 生成是一次性操作：重复生成会覆盖已填好的价格库存，409 安全网拦住
  if (await Sku.exists({ spuId })) {
    throw AppError.conflict('该 SPU 已有 SKU，如需重建请先清空再生成')
  }

  // 预处理：去掉维度名/值的前后空格，避免前端传入的脏数据导致组合键不一致
  const cleanedItems = items.map((item) => ({
    valueList: item.skuSaleAttrValueList.map((v) => ({
      saleAttrName: v.saleAttrName.trim(),
      saleAttrValue: v.saleAttrValue.trim(),
    })),
    item,
  }))

  // 维度名/值非空 + 维度名唯一：每行的维度名集合必须唯一，且非空
  for (const { valueList } of cleanedItems) {
    const seenDims = new Set<string>()
    for (const v of valueList) {
      if (!v.saleAttrName) {
        throw AppError.badRequest('销售属性维度名不能为空')
      }
      if (!v.saleAttrValue) {
        throw AppError.badRequest('销售属性值不能为空')
      }
      if (seenDims.has(v.saleAttrName)) {
        throw AppError.badRequest(`维度重复：${v.saleAttrName}`)
      }
      seenDims.add(v.saleAttrName)
    }
  }

  // 组合数上限：期望组合数 = 笛卡尔积，提交组合数 ≤ 上限
  const expectedCount = spu.saleAttrList.reduce((acc, dim) => acc * dim.saleAttrValueList.length, 1)
  if (expectedCount > SKU_LIMITS.MAX_COMBINATIONS) {
    throw AppError.badRequest(
      `组合数超上限：期望 ${expectedCount} 个，上限 ${SKU_LIMITS.MAX_COMBINATIONS} 个`,
    )
  }
  if (items.length > SKU_LIMITS.MAX_COMBINATIONS) {
    throw AppError.badRequest(
      `组合数超上限：提交 ${items.length} 个，上限 ${SKU_LIMITS.MAX_COMBINATIONS} 个`,
    )
  }

  // 组合键映射：期望集合 + 提交集合 → 组合键，便于集合比对
  const expectedByKey = new Map<string, ISkuSaleAttrValue[]>()
  const sortIndexByKey = new Map<string, number>()
  cartesianProduct(spu.saleAttrList).forEach((combo, index) => {
    const key = combinationKeyOf(combo)
    expectedByKey.set(key, combo)
    sortIndexByKey.set(key, index)
  })

  // 维度名集合比对
  const spuDimNames = spu.saleAttrList.map((dim) => dim.saleAttrName)
  const spuDimSet = new Set(spuDimNames)
  for (const { valueList } of cleanedItems) {
    // 提取每行的维度名集合
    const rowDimNames = valueList.map((v) => v.saleAttrName)
    const rowDimSet = new Set(rowDimNames)
    // 检查缺失的维度名
    const missingDims = spuDimNames.filter((name) => !rowDimSet.has(name))
    if (missingDims.length > 0) {
      throw AppError.badRequest(`维度缺失：${missingDims.join('、')}`)
    }
    // 检查多余的维度名
    const unknownDims = rowDimNames.filter((name) => !spuDimSet.has(name))
    if (unknownDims.length > 0) {
      throw AppError.badRequest(`维度名不认识：${unknownDims.join('、')}`)
    }
  }

  // 维度值集合比对：提交的维度值必须在 SPU 的候选值中
  const candidatesByDim = new Map(
    spu.saleAttrList.map((dim) => [dim.saleAttrName, new Set(dim.saleAttrValueList)]),
  )
  for (const { valueList } of cleanedItems) {
    for (const v of valueList) {
      if (!candidatesByDim.get(v.saleAttrName)?.has(v.saleAttrValue)) {
        throw AppError.badRequest(`维度 ${v.saleAttrName} 的取值 ${v.saleAttrValue} 不在候选值中`)
      }
    }
  }

  // 组合集合比对：提交的组合必须与期望组合一致
  const submittedByKey = new Map<string, ISkuSaleAttrValue[]>()
  const duplicates: ISkuSaleAttrValue[][] = []
  for (const { valueList } of cleanedItems) {
    const key = combinationKeyOf(valueList)
    if (submittedByKey.has(key)) {
      duplicates.push(valueList)
    } else {
      submittedByKey.set(key, valueList)
    }
  }

  if (duplicates.length > 0) {
    throw AppError.badRequest(`组合重复：${formatCombos(duplicates)}`)
  }

  const missing = [...expectedByKey.entries()]
    .filter(([key]) => !submittedByKey.has(key))
    .map(([, combo]) => combo)
  if (missing.length > 0) {
    throw AppError.badRequest(`组合缺失：${formatCombos(missing)}`)
  }
  // 多余 = 不在期望集合内
  const extra = [...submittedByKey.values()].filter(
    (combo) => !expectedByKey.has(combinationKeyOf(combo)),
  )
  if (extra.length > 0) {
    throw AppError.badRequest(`组合多余：${formatCombos(extra)}`)
  }

  // 逐行校验：价格/重量/库存边界 + 上架闸门
  for (const { item } of cleanedItems) {
    assertNumberBoundary('价格', '分', item.price, SKU_LIMITS.PRICE_MAX)
    assertNumberBoundary('重量', '克', item.weight, SKU_LIMITS.WEIGHT_MAX)
    assertNumberBoundary('库存', null, item.stock, SKU_LIMITS.STOCK_MAX)
    if (item.isSale && item.price <= 0) {
      throw AppError.badRequest('请先设置价格再上架')
    }
  }

  // 校验全部通过才触碰数据库
  const docs = cleanedItems.map(({ valueList, item }) => {
    const combinationKey = combinationKeyOf(valueList)
    const sortIndex = sortIndexByKey.get(combinationKey)
    if (sortIndex === undefined) {
      throw AppError.internal('组合未在期望集合中，无法确定排序序号')
    }
    return {
      spuId: spu._id,
      category3Id: spu.category3Id, // 服务端从 SPU 复制，不接受客户端传值
      skuName: item.skuName?.trim()
        ? item.skuName.trim().slice(0, SKU_LIMITS.NAME_LENGTH)
        : deriveSkuName(spu.name, spu.saleAttrList, valueList),
      price: item.price,
      weight: item.weight,
      stock: item.stock,
      skuDesc: item.skuDesc?.trim() ?? '',
      skuDefaultImg: item.skuDefaultImg?.trim() ?? '',
      skuSaleAttrValueList: valueList,
      combinationKey,
      sortIndex,
      isSale: item.isSale ?? false,
    }
  })

  // 按组合键排序 避免插入顺序随机导致分页不稳定
  docs.sort((a, b) =>
    a.combinationKey < b.combinationKey ? -1 : a.combinationKey > b.combinationKey ? 1 : 0,
  )

  try {
    const created = await Sku.insertMany(docs, { ordered: true })
    return created.map(toSkuDTO)
  } catch (err) {
    // 唯一索引冲突（如并发重复生成）→ 409 而非 500
    if (isDuplicateKeyError(err)) {
      throw AppError.conflict('该组合的 SKU 已存在')
    }
    throw err
  }
}

// 更新 SKU：只允许运营日常动作（定价/库存/上下架/改名/默认图/描述），组合不可变
export async function updateSku(id: string, updates: Record<string, unknown>) {
  const patch: Record<string, unknown> = {}

  if (updates.skuName !== undefined) {
    if (typeof updates.skuName !== 'string' || !updates.skuName.trim()) {
      throw AppError.badRequest('SKU 名称不能为空')
    }
    patch.skuName = updates.skuName.trim()
  }
  if (updates.price !== undefined) {
    if (typeof updates.price !== 'number') {
      throw AppError.badRequest('价格格式不合法（单位：分）')
    }
    assertNumberBoundary('价格', '分', updates.price, SKU_LIMITS.PRICE_MAX)
    patch.price = updates.price
  }
  if (updates.weight !== undefined) {
    if (typeof updates.weight !== 'number') {
      throw AppError.badRequest('重量格式不合法（单位：克）')
    }
    assertNumberBoundary('重量', '克', updates.weight, SKU_LIMITS.WEIGHT_MAX)
    patch.weight = updates.weight
  }
  if (updates.stock !== undefined) {
    if (typeof updates.stock !== 'number') {
      throw AppError.badRequest('库存格式不合法')
    }
    assertNumberBoundary('库存', null, updates.stock, SKU_LIMITS.STOCK_MAX)
    patch.stock = updates.stock
  }
  if (updates.skuDesc !== undefined) {
    if (typeof updates.skuDesc !== 'string') {
      throw AppError.badRequest('SKU 描述格式不合法')
    }
    patch.skuDesc = updates.skuDesc.trim()
  }
  if (updates.skuDefaultImg !== undefined) {
    if (typeof updates.skuDefaultImg !== 'string') {
      throw AppError.badRequest('默认图格式不合法')
    }
    patch.skuDefaultImg = updates.skuDefaultImg.trim()
  }
  if (updates.isSale !== undefined) {
    if (typeof updates.isSale !== 'boolean') {
      throw AppError.badRequest('上下架状态格式不合法')
    }
    patch.isSale = updates.isSale
  }

  if (Object.keys(patch).length === 0) {
    throw AppError.badRequest('没有需要更新的字段')
  }

  // 上架必须有价，后端最终拦截
  if (patch.isSale === true) {
    const effectivePrice =
      typeof patch.price === 'number'
        ? patch.price
        : (await Sku.findById(id).select('price').lean())?.price
    if (effectivePrice === undefined) {
      throw AppError.notFound('SKU 不存在')
    }
    if (effectivePrice <= 0) {
      throw AppError.badRequest('请先设置价格再上架')
    }
  }

  const sku = await Sku.findByIdAndUpdate(id, patch, {
    returnDocument: 'after',
    runValidators: true,
  })
  if (!sku) {
    throw AppError.notFound('SKU 不存在')
  }
  return toSkuDTO(sku)
}

// 清空 SKU：删除指定 SPU 下的所有 SKU
export async function clearSkus(spuId: string) {
  await ensureSpu(spuId)
  const result = await Sku.deleteMany({ spuId })
  return result.deletedCount
}
