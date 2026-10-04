// 价格带分档纯函数（dashboard 聚合与边界测试共用，design/dashboard-design.md §4.1 分桶定案）
// 语义约定：档位标签是「下闭上开」区间 —— price < 10000分(¥100) 落入「0-100元」，
// price = 10000分(¥100) 落入「100-500元」。即每个标签的下界（首档除外）是闭的、上界是开的。
// 历史坑：旧实现用 `price <= 上界`，导致 ¥100/¥500/¥2000 这些整点价整体错开一档、与标签不符。
// 未定价（price = 0）单列一档，不做二次换算（I11 业务叙事的可视化来源）

export const PRICE_BAND_LABELS = [
  '未定价',
  '0-100元',
  '100-500元',
  '500-2000元',
  '2000-5000元',
  '5000-10000元',
  '10000元以上',
] as const

// 各档上界（分），与 PRICE_BAND_LABELS[1..] 一一对应，判定用严格小于（下闭上开）
const BAND_UPPER_LIMITS = [10000, 50000, 200000, 500000, 1000000] as const

export function bucketPrice(priceInCents: number): string {
  if (!(priceInCents > 0)) return PRICE_BAND_LABELS[0]
  for (let i = 0; i < BAND_UPPER_LIMITS.length; i++) {
    if (priceInCents < BAND_UPPER_LIMITS[i]!) return PRICE_BAND_LABELS[i + 1]!
  }
  return PRICE_BAND_LABELS[PRICE_BAND_LABELS.length - 1]!
}

// 生成 dashboard 聚合时的初始计数 Map：label → 0。
// 用 Map 而非数组 + find()，是为了让「逐条累加」变成 O(1) 单次查表（旧实现每 SKU 扫 7 档）。
export function emptyBandCounts(): Map<string, number> {
  return new Map(PRICE_BAND_LABELS.map((label) => [label, 0]))
}
