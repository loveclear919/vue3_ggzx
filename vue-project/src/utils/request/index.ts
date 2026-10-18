import axios, { type AxiosRequestConfig } from 'axios'
import { TOKEN_KEY } from '@/utils/storage'
import { handleUnauthorized, handleForbidden, handleGeneric } from './errorHandlers'
import type { SilentConfig } from './type'

export type { SilentConfig } from './type'

// 拦截器保持薄壳：请求侧只加 token；响应侧只做信封解包与「status → handler」分发。
// 各状态码的应用级响应（401 会话清理 / 403 权限自愈 / 通用提示）见 errorHandlers.ts

const request = axios.create({
  baseURL: import.meta.env.VITE_APP_BASE_API,
  timeout: 10000,
})

// 请求拦截器
request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(TOKEN_KEY)

    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`)
    }

    return config
  },
  (error) => Promise.reject(error),
)

// 响应拦截器
request.interceptors.response.use(
  (response) => {
    const res = response.data

    if (res.code === 200) {
      return res.data
    }

    if (!(response.config as SilentConfig).silent) {
      ElMessage.error(res.message || '请求失败')
    }

    return Promise.reject(new Error(res.message || '请求失败'))
  },

  async (error) => {
    const status = error.response?.status
    if (status === 401) await handleUnauthorized(error)
    else if (status === 403) await handleForbidden(error)
    else handleGeneric(error)

    return Promise.reject(error)
  },
)

// HTTP 封装
const http = {
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return request.get(url, config) as Promise<T>
  },

  post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return request.post(url, data, config) as Promise<T>
  },

  put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return request.put(url, data, config) as Promise<T>
  },

  patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return request.patch(url, data, config) as Promise<T>
  },

  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return request.delete(url, config) as Promise<T>
  },
}

export default http
