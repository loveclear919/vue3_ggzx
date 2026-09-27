// 金额换算工具：后端 price 以「分」为单位的整数存储，前端输入/展示以「元」为准
// 换算禁止浮点直乘（19.99 * 100 = 1998.9999…，边界会差 1 分），一律走字符串解析

// 元字符串 → 分整数；非法输入（>2 位小数、负数、科学计数法、空串）返回 null，由调用方决定提示文案
export function yuanToCents(input: string): number | null {
  const yuan = input.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(yuan)) return null
  const [intPart, decPart = ''] = yuan.split('.')
  // 整数部分 × 100 与小数部分补足两位后相加，全程整数运算
  return Number(intPart) * 100 + Number(decPart.padEnd(2, '0'))
}

// 分整数 → 元字符串（仅用于展示，不参与回算）
export function centsToYuan(cents: number): string {
  return (cents / 100).toFixed(2)
}
