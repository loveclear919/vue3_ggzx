// 商品三级分类种子数据
// 用法：pnpm --filter backend run seed（幂等：按自然键 upsert，_id 稳定，可重复执行）
import 'dotenv/config'
import mongoose from 'mongoose'
import { Category } from '../src/models/Category.js'

const SEED_DATA = [
  {
    name: '手机数码',
    children: [
      { name: '手机通讯', children: ['智能手机', '老人机'] },
      { name: '手机配件', children: ['充电器', '数据线'] },
    ],
  },
  {
    name: '电脑办公',
    children: [
      { name: '电脑整机', children: ['笔记本', '台式机'] },
      { name: '外设产品', children: ['键盘', '鼠标'] },
    ],
  },
  {
    name: '家用电器',
    children: [
      { name: '大家电', children: ['冰箱', '空调'] },
      { name: '生活电器', children: ['电风扇', '加湿器'] },
    ],
  },
]

// 按「同级 + 同名 + 同父」的自然键 upsert —— 分类 _id 保持稳定，
// 重跑种子不会让已引用 categoryId 的属性/商品变成孤儿（deleteMany 重建会让 _id 全部换新）
async function upsertCategory(
  level: 1 | 2 | 3,
  name: string,
  parentId: mongoose.Types.ObjectId | null,
) {
  return Category.findOneAndUpdate(
    { level, name, parentId },
    { $set: { level, name, parentId } },
    { upsert: true, returnDocument: 'after' },
  )
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI 未配置，请检查 backend/.env')
    process.exit(1)
  }

  await mongoose.connect(process.env.MONGODB_URI)

  let count = 0
  for (const level1 of SEED_DATA) {
    const c1 = await upsertCategory(1, level1.name, null)
    count++
    for (const level2 of level1.children) {
      const c2 = await upsertCategory(2, level2.name, c1._id)
      count++
      for (const level3 of level2.children) {
        await upsertCategory(3, level3, c2._id)
        count++
      }
    }
  }
  console.log(`✅ 种子写入完成，共 ${count} 条分类数据`)
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('❌ 种子写入失败:', err)
  process.exit(1)
})
