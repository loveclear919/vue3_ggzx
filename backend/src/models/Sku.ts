import mongoose from 'mongoose'
import { SPU_LIMITS } from './Spu.js'

// SKU（可下单的最小库存单位）：SPU 的销售属性各取一个值形成组合，承载价格/库存/上下架
export interface ISkuSaleAttrValue {
  saleAttrName: string
  saleAttrValue: string
}

export interface ISku {
  spuId: mongoose.Types.ObjectId
  category3Id: mongoose.Types.ObjectId
  skuName: string
  price: number // 单位：分（前端输入元、字符串换算后提交，见 docs/design/sku-design.md §3.3）
  weight: number // 单位：克
  stock: number // 仅存数值，不做扣减（交易域留待将来）
  skuDesc: string
  skuDefaultImg: string
  skuSaleAttrValueList: ISkuSaleAttrValue[] // 组合快照（文本，与 SPU 侧同款快照语义）
  combinationKey: string // 服务端生成的确定性组合键（sha256 hex），见 services/sku.ts
  sortIndex: number // 笛卡尔积枚举序号（生成时写入），列表按它排 = 自然组合序
  isSale: boolean
  createdAt: Date
  updatedAt: Date
}

// 本模块的数字边界总表
export const SKU_LIMITS = {
  NAME_LENGTH: 100,
  DESC_LENGTH: 500,
  PRICE_MAX: 999999900, // 分（= 9,999,999 元）
  WEIGHT_MAX: 999999, // 克
  STOCK_MAX: 999999,
  MAX_DIMENSIONS: 10, // 组合维度数（与 SPU MAX_SALE_ATTR_COUNT 对齐）
  MAX_COMBINATIONS: 200, // 单 SPU 组合数上限
} as const

// 组合值快照：值对象，无独立主键；单值长度边界与 SPU 的销售属性值共用同一来源（值本就来自 SPU 快照）
const skuSaleAttrValueSchema = new mongoose.Schema<ISkuSaleAttrValue>(
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
    saleAttrValue: {
      type: String,
      required: [true, '销售属性值不能为空'],
      trim: true,
      maxlength: [
        SPU_LIMITS.SALE_ATTR_VALUE_LENGTH,
        `销售属性值不能超过 ${SPU_LIMITS.SALE_ATTR_VALUE_LENGTH} 个字符`,
      ],
    },
  },
  { _id: false },
)

const skuSchema = new mongoose.Schema<ISku>(
  {
    spuId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Spu',
      required: [true, 'SPU 不能为空'],
    },
    category3Id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, '三级分类不能为空'],
    },
    skuName: {
      type: String,
      required: [true, 'SKU 名称不能为空'],
      trim: true,
      maxlength: [SKU_LIMITS.NAME_LENGTH, `SKU 名称不能超过 ${SKU_LIMITS.NAME_LENGTH} 个字符`],
    },
    price: {
      type: Number,
      required: [true, '价格不能为空'],
      min: [0, '价格不能为负'],
      max: [SKU_LIMITS.PRICE_MAX, `价格不能超过 ${SKU_LIMITS.PRICE_MAX} 分`],
      validate: { validator: Number.isInteger, message: '价格必须为整数（单位：分）' },
    },
    weight: {
      type: Number,
      required: [true, '重量不能为空'],
      min: [0, '重量不能为负'],
      max: [SKU_LIMITS.WEIGHT_MAX, `重量不能超过 ${SKU_LIMITS.WEIGHT_MAX} 克`],
      validate: { validator: Number.isInteger, message: '重量必须为整数（单位：克）' },
    },
    stock: {
      type: Number,
      required: [true, '库存不能为空'],
      min: [0, '库存不能为负'],
      max: [SKU_LIMITS.STOCK_MAX, `库存不能超过 ${SKU_LIMITS.STOCK_MAX}`],
      validate: { validator: Number.isInteger, message: '库存必须为整数' },
    },
    skuDesc: {
      type: String,
      default: '',
      trim: true,
      maxlength: [SKU_LIMITS.DESC_LENGTH, `SKU 描述不能超过 ${SKU_LIMITS.DESC_LENGTH} 个字符`],
    },
    skuDefaultImg: { type: String, default: '', trim: true }, // 为空时前端展示回退 SPU 首图
    skuSaleAttrValueList: {
      type: [skuSaleAttrValueSchema],
      default: [],
      validate: {
        validator: (list: ISkuSaleAttrValue[]) => list.length <= SKU_LIMITS.MAX_DIMENSIONS,
        message: `销售属性最多 ${SKU_LIMITS.MAX_DIMENSIONS} 个维度`,
      },
    },
    combinationKey: {
      type: String,
      required: [true, '组合键不能为空'],
      maxlength: [64, '组合键格式不合法'],
    },
    isSale: { type: Boolean, default: false }, // 生成 ≠ 上架：默认下架，显式 PATCH 上架
    // 笛卡尔积枚举序号（生成时写入）：列表按它排 = 自然组合序；同一 SPU 内唯一 → 排序键稳定（P2）
    sortIndex: {
      type: Number,
      required: [true, '排序序号不能为空'],
      min: [0, '排序序号不能为负'],
    },
  },
  { timestamps: true },
)

// 同一 SPU 下组合唯一：交给数据库索引（先查后写有并发竞态窗口），11000 → 409；
// 复合索引前缀即 spuId，「按 SPU 查列表」无需额外单字段索引
skuSchema.index({ spuId: 1, combinationKey: 1 }, { unique: true })
// 列表主查询索引：按枚举序展示（sortIndex 生成时写入、同 SPU 内唯一）
skuSchema.index({ spuId: 1, sortIndex: 1 })

export const Sku = mongoose.model<ISku>('Sku', skuSchema)

export function toSkuDTO(sku: ISku & { _id: unknown }) {
  return {
    skuId: String(sku._id),
    spuId: String(sku.spuId),
    category3Id: String(sku.category3Id),
    skuName: sku.skuName,
    price: sku.price,
    weight: sku.weight,
    stock: sku.stock,
    skuDesc: sku.skuDesc,
    skuDefaultImg: sku.skuDefaultImg,
    skuSaleAttrValueList: sku.skuSaleAttrValueList,
    isSale: sku.isSale,
  }
}
