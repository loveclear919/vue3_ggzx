// MongoDB 错误码识别工具

/** Mongo 唯一索引冲突（重复键）错误 —— 错误码固定为 11000 */
export function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: number }).code === 11000
  )
}
