import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { connectDB } from './config/db.js'
import { errorHandler } from './middlewares/errorHandler.js'

const app = express()
const PORT = process.env.PORT || 3000

// 中间件
app.use(cors())
app.use(express.json())

// 路由
app.use('/api/auth', (await import('./routes/auth.js')).default)
app.use('/api/user', (await import('./routes/user.js')).default)


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
