import type { NextFunction, Response } from 'express'
import type { AuthRequest } from './auth.js'
import { AppError } from '../utils/AppError.js'
import { getPermissionCodesForUser } from '../services/rbac.js'

// 权限中间件：任一 code 命中即放行（some 语义）。
// 只回答「能否调用此 API」（接口级粗粒度），不回答「能看多少数据」（数据级在 service 层裁剪，见 rbac-design §7）。
// 聚合结果挂 req.permissionCodes：controller 显式透传给 service（service 不读 req，undefined 按无特权 fail-closed）
export function requirePermission(...codes: string[]) {
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.userId) {
      throw AppError.unauthorized('未登录，请先登录')
    }
    // 获取权限树
    const userCodes = await getPermissionCodesForUser(req.userId)
    req.permissionCodes = userCodes
    if (codes.some((c) => userCodes.has(c))) return next()
    throw AppError.forbidden('没有操作权限')
  }
}
