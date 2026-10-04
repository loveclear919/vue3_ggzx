import mongoose from 'mongoose'

// 基础销售属性字典（维度名按三级分类关联：手机有「网络/套餐」，空调没有）
export interface IBaseSaleAttr {
  name: string
  // 允许使用该维度的三级分类；空数组 = 通用维度（所有分类可用）
  categoryIds: mongoose.Types.ObjectId[]
  createdAt: Date
  updatedAt: Date
}

const baseSaleAttrSchema = new mongoose.Schema<IBaseSaleAttr>(
  {
    name: {
      type: String,
      required: [true, '销售属性名不能为空'],
      unique: true,
      trim: true,
      maxlength: [30, '销售属性名不能超过 30 个字符'],
    },
    categoryIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Category',
      default: [],
    },
  },
  { timestamps: true },
)

export const BaseSaleAttr = mongoose.model<IBaseSaleAttr>('BaseSaleAttr', baseSaleAttrSchema)

export function toBaseSaleAttrDTO(saleAttr: IBaseSaleAttr & { _id: unknown }) {
  return { saleAttrId: String(saleAttr._id), name: saleAttr.name }
}
