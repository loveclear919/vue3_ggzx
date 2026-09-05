import type { Request, Response } from 'express'
import { AppError } from '../utils/AppError.js'
import { ok } from '../utils/respond.js'

// 处理层：文件上传
// 注意两段式设计：multer 中间件已把文件本体写入磁盘（backend/uploads/），这里只返回访问路径字符串。
// 数据库不存文件，只存这个 URL 字符串 —— 由品牌创建/更新接口随表单提交时才入库（Brand.logoUrl）
export function uploadFile(req: Request, res: Response) {
  const file = req.file
  if (!file) {
    throw AppError.badRequest('未接收到文件')
  }

  ok(res, { url: `/uploads/${file.filename}` }, '上传成功')
}
