import mongoose from 'mongoose'

// 基础销售属性字典
export interface IBaseSaleAttr {
  name: string
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
  },
  { timestamps: true },
)

export const BaseSaleAttr = mongoose.model<IBaseSaleAttr>('BaseSaleAttr', baseSaleAttrSchema)

export function toBaseSaleAttrDTO(saleAttr: IBaseSaleAttr & { _id: unknown }) {
  return { saleAttrId: String(saleAttr._id), name: saleAttr.name }
}
