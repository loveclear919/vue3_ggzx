// SKU 种子：对尚无 SKU 的 SPU 走真实生成服务（笛卡尔积 + 完整性校验 + 组合键防重），
// 并填充真实感的价格/库存/上下架状态分布 —— 让大屏与运营数据活起来。
// 用法：pnpm --filter backend run seed:skus（依赖 seed:spus / 手工 SPU 已存在）
// 幂等：已有 SKU 的 SPU 跳过（生成接口本身也拦重复生成）；可对已生成商品重复执行
// 状态分布（每商品）：前 50% 在架已定价、40% 下架已定价、10% 未定价下架（I11 待办的真实来源）
import 'dotenv/config'
import mongoose from 'mongoose'
import { Spu } from '../src/models/Spu.js'
import { Sku } from '../src/models/Sku.js'
import { generateSkus } from '../src/services/sku.js'

// 各三级分类的合理价格区间（单位：分）——按品类常识取值，不为 0 即可支撑「库存总价值」
const PRICE_RANGE: Record<string, [number, number]> = {
  智能手机: [349900, 699900],
  老人机: [29900, 59900],
  充电器: [9900, 29900],
  数据线: [1900, 7900],
  笔记本: [799900, 1299900],
  台式机: [599900, 999900],
  键盘: [19900, 69900],
  鼠标: [9900, 39900],
  冰箱: [299900, 699900],
  空调: [199900, 599900],
  电风扇: [9900, 29900],
}

// 笛卡尔积：销售属性维度按序展开成完整组合集
function cartesian(dims: Array<{ saleAttrName: string; saleAttrValueList: string[] }>) {
  let combos: Array<Array<{ saleAttrName: string; saleAttrValue: string }>> = [[]]
  for (const dim of dims) {
    const next: Array<Array<{ saleAttrName: string; saleAttrValue: string }>> = []
    for (const combo of combos) {
      for (const value of dim.saleAttrValueList) {
        next.push([...combo, { saleAttrName: dim.saleAttrName, saleAttrValue: value }])
      }
    }
    combos = next
  }
  return combos
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI 未配置，请检查 backend/.env')
    process.exit(1)
  }
  await mongoose.connect(process.env.MONGODB_URI)

  const spus = await Spu.find().lean()
  const categoryNames = new Map(
    (await mongoose.connection.db!.collection('categories').find().toArray()).map((c) => [
      String(c._id),
      c.name,
    ]),
  )

  let generatedSpus = 0
  let totalSkus = 0
  for (const spu of spus) {
    if (await Sku.exists({ spuId: spu._id })) continue // 已有 SKU（如用户自建的 iPhone 16 Pro）跳过
    if (!spu.saleAttrList || spu.saleAttrList.length === 0) {
      console.log(`⏭️  ${spu.name}：无销售属性，跳过（需先配置维度）`)
      continue
    }

    const combos = cartesian(spu.saleAttrList)
    const [minPrice, maxPrice] = PRICE_RANGE[categoryNames.get(String(spu.category3Id)) ?? ''] ?? [
      9900, 99900,
    ]
    // 状态分布：前 50% 在架、中 40% 下架已定价、末 10% 未定价下架（至少 1 个未定价当组合数 ≥ 3）
    const onSaleCount = Math.max(1, Math.round(combos.length * 0.5))
    const pricedOffCount = Math.round(combos.length * 0.4)
    const items = combos.map((valueList, index) => {
      const ratio = combos.length > 1 ? index / (combos.length - 1) : 0.5
      const price = Math.round((minPrice + (maxPrice - minPrice) * ratio) / 100) * 100
      if (index < onSaleCount) {
        return {
          skuSaleAttrValueList: valueList,
          price,
          weight: 0,
          stock: 50 + (index % 6) * 30,
          isSale: true,
        }
      }
      if (index < onSaleCount + pricedOffCount) {
        return {
          skuSaleAttrValueList: valueList,
          price,
          weight: 0,
          stock: 20 + (index % 4) * 10,
          isSale: false,
        }
      }
      // 未定价：price 0 + 下架 —— 上架闸门（I11）拦的就是这批，大屏「待定价」指标来源
      return { skuSaleAttrValueList: valueList, price: 0, weight: 0, stock: 0, isSale: false }
    })

    await generateSkus(String(spu._id), items)
    totalSkus += items.length
    generatedSpus++
    console.log(
      `✅ ${spu.name}：生成 ${items.length} 个 SKU（在架 ${onSaleCount} / 下架已定价 ${pricedOffCount} / 未定价 ${items.length - onSaleCount - pricedOffCount}）`,
    )
  }

  console.log(`\n✅ SKU 种子完成：${generatedSpus} 个 SPU 共 ${totalSkus} 个 SKU`)
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('❌ 种子失败:', err)
  process.exit(1)
})
