import type { SpuAttr } from '@/api/product/spu/type'

// SPU 表单内部类型：平台属性行额外带 valueOptions（属性管理定义的候选值，仅作下拉候选，不随 payload 提交）
export interface SpuAttrForm extends SpuAttr {
  valueOptions: string[]
}
