import multer from 'multer'
import path from 'node:path'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { AppError } from './AppError.js'

// 允许的图片类型（白名单）
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
// 扩展名由「已通过白名单校验的 MIME」映射而来，绝不取用户原始文件名：
// 否则攻击者可伪造 mime 拿到 .html 等扩展名，借静态服务的 Content-Type 制造 XSS
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
}
// 单张图片大小上限：2MB
const MAX_SIZE = 2 * 1024 * 1024

// 上传目录锚定代码位置（backend/uploads）
export const UPLOAD_DIR = path.resolve(import.meta.dirname, '../../uploads')

// 确保上传目录存在（multer 不会自动创建）
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

// 文件名随机化
const storage = multer.diskStorage({
  // 决定文件保存在哪个文件夹
  destination: UPLOAD_DIR,
  // 文件名
  filename: (_req, file, cb) => {
    const ext = MIME_TO_EXT[file.mimetype]
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`)
  },
})

export const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true)
    } else {
      // cb(错误) 会把错误传给错误处理中间件，最终返回统一 400 信封
      cb(AppError.badRequest('仅支持 jpg/png/webp/gif 格式的图片'))
    }
  },
})
