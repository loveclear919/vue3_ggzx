import mongoose from 'mongoose'

export async function connectDB() {
  const uri = process.env.MONGODB_URI

  if (!uri) {
    console.error('❌ MONGODB_URI 未配置，请检查 .env 文件')
    process.exit(1)
  }

  try {
    await mongoose.connect(uri)
    console.log('✅ MongoDB 连接成功')
  } catch (error) {
    console.error('❌ MongoDB 连接失败:', error)
    process.exit(1)
  }
}
