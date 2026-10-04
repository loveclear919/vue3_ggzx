// 基础销售属性种子：维度名按三级分类关联（通用维度全分类可用，特化维度仅对应分类）
// 用法：pnpm --filter backend run seed（依赖 seed-categories 已跑，按分类名解析 id）
// 幂等：按唯一键 name upsert，categoryIds 覆盖为基线；分类名配置 → 不存在则报错
import 'dotenv/config'
import mongoose from 'mongoose'
import { BaseSaleAttr } from '../src/models/BaseSaleAttr.js'
import { Category } from '../src/models/Category.js'

// 通用维度：所有分类的 SPU 表单都可见（颜色/版本/型号是跨品类属性）
const UNIVERSAL = ['颜色', '版本', '型号']

// 特化维度：只配给语义相符的三级分类（如「网络/套餐」属手机，「规格」属配件/家电）
const SCOPED: Record<string, string[]> = {
  智能手机: ['内存', '网络', '套餐'],
  老人机: ['套餐'],
  充电器: ['规格'],
  数据线: ['规格'],
  笔记本: ['内存', '套餐'],
  台式机: ['套餐'],
  键盘: [],
  鼠标: [],
  冰箱: ['规格'],
  空调: ['规格'],
  电风扇: [],
  加湿器: [],
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI 未配置，请检查 backend/.env')
    process.exit(1)
  }
  await mongoose.connect(process.env.MONGODB_URI)

  const categories = await Category.find({ level: 3 }).lean()
  const idByName = new Map(categories.map((c) => [c.name, c._id]))

  // 通用维度
  for (const name of UNIVERSAL) {
    await BaseSaleAttr.updateOne({ name }, { $set: { categoryIds: [] } }, { upsert: true })
  }

  // 特化维度：按分类名解析 id（配置里的分类必须存在于种子分类树）
  for (const [categoryName, names] of Object.entries(SCOPED)) {
    const categoryId = idByName.get(categoryName)
    if (!categoryId) {
      throw new Error(`三级分类不存在：${categoryName}（请先运行 seed-categories）`)
    }
    for (const name of names) {
      const exists = await BaseSaleAttr.findOne({ name }).lean()
      if (exists) {
        await BaseSaleAttr.updateOne({ name }, { $addToSet: { categoryIds: categoryId } })
      } else {
        await BaseSaleAttr.create({ name, categoryIds: [categoryId] })
      }
    }
  }

  // 收敛到配置基线：删除不在本次配置中的历史条目（如旧版全局「尺码」——空 categoryIds 会被当作通用维度，
  // 无法表达「无处可用」，只能移除。SPU 的维度名是字符串快照，删除字典条目不影响已有 SPU）
  const configured = new Set([...UNIVERSAL, ...Object.values(SCOPED).flat()])
  const removed = await BaseSaleAttr.deleteMany({ name: { $nin: [...configured] } })

  console.log(
    `✅ 销售属性字典就绪：通用 ${UNIVERSAL.length} 个，特化 ${Object.keys(SCOPED).length} 个分类已配置（清理残留 ${removed.deletedCount} 个）`,
  )
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('❌ 种子失败:', err)
  process.exit(1)
})
