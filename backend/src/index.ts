import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { connectDB } from './config/db.js'
import { errorHandler } from './middlewares/errorHandler.js'
import { limiter } from './middlewares/rateLimiter.js'
import { AppError } from './utils/AppError.js'
import helmet from 'helmet'

const app = express()
const PORT = process.env.PORT || 3000

// helmet
app.use(helmet())

// 中间件
app.use(cors())
app.use(express.json())

// 限流
app.use('/api/auth', limiter)

// 路由
app.use('/api/auth', (await import('./routes/auth.js')).default)
app.use('/api/user', (await import('./routes/user.js')).default)

// 404 ：未匹配任何路由，统一返回 JSON 而不是 Express 默认的 HTML
app.use((_req, _res, next) => next(AppError.notFound()))

// 错误处理
app.use(errorHandler)

// 启动
async function start() {
  try {
    await connectDB()

    app.listen(PORT, () => {
      console.log(`服务已启动: http://localhost:${PORT}`)
    })
  } catch (error) {
    console.error('❌ 服务启动失败:', error)
    process.exit(1)
  }
}

start()
