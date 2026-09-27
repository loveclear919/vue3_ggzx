export const SPU_LIMITS = {
  NAME_LENGTH: 100, // SPU 名称长度（校验规则与输入框 maxlength 共用）
  DESCRIPTION_LENGTH: 500, // SPU 描述长度
  MAX_IMAGE_COUNT: 10, // 一个 SPU 最多几张图片
  ATTR_VALUE_LENGTH: 200, // 单个平台属性值长度
  MAX_SALE_ATTR_COUNT: 10, // 销售属性（维度）行数上限
  MAX_SALE_ATTR_VALUES: 20, // 单个销售属性最多几个属性值
  SALE_ATTR_VALUE_LENGTH: 30, // 单个销售属性值长度
} as const
