// 数据大屏接口统一出口
import request, { type SilentConfig } from '@/utils/request'
import type { DashboardStats } from './type'

const BASE_URL = '/dashboard'

// 大屏聚合：一次返回全部面板数据（30s 轮询）
// config 透传：轮询时传 { silent: true } 走静默通道（失败只翻顶栏标记，不弹全局 toast）
export const getDashboardStats = (config?: SilentConfig) =>
  request.get<DashboardStats>(`${BASE_URL}/stats`, config)
