import mongoose from 'mongoose'

// 平台属性：归属于某个三级分类，带可选属性值列表（如 颜色 → [红色, 蓝色]）
export interface IAttr {
  name: string
  categoryId: mongoose.Types.ObjectId
  values: string[]
  createdAt: Date
  updatedAt: Date
}

const attrSchema = new mongoose.Schema<IAttr>(
  {
    name: {
      type: String,
      required: [true, '属性名称不能为空'],
      trim: true,
      maxlength: [30, '属性名称不能超过 30 个字符'],
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
        validator: (arr: string[]) => arr.length <= 20 && arr.every((v) => v.length <= 30),
        message: '属性值单个最长 30 个字符，最多 20 个',
      },
    },
  },
  { timestamps: true },
)

// 复合唯一索引：同一分类下属性名唯一（冲突走 11000 → isDuplicateKeyError → 409）
attrSchema.index({ categoryId: 1, name: 1 }, { unique: true })

export const Attr = mongoose.model<IAttr>('Attr', attrSchema)

// 对外返回的属性数据 — _id 映射为 attrId
export function toAttrDTO(attr: IAttr & { _id: unknown }) {
  return {
    attrId: attr._id,
    name: attr.name,
    categoryId: attr.categoryId,
    values: attr.values,
  }
}
