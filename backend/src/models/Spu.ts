import mongoose from 'mongoose'

// 图片
export interface ISpuImage {
  imageUrl: string
  imageName: string
}

// 属性
export interface ISpuAttr {
  attrName: string
  attrValue: string
}

// 销售属性
export interface ISpuSaleAttr {
  saleAttrName: string
  saleAttrValueList: string[]
}

export interface ISpu {
  name: string
  description: string
  brandId: mongoose.Types.ObjectId
  category3Id: mongoose.Types.ObjectId
  imageList: ISpuImage[]
  attrList: ISpuAttr[]
  saleAttrList: ISpuSaleAttr[]
  createdAt: Date
  updatedAt: Date
}

// service 的清洗/截断/报错文案都从这里取，改边界只改这一处
export const SPU_LIMITS = {
  NAME_LENGTH: 100,
  DESCRIPTION_LENGTH: 500,
  MAX_IMAGE_COUNT: 10,
  IMAGE_NAME_LENGTH: 100,
  MAX_ATTR_COUNT: 20,
  ATTR_NAME_LENGTH: 30,
  ATTR_VALUE_LENGTH: 200,
  MAX_SALE_ATTR_COUNT: 10,
  SALE_ATTR_NAME_LENGTH: 30,
  MAX_SALE_ATTR_VALUES: 20,
  SALE_ATTR_VALUE_LENGTH: 30,
} as const

// 子文档关闭 _id：图片/属性/销售属性都是「值对象」，不需要独立主键
const spuImageSchema = new mongoose.Schema<ISpuImage>(
  {
    imageUrl: { type: String, required: [true, '图片地址不能为空'], trim: true },
    imageName: {
      type: String,
      default: '',
      trim: true,
      maxlength: [
        SPU_LIMITS.IMAGE_NAME_LENGTH,
        `图片名称不能超过 ${SPU_LIMITS.IMAGE_NAME_LENGTH} 个字符`,
      ],
    },
  },
  { _id: false },
)

const spuAttrSchema = new mongoose.Schema<ISpuAttr>(
  {
    attrName: {
      type: String,
      required: [true, '属性名不能为空'],
      trim: true,
      maxlength: [
        SPU_LIMITS.ATTR_NAME_LENGTH,
        `属性名不能超过 ${SPU_LIMITS.ATTR_NAME_LENGTH} 个字符`,
      ],
    },
    attrValue: {
      type: String,
      default: '',
      trim: true,
      maxlength: [
        SPU_LIMITS.ATTR_VALUE_LENGTH,
        `属性值不能超过 ${SPU_LIMITS.ATTR_VALUE_LENGTH} 个字符`,
      ],
    },
  },
  { _id: false },
)

const spuSaleAttrSchema = new mongoose.Schema<ISpuSaleAttr>(
  {
    saleAttrName: {
      type: String,
      required: [true, '销售属性名不能为空'],
      trim: true,
      maxlength: [
        SPU_LIMITS.SALE_ATTR_NAME_LENGTH,
        `销售属性名不能超过 ${SPU_LIMITS.SALE_ATTR_NAME_LENGTH} 个字符`,
      ],
    },
    saleAttrValueList: {
      type: [String],
      default: [],
      // 与 Attr.values 同款防线：单个值长度 + 数量都在模型层兜底
      validate: {
        validator: (list: string[]) =>
          list.length <= SPU_LIMITS.MAX_SALE_ATTR_VALUES &&
          list.every((value) => value.length <= SPU_LIMITS.SALE_ATTR_VALUE_LENGTH),
        message: `销售属性值单个最长 ${SPU_LIMITS.SALE_ATTR_VALUE_LENGTH} 个字符，最多 ${SPU_LIMITS.MAX_SALE_ATTR_VALUES} 个`,
      },
    },
  },
  { _id: false },
)

const spuSchema = new mongoose.Schema<ISpu>(
  {
    name: {
      type: String,
      required: [true, 'SPU 名称不能为空'],
      unique: true,
      trim: true,
      maxlength: [SPU_LIMITS.NAME_LENGTH, `SPU 名称不能超过 ${SPU_LIMITS.NAME_LENGTH} 个字符`],
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: [
        SPU_LIMITS.DESCRIPTION_LENGTH,
        `SPU 描述不能超过 ${SPU_LIMITS.DESCRIPTION_LENGTH} 个字符`,
      ],
    },
    brandId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Brand',
      required: [true, '品牌不能为空'],
    },
    category3Id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, '三级分类不能为空'],
    },
    imageList: {
      type: [spuImageSchema],
      default: [],
      validate: {
        validator: (list: ISpuImage[]) => list.length <= SPU_LIMITS.MAX_IMAGE_COUNT,
        message: `图片最多 ${SPU_LIMITS.MAX_IMAGE_COUNT} 张`,
      },
    },
    attrList: {
      type: [spuAttrSchema],
      default: [],
      validate: {
        validator: (list: ISpuAttr[]) => list.length <= SPU_LIMITS.MAX_ATTR_COUNT,
        message: `平台属性最多 ${SPU_LIMITS.MAX_ATTR_COUNT} 个`,
      },
    },
    saleAttrList: {
      type: [spuSaleAttrSchema],
      default: [],
      validate: {
        validator: (list: ISpuSaleAttr[]) => list.length <= SPU_LIMITS.MAX_SALE_ATTR_COUNT,
        message: `销售属性最多 ${SPU_LIMITS.MAX_SALE_ATTR_COUNT} 个`,
      },
    },
  },
  { timestamps: true },
)

// 列表最常用「按三级分类查询」；name 的唯一性已由 unique 索引覆盖
spuSchema.index({ category3Id: 1 })

export const Spu = mongoose.model<ISpu>('Spu', spuSchema)

// 对外返回的 SPU 数据 —— _id / 引用字段统一 String()：线上本就是 JSON 序列化后的 hex 字符串，
// 这里显式转换让「DTO 类型 = 传输格式 = 前端契约（api/product/spu/type.ts 全为 string）」三者一致
export function toSpuDTO(spu: ISpu & { _id: unknown }) {
  return {
    spuId: String(spu._id),
    name: spu.name,
    description: spu.description,
    brandId: String(spu.brandId),
    category3Id: String(spu.category3Id),
    imageList: spu.imageList,
    attrList: spu.attrList,
    saleAttrList: spu.saleAttrList,
  }
}
