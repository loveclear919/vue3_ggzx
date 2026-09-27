// SKU 边界常量 —— 与后端 models/Sku.ts 的 SKU_LIMITS 键名完全一致、值必须相等
// 只镜像前端真正会拦截的键（与 SPU 模块同一取舍）：MAX_DIMENSIONS 无前端入口
// （维度来自 SPU 快照）不镜像；真正的兜底永远在后端，前端只是提前告知
export const SKU_LIMITS = {
  NAME_LENGTH: 100, // skuName 上限（改名输入框 maxlength）
  DESC_LENGTH: 500, // skuDesc 上限（编辑弹窗 maxlength）
  PRICE_MAX: 999999900, // 价格上限（分）
  WEIGHT_MAX: 999999, // 重量上限（克）
  STOCK_MAX: 999999, // 库存上限
  MAX_COMBINATIONS: 200, // 单 SPU 组合数上限（生成表单先算乘积数拦截）
} as const
