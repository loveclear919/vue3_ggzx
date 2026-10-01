import { AppError } from './AppError.js'

// 路径参数 id 的统一收窄：Express 5 将 params 标为 string | string[]（同名参数可重复），
// 7 个 controller 共 15 处重复「存在性 + 非数组」检查，收口于此（message 由调用方给出，保持各接口文案不变）
export function getParamId(
  req: { params: Record<string, string | string[]> },
  message: string,
): string {
  const id = req.params.id
  if (!id || Array.isArray(id)) {
    throw AppError.badRequest(message)
  }
  return id
}
