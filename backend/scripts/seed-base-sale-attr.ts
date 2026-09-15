// 基础销售属性种子数据（SPU 添加销售属性时的维度下拉来源）
// 幂等：按唯一键 name upsert，可重复执行
import 'dotenv/config'
import mongoose from 'mongoose'
import { BaseSaleAttr } from '../src/models/BaseSaleAttr.js'

const SEED_SALE_ATTRS = ['颜色', '版本', '内存', '尺码', '型号', '规格', '网络', '套餐']

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI 未配置，请检查 backend/.env')
    process.exit(1)
  }

  await mongoose.connect(process.env.MONGODB_URI)

  let count = 0
  for (const name of SEED_SALE_ATTRS) {
    await BaseSaleAttr.findOneAndUpdate(
      { name },
      { $set: { name } },
      { upsert: true, returnDocument: 'after' },
    )
    count++
  }

  console.log(`✅ 基础销售属性种子完成：${count} 条`)
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('❌ 种子写入失败:', err)
  process.exit(1)
})
