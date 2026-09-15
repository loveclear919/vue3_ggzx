import mongoose from 'mongoose'

export interface IBrand {
  name: string
  logoUrl: string
  createdAt: Date // timestamps: true 自动生成 —— 接口声明与运行时对齐（sort/未来 DTO 暴露都用得上）
  updatedAt: Date
}

const brandSchema = new mongoose.Schema<IBrand>(
  {
    name: {
      type: String,
      required: [true, '品牌名称不能为空'],
      unique: true,
      trim: true,
      maxlength: [30, '品牌名称不能超过 30 个字符'],
    },

    logoUrl: {
      type: String,
      default: '',
      trim: true,
    },
  },

  { timestamps: true },
)

export const Brand = mongoose.model<IBrand>('Brand', brandSchema)

// 对外返回的品牌数据 — _id 映射为 brandId
export function toBrandDTO(brand: IBrand & { _id: unknown }) {
  return {
    brandId: String(brand._id),
    name: brand.name,
    logoUrl: brand.logoUrl,
  }
}
