// MongoDB 错误码识别工具
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
