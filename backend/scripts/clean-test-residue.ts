// 边界测试残留清理：清掉任何一次 boundary-test.ts 运行（含失败中断的）留下的测试数据
// 用法：pnpm exec tsx scripts/clean-test-residue.ts
//
// 为什么需要它：boundary-test.ts 的 cleanup 按「本次运行的 suffix」搜索，且失败时 process.exit(1)
// 在 cleanup 之前 —— 失败中断的运行会把数据留在库里，后续成功运行也扫不到旧 suffix 的残留。
// 本脚本按「前缀」直连库清扫（边界测试* 的 SPU/属性/品牌 + boundary_ 用户），与 suffix 无关
import 'dotenv/config'
import mongoose from 'mongoose'
import { Spu } from '../src/models/Spu.js'
import { Sku } from '../src/models/Sku.js'
import { Attr } from '../src/models/Attr.js'
import { Brand } from '../src/models/Brand.js'
import { User } from '../src/models/User.js'
import { Role } from '../src/models/Role.js'
import { Permission } from '../src/models/Permission.js'

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI 未配置，请检查 backend/.env')
    process.exit(1)
  }
  await mongoose.connect(process.env.MONGODB_URI)

  // SKU 没有独立前缀，先反查所有边界测试 SPU 的 id，再按 spuId 清 SKU（层 6 的引用完整性同理）
  const spuIds = (
    await Spu.find({ name: /^边界测试/ })
      .select('_id')
      .lean()
  ).map((doc) => doc._id)
  const skuResult = await Sku.deleteMany({ spuId: { $in: spuIds } })
  const spuResult = await Spu.deleteMany({ _id: { $in: spuIds } })
  const attrResult = await Attr.deleteMany({ name: /^边界测试/ })
  const brandResult = await Brand.deleteMany({ name: /^边界测试/ })
  // 测试用户：boundary_ 用户名前缀 + 199123 手机号前缀（注册用户名自动生成，只能靠手机号定位）
  const userResult = await User.deleteMany({
    $or: [{ username: /^boundary/ }, { phone: /^199123/ }],
  })
  // 测试角色：brole_ 名前缀（先清用户再清角色，避免引用残留）
  const roleResult = await Role.deleteMany({ roleName: /^brole_/ })

  console.log(
    `✅ 残留清理完成：SPU ${spuResult.deletedCount}、SKU ${skuResult.deletedCount}、属性 ${attrResult.deletedCount}、品牌 ${brandResult.deletedCount}、用户 ${userResult.deletedCount}、角色 ${roleResult.deletedCount}`,
  )
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('❌ 残留清理失败:', err)
  process.exit(1)
})
