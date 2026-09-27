// 索引对齐脚本：把库里的实际索引同步为 schema 的声明（建缺失的 + 删 schema 已移除的）
// 用法：pnpm --filter backend run sync:indexes
//
// 为什么需要它：mongoose 的 autoIndex 只"增"不"删"。schema 里改/删索引定义后，库里旧索引会静默留着——
// 典型危害是把单字段唯一索引改成复合唯一索引时，旧的唯一约束仍在拦写入（且没有任何报错提示）。
// 被清空/重建库时才需要跑（本地、CI、生产迁移），不要挂在应用启动流程里：syncIndexes 会 DROP 索引
import 'dotenv/config'
import mongoose from 'mongoose'
import { Category } from '../src/models/Category.js'
import { Attr } from '../src/models/Attr.js'
import { Brand } from '../src/models/Brand.js'
import { Spu } from '../src/models/Spu.js'
import { Sku } from '../src/models/Sku.js'
import { BaseSaleAttr } from '../src/models/BaseSaleAttr.js'
import { User } from '../src/models/User.js'
import { Role } from '../src/models/Role.js'
import { Permission } from '../src/models/Permission.js'

const COLLECTIONS = [
  ['Category', Category],
  ['Attr', Attr],
  ['Brand', Brand],
  ['Spu', Spu],
  ['Sku', Sku],
  ['BaseSaleAttr', BaseSaleAttr],
  ['User', User],
  ['Role', Role],
  ['Permission', Permission],
] as const

async function indexNames(model: (typeof COLLECTIONS)[number][1]) {
  return (await model.collection.indexes()).map((index) => index.name)
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI 未配置，请检查 backend/.env')
    process.exit(1)
  }
  await mongoose.connect(process.env.MONGODB_URI)

  let changed = 0
  for (const [name, model] of COLLECTIONS) {
    const before = await indexNames(model)
    await model.syncIndexes() // 建 schema 声明但库里缺失的，删库里存在但 schema 未声明的
    const after = await indexNames(model)

    const added = after.filter((index) => !before.includes(index))
    const removed = before.filter((index) => !after.includes(index))
    if (added.length === 0 && removed.length === 0) {
      console.log(`✅ ${name}: 无变化（${after.join(', ')}）`)
      continue
    }
    changed++
    console.log(
      `🔄 ${name}: ${added.length ? `+${added.join(' +')}` : ''} ${removed.length ? `-${removed.join(' -')}` : ''}`,
    )
  }

  console.log(
    changed === 0 ? '\n索引已与 schema 一致，无需变更' : `\n共 ${changed} 个集合的索引已对齐`,
  )
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('❌ 索引同步失败:', err)
  process.exit(1)
})
