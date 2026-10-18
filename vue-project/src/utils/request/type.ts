import type { AxiosRequestConfig } from 'axios'

export type SilentConfig = AxiosRequestConfig & { silent?: boolean }
