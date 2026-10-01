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

// 401 去重标志：并发多请求同时 401（会话过期瞬间多个在途请求）只处理一次，
// 否则会叠 N 条 toast、且多次 push 竞态导致「URL 变了页面没切」
let isHandling401 = false

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

  async (error) => {
    // 后端返回的业务错误信息（HTTP 非 2xx 时藏在响应体里）
    const backendMsg = error.response?.data?.message

    if (error.response?.status === 401) {
      const url: string = error.config?.url ?? ''
      // 登录/注册自身的 401 是业务错误（密码错）不是会话过期：只弹文案，不做踢出
      if (url.startsWith('/auth/')) {
        ElMessage.error(backendMsg || '登录失败')
        return Promise.reject(error)
      }
      if (isHandling401) return Promise.reject(error)
      isHandling401 = true
      try {
        // 状态清理收口到 store 的 logout()（token + userInfo + 权限菜单），与守卫 401 分支同口径。
        // 动态 import 避免 request → stores/user → api/user → request 的静态循环引用
        const { useUserStore } = await import('@/stores/user')
        useUserStore().logout()
        ElMessage.error(backendMsg || '登录已过期，请重新登录')
        // 带 redirect：重新登录后回到原页面；replace 不让已失效页面留在历史栈
        const current = router.currentRoute.value
        const query = current.path === '/login' ? undefined : { redirect: current.fullPath }
        await router.replace({ path: '/login', query })
      } finally {
        isHandling401 = false
      }
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
