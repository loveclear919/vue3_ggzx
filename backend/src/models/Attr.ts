import mongoose from 'mongoose'

// 平台属性：归属于某个三级分类，带可选属性值列表（如 颜色 → [红色, 蓝色]）
export interface IAttr {
  name: string
  categoryId: mongoose.Types.ObjectId
  values: string[]
  createdAt: Date
  updatedAt: Date
}

// 本模块的数字边界总表 —— 唯一来源：模型 validator 与 service 的校验/文案共用，
// 改边界只改这一处（此前 service 里还有一份副本，靠注释"与模型对齐"约束，已收口）
export const ATTR_LIMITS = {
  NAME_LENGTH: 30,
  MAX_VALUES_COUNT: 20,
  VALUE_LENGTH: 30,
} as const

const attrSchema = new mongoose.Schema<IAttr>(
  {
    name: {
      type: String,
      required: [true, '属性名称不能为空'],
      trim: true,
      maxlength: [ATTR_LIMITS.NAME_LENGTH, `属性名称不能超过 ${ATTR_LIMITS.NAME_LENGTH} 个字符`],
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, '所属分类不能为空'],
    },
    values: {
      type: [String],
      default: [],
      // 边界防线：单个值最长 30 字符、最多 20 个值
      validate: {
        validator: (arr: string[]) =>
          arr.length <= ATTR_LIMITS.MAX_VALUES_COUNT &&
          arr.every((v) => v.length <= ATTR_LIMITS.VALUE_LENGTH),
        message: `属性值单个最长 ${ATTR_LIMITS.VALUE_LENGTH} 个字符，最多 ${ATTR_LIMITS.MAX_VALUES_COUNT} 个`,
      },
    },
  },
  { timestamps: true },
)

// 复合唯一索引：同一分类下属性名唯一（冲突走 11000 → isDuplicateKeyError → 409）
attrSchema.index({ categoryId: 1, name: 1 }, { unique: true })

export const Attr = mongoose.model<IAttr>('Attr', attrSchema)

// 对外返回的属性数据 — _id 映射为 attrId（String()：DTO 类型与传输格式、前端契约三者一致）
export function toAttrDTO(attr: IAttr & { _id: unknown }) {
  return {
    attrId: String(attr._id),
    name: attr.name,
    categoryId: String(attr.categoryId),
    values: attr.values,
  }
}
