import { AppError } from './AppError.js'

// MongoDB 错误码识别 + 唯一索引冲突转译
export function isDuplicateKeyError(err: unknown, key?: string): boolean {
  if (typeof err !== 'object' || err === null) {
    return false
  }
  const e = err as {
    code?: number
    keyPattern?: Record<string, unknown>
    writeErrors?: Array<{
      err?: { code?: number; keyPattern?: Record<string, unknown> }
      code?: number
    }>
  }
  const is11000 = (code?: number) => code === 11000
  const isTarget = (keyPattern?: Record<string, unknown>) =>
    key === undefined || !!keyPattern?.[key]
  if (e.code === 11000) {
    return isTarget(e.keyPattern)
  }
  return (
    Array.isArray(e.writeErrors) &&
    e.writeErrors.some((w) => is11000(w?.err?.code ?? w?.code) && isTarget(w?.err?.keyPattern))
  )
}

// 唯一索引冲突的「分派 + 转译」收口（service 层 catch 的标准尾段）：
// 依序匹配 branches（[索引键 | null, 文案]），命中即抛 409（null = 不区分键，任意唯一索引冲突）；
// 全不中则原样抛出。多分支场景（如 permission 的 code / sortIndex 两种冲突给不同文案）用多组参数。
// 带重试/自定义分支的 catch（如 createUser 的用户名重试循环）不套本函数，保留原状
export function rethrowConflict(
  err: unknown,
  ...branches: Array<[key: string | null, message: string]>
): never {
  for (const [key, message] of branches) {
    if (isDuplicateKeyError(err, key ?? undefined)) {
      throw AppError.conflict(message)
    }
  }
  throw err
}
