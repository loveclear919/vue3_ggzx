// 文件上传接口
import request from '@/utils/request'

enum Api {
  UPLOAD = '/upload',
}

// 上传返回数据（响应拦截器已剥信封）
export interface UploadResponse {
  url: string
}

// 上传图片：FormData 直接交给 axios，Content-Type 会由浏览器自动生成
export const uploadFile = (data: FormData) => request.post<UploadResponse>(Api.UPLOAD, data)
