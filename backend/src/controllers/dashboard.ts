import type { Request, Response } from 'express'
import { ok } from '../utils/respond.js'
import { getDashboardStats } from '../services/dashboard.js'

// 处理层：数据大屏聚合
export async function getStats(_req: Request, res: Response) {
  const data = await getDashboardStats()
  ok(res, data)
}
