import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { connectDB } from './config/db.js'
import { errorHandler } from './middlewares/errorHandler.js'
import { limiter } from './middlewares/rateLimiter.js'
import { AppError } from './utils/AppError.js'
import { UPLOAD_DIR } from './utils/upload.js'
import { Role } from './models/Role.js'
import helmet from 'helmet'

const app = express()
const PORT = process.env.PORT || 3000

// helmet
app.use(helmet())

// 中间件
app.use(cors())
app.use(express.json({ limit: '1mb' }))

// 限流
app.use('/api/auth', limiter)

// 路由
app.use('/api/auth', (await import('./routes/auth.js')).default)
app.use('/api/user', (await import('./routes/user.js')).default)
app.use('/api/role', (await import('./routes/role.js')).default)
app.use('/api/permission', (await import('./routes/permission.js')).default)
app.use('/api/brand', (await import('./routes/brand.js')).default)
app.use('/api/category', (await import('./routes/category.js')).default)
app.use('/api/attr', (await import('./routes/attr.js')).default)
app.use('/api/base-sale-attr', (await import('./routes/baseSaleAttr.js')).default)
app.use('/api/spu', (await import('./routes/spu.js')).default)
app.use('/api/sku', (await import('./routes/sku.js')).default)
app.use('/api/upload', (await import('./routes/upload.js')).default)

// 上传文件的静态访问：/uploads/xxx.jpg（生产环境建议交给 nginx / 对象存储）
// UPLOAD_DIR 与 upload.ts 共用同一锚定路径，杜绝「建在 A 处、找 B 处」的漂移
app.use('/uploads', express.static(UPLOAD_DIR))

// 404 ：未匹配任何路由，统一返回 JSON 而不是 Express 默认的 HTML
app.use((_req, _res, next) => next(AppError.notFound()))

// 错误处理
app.use(errorHandler)

// 启动
async function start() {
  try {
    await connectDB()

    // RBAC 前置断言：内置角色缺失时特权保护全部静默失效，warn 提示不阻断启动
    const builtin = await Role.exists({ builtin: true })
    if (!builtin) {
      console.warn('⚠️  未找到内置角色（builtin），特权保护未生效 —— 请运行 pnpm run seed:admin')
    }

    app.listen(PORT, () => {
      console.log(`服务已启动: http://localhost:${PORT}`)
    })
  } catch (error) {
    console.error('❌ 服务启动失败:', error)
    process.exit(1)
  }
}

start()
