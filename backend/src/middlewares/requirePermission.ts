import type { NextFunction, Response } from 'express'
import type { AuthRequest } from './auth.js'
import { AppError } from '../utils/AppError.js'
import { getPermsForUser } from '../services/rbac.js'

// 权限中间件：任一 perms 命中即放行（some 语义）。
// 只回答「能否调用此 API」（接口级粗粒度），不回答「能看多少数据」（数据级在 service 层裁剪，见 rbac-design §7）。
// 聚合结果挂 req.permissionPerms：controller 显式透传给 service（service 不读 req，undefined 按无特权 fail-closed）
export function requirePermission(...perms: string[]) {
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.userId) {
      throw AppError.unauthorized('未登录，请先登录')
    }
    // 每请求实时聚合：权限变更（角色被改/权限被收回）下一个请求立即生效，无缓存失效问题
    const userPerms = await getPermsForUser(req.userId)
    req.permissionPerms = userPerms
    if (perms.some((p) => userPerms.has(p))) return next()
    throw AppError.forbidden('没有操作权限')
  }
}
