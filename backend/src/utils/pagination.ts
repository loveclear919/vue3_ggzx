// 分页参数收口：缺失/非法/越界统一 clamp；作为共享工具自保 NaN/Infinity ——
// Math.max(1, NaN) 会返回 NaN，新调用方漏挡时会直接漏进 skip/limit
export function normalizePage(page: number, pageSize: number) {
  const safePage = Math.max(1, Math.floor(Number.isFinite(page) ? page : 1))
  const safePageSize = Math.min(
    100,
    Math.max(1, Math.floor(Number.isFinite(pageSize) ? pageSize : 10)),
  )
  return { page: safePage, pageSize: safePageSize }
}
