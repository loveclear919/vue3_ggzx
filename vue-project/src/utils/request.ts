import axios, { type AxiosRequestConfig } from 'axios'
import router from '@/router'
import { TOKEN_KEY } from '@/utils/storage'

// ElMessage 由 unplugin-auto-import 按需注入（含样式），无需手动导入

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

    ElMessage.error(res.message || '请求失败')

    return Promise.reject(new Error(res.message || '请求失败'))
  },

  (error) => {
    // 后端返回的业务错误信息（HTTP 非 2xx 时藏在响应体里）
    const backendMsg = error.response?.data?.message

    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      ElMessage.error(backendMsg || '登录已过期，请重新登录')
      router.push('/login')
    } else {
      // 优先显示后端信息，没有才是网络/超时类错误
      ElMessage.error(backendMsg || error.message || '网络错误')
    }

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
