// SPU 种子：按三级分类种入 13 个真实商品（演示数据，幂等可重复执行）
// 用法：pnpm --filter backend run seed:spus（依赖：分类/平台属性/销售属性字典种子 + 品牌已存在）
// 设计口径：
//   ① 销售属性维度 2-3 个（参考真实电商，如手机 = 颜色×版本×网络），与平台属性不重复；
//   ② 笛卡尔积 ≤ 50（本批每个商品 4-8 个 SKU）；
//   ③ 图片暂不填充（imageList 空，后续走上传流程补）；
//   ④ 幂等 = 按 SPU 名跳过已存在（存在 SKU 时销售属性被冻结 I6，绝不覆盖既有数据）
import 'dotenv/config'
import mongoose from 'mongoose'
import { Brand } from '../src/models/Brand.js'
import { Category } from '../src/models/Category.js'
import { Spu } from '../src/models/Spu.js'
import { createSpu } from '../src/services/spu.js'

interface SeedSpu {
  name: string
  brand: string
  category3: string
  description: string
  platformAttrs: Array<[string, string]>
  saleAttrs: Array<[string, string[]]>
}

const SEED_SPUS: SeedSpu[] = [
  {
    name: 'iPhone 15 Pro',
    brand: 'APPLE',
    category3: '智能手机',
    description: 'A17 Pro 芯片，钛金属机身',
    platformAttrs: [
      ['屏幕尺寸', '6.1英寸'],
      ['运行内存', '12GB'],
      ['机身存储', '256GB'],
      ['操作系统', 'iOS'],
    ],
    saleAttrs: [
      ['颜色', ['黑色', '白色', '蓝色']],
      ['版本', ['128GB', '256GB']],
      ['网络', ['全网通5G']],
    ],
  },
  {
    name: '华为 Mate 60 Pro',
    brand: '华为',
    category3: '智能手机',
    description: '麒麟芯片，卫星通信',
    platformAttrs: [
      ['屏幕尺寸', '6.7英寸'],
      ['运行内存', '12GB'],
      ['机身存储', '512GB'],
      ['操作系统', '鸿蒙'],
    ],
    saleAttrs: [
      ['颜色', ['黑色', '白色']],
      ['版本', ['256GB', '512GB']],
      ['网络', ['全网通5G', '卫星通信']],
    ],
  },
  {
    name: '三星 Galaxy S24',
    brand: '三星',
    category3: '智能手机',
    description: 'AI 手机，超视觉影像',
    platformAttrs: [
      ['屏幕尺寸', '6.7英寸'],
      ['运行内存', '8GB'],
      ['机身存储', '256GB'],
      ['操作系统', 'Android'],
    ],
    saleAttrs: [
      ['颜色', ['黑色', '银色']],
      ['版本', ['128GB', '256GB']],
      ['套餐', ['裸机', '含充电套装']],
    ],
  },
  {
    name: '红米 9A 老人机',
    brand: '小米',
    category3: '老人机',
    description: '大字体大按键，超长待机',
    platformAttrs: [
      ['屏幕尺寸', '2.8英寸'],
      ['电池容量', '3000mAh'],
      ['按键类型', '实体按键'],
    ],
    saleAttrs: [
      ['颜色', ['黑色', '红色']],
      ['版本', ['标准版', '高配版']],
    ],
  },
  {
    name: '华为超级快充 66W',
    brand: '华为',
    category3: '充电器',
    description: '氮化镓充电器，多重安全保护',
    platformAttrs: [
      ['输出功率', '65W'],
      ['接口类型', 'USB-C'],
    ],
    saleAttrs: [
      ['颜色', ['白色', '黑色']],
      ['型号', ['Type-C版', '双口版']],
      ['规格', ['66W', '100W']],
    ],
  },
  {
    name: '小米 6A 快充数据线',
    brand: '小米',
    category3: '数据线',
    description: '6A 大电流，编织线身',
    platformAttrs: [
      ['长度', '1.5米'],
      ['接口类型', 'USB-C转C'],
    ],
    saleAttrs: [
      ['颜色', ['白色', '黑色']],
      ['型号', ['USB-C转C', 'USB-A转C']],
      ['规格', ['1米', '2米']],
    ],
  },
  {
    name: 'Apple MacBook Air M3',
    brand: 'APPLE',
    category3: '笔记本',
    description: 'M3 芯片，轻至 1.24kg',
    platformAttrs: [
      ['屏幕尺寸', '14英寸'],
      ['内存容量', '16GB'],
      ['硬盘容量', '512GB'],
      ['处理器', 'M系列'],
    ],
    saleAttrs: [
      ['颜色', ['深空灰', '银色']],
      ['版本', ['16GB+512GB', '16GB+1TB']],
      ['套餐', ['裸机', '含扩展坞']],
    ],
  },
  {
    name: '联想拯救者 台式机',
    brand: '联想',
    category3: '台式机',
    description: '电竞主机，光追显卡',
    platformAttrs: [
      ['内存容量', '32GB'],
      ['硬盘容量', '1TB'],
      ['处理器', 'i7'],
    ],
    saleAttrs: [
      ['颜色', ['黑色']],
      ['版本', ['i7+32G', 'i9+64G']],
      ['套餐', ['标配', '含显示器']],
    ],
  },
  {
    name: '华为智能蓝牙键盘',
    brand: '华为',
    category3: '键盘',
    description: '多设备切换，静音按键',
    platformAttrs: [
      ['连接方式', '蓝牙'],
      ['轴体', '红轴'],
    ],
    saleAttrs: [
      ['颜色', ['黑色', '白色']],
      ['型号', ['84键', '104键']],
    ],
  },
  {
    name: '戴尔静音无线鼠标',
    brand: '戴尔',
    category3: '鼠标',
    description: '静音微动，双模连接',
    platformAttrs: [
      ['连接方式', '无线'],
      ['DPI', '1600'],
    ],
    saleAttrs: [
      ['颜色', ['黑色', '白色']],
      ['型号', ['标准版', '静音版']],
    ],
  },
  {
    name: '海尔对开门冰箱',
    brand: '海尔',
    category3: '冰箱',
    description: '风冷无霜，一级能效',
    platformAttrs: [
      ['容量', '400L以上'],
      ['能效等级', '一级'],
      ['制冷方式', '风冷'],
    ],
    saleAttrs: [
      ['颜色', ['银色', '灰色']],
      ['型号', ['510L', '600L']],
      ['规格', ['一级能效', '二级能效']],
    ],
  },
  {
    name: '格力变频空调',
    brand: '格力',
    category3: '空调',
    description: '一级能效，变频冷暖',
    platformAttrs: [
      ['匹数', '1.5匹'],
      ['能效等级', '一级'],
      ['冷暖类型', '冷暖'],
    ],
    saleAttrs: [
      ['颜色', ['白色']],
      ['型号', ['1.5匹', '2匹']],
      ['规格', ['冷暖', '单冷']],
    ],
  },
  {
    name: '美的静音落地扇',
    brand: '美的',
    category3: '电风扇',
    description: '七叶柔风，遥控定时',
    platformAttrs: [
      ['类型', '落地扇'],
      ['档位', '多档调速'],
    ],
    saleAttrs: [
      ['颜色', ['白色', '黑色']],
      ['型号', ['机械版', '遥控版']],
    ],
  },
]

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI 未配置，请检查 backend/.env')
    process.exit(1)
  }
  await mongoose.connect(process.env.MONGODB_URI)

  let created = 0
  let skipped = 0
  for (const item of SEED_SPUS) {
    const skuCount = item.saleAttrs.reduce((acc, [, values]) => acc * values.length, 1)
    if (skuCount > 50) {
      throw new Error(`${item.name} 笛卡尔积 ${skuCount} 超过 50，请缩减销售属性值`)
    }
    if (await Spu.exists({ name: item.name })) {
      skipped++
      continue
    }
    const brand = await Brand.findOne({ name: item.brand }).lean()
    if (!brand) {
      throw new Error(`品牌不存在：${item.brand}（请先在品牌管理中添加）`)
    }
    const category3 = await Category.findOne({ name: item.category3, level: 3 }).lean()
    if (!category3) {
      throw new Error(`三级分类不存在：${item.category3}`)
    }
    // 走 service（规则单入口）：brand/category 存在性、销售属性字典校验全部复用
    await createSpu({
      name: item.name,
      description: item.description,
      brandId: String(brand._id),
      category3Id: String(category3._id),
      imageList: [], // 图片暂不填充，后续走上传流程
      attrList: item.platformAttrs.map(([attrName, attrValue]) => ({ attrName, attrValue })),
      saleAttrList: item.saleAttrs.map(([saleAttrName, saleAttrValueList]) => ({
        saleAttrName,
        saleAttrValueList,
      })),
    })
    created++
    console.log(
      `✅ ${item.name}（${item.category3}）→ 维度 ${item.saleAttrs.length}，预计 ${skuCount} 个 SKU`,
    )
  }

  console.log(`\n✅ SPU 种子完成：本次新建 ${created}，跳过已存在 ${skipped}`)
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('❌ 种子失败:', err)
  process.exit(1)
})
