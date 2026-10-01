import { Attr, ATTR_LIMITS, toAttrDTO } from '../models/Attr.js'
import { Category } from '../models/Category.js'
import { AppError } from '../utils/AppError.js'
import { rethrowConflict } from '../utils/mongoError.js'

// 业务层：平台属性（归属于三级分类）

// 属性值规范化：去空白、去空串、去重
function normalizeValues(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))]
}

// 边界校验：数字统一从模型导出（单一来源），service 只负责给出更明确的 400 文案
function assertValuesBoundary(values: string[]) {
  if (values.length > ATTR_LIMITS.MAX_VALUES_COUNT) {
    throw AppError.badRequest(`属性值最多 ${ATTR_LIMITS.MAX_VALUES_COUNT} 个`)
  }
  if (values.some((v) => v.length > ATTR_LIMITS.VALUE_LENGTH)) {
    throw AppError.badRequest(`属性值长度不能超过 ${ATTR_LIMITS.VALUE_LENGTH} 个字符`)
  }
}

// 分类必须存在且是三级分类 —— list 与 create 共用，保证两个入口校验深度一致
// （list 对非法分类抛 404/400，而不是返回"误导性的空数组"）
async function ensureCategoryCanHoldAttrs(categoryId: string) {
  const category = await Category.findById(categoryId)
  if (!category) {
    throw AppError.notFound('分类不存在')
  }
  if (category.level !== 3) {
    throw AppError.badRequest('只有三级分类才能添加属性')
  }
}

// 获取指定分类下的所有属性
export async function listAttrsByCategory(categoryId: string) {
  await ensureCategoryCanHoldAttrs(categoryId)
  const list = await Attr.find({ categoryId }).sort({ createdAt: 1 })
  return list.map(toAttrDTO)
}

// 在创建属性时使用，确保分类存在且是三级分类，并对属性名称和属性值进行清洗和校验。
export async function createAttr(categoryId: string, name: string, values: string[]) {
  await ensureCategoryCanHoldAttrs(categoryId)

  const cleanName = name.trim()
  if (!cleanName) {
    throw AppError.badRequest('属性名称不能为空')
  }
  const cleanValues = normalizeValues(values)
  if (cleanValues.length === 0) {
    throw AppError.badRequest('属性值不能为空')
  }
  assertValuesBoundary(cleanValues)

  try {
    const attr = await Attr.create({ categoryId, name: cleanName, values: cleanValues })
    return toAttrDTO(attr)
  } catch (err) {
    // 复合唯一索引（categoryId + name）冲突
    rethrowConflict(err, [null, '该分类下已存在同名属性'])
  }
}

// 更新走白名单：name（字符串）/ values（字符串数组），其余字段一律忽略
// name 与 values 的清洗规则与 create 完全对齐（trim / 去空 / 去重）
export async function updateAttr(id: string, updates: Record<string, unknown>) {
  const patch: Record<string, string | string[]> = {}

  const name = updates['name']
  if (name !== undefined) {
    if (typeof name !== 'string') {
      throw AppError.badRequest('属性名称格式不合法')
    }
    const cleanName = name.trim()
    if (!cleanName) {
      throw AppError.badRequest('属性名称不能为空')
    }
    patch['name'] = cleanName
  }

  const values = updates['values']
  if (values !== undefined) {
    if (!Array.isArray(values) || !values.every((v) => typeof v === 'string')) {
      throw AppError.badRequest('属性值必须为字符串数组')
    }
    const cleanValues = normalizeValues(values)
    if (cleanValues.length === 0) {
      throw AppError.badRequest('属性值不能为空')
    }
    assertValuesBoundary(cleanValues)
    patch['values'] = cleanValues
  }

  if (Object.keys(patch).length === 0) {
    throw AppError.badRequest('没有需要更新的字段')
  }

  const attr = await Attr.findByIdAndUpdate(id, patch, {
    returnDocument: 'after',
    runValidators: true,
  }).catch((err) => {
    // 改名撞上同分类已有属性名
    rethrowConflict(err, [null, '该分类下已存在同名属性'])
  })
  if (!attr) {
    throw AppError.notFound('属性不存在')
  }
  return toAttrDTO(attr)
}

export async function deleteAttr(id: string) {
  const attr = await Attr.findByIdAndDelete(id)
  if (!attr) {
    throw AppError.notFound('属性不存在')
  }
}
