import type { SpuAttr } from '@/api/product/spu/type'

// SPU 表单内部类型：平台属性行额外带 valueOptions
export interface SpuAttrForm extends SpuAttr {
  valueOptions: string[]
}
