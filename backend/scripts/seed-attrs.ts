// 平台属性种子：为 12 个三级分类填充电商常用规格属性（演示数据，幂等可重复执行）
// 用法：pnpm --filter backend run seed:attrs（依赖 seed 已种入三级分类）
// 幂等：按 {categoryId, name} 复合键 upsert，重复执行覆盖 values 为基线（玩坏重跑恢复）
import 'dotenv/config'
import mongoose from 'mongoose'
import { Category } from '../src/models/Category.js'
import { Attr } from '../src/models/Attr.js'

// 三级分类名 → 属性清单（值数量/长度在 ATTR_LIMITS 内：≤20 个值、单个 ≤30 字符）
const SEED_ATTRS: Record<string, Array<{ name: string; values: string[] }>> = {
  智能手机: [
    { name: '屏幕尺寸', values: ['6.1英寸', '6.7英寸', '6.9英寸'] },
    { name: '运行内存', values: ['8GB', '12GB', '16GB'] },
    { name: '机身存储', values: ['128GB', '256GB', '512GB', '1TB'] },
    { name: '电池容量', values: ['4000mAh', '4500mAh', '5000mAh', '5500mAh'] },
    { name: '像素', values: ['1200万', '4800万', '5000万', '1亿'] },
    { name: '操作系统', values: ['iOS', 'Android', '鸿蒙'] },
  ],
  老人机: [
    { name: '屏幕尺寸', values: ['2.4英寸', '2.8英寸'] },
    { name: '电池容量', values: ['1500mAh', '2000mAh', '3000mAh'] },
    { name: '按键类型', values: ['实体按键', '触屏'] },
  ],
  充电器: [
    { name: '输出功率', values: ['20W', '30W', '65W', '100W'] },
    { name: '接口类型', values: ['USB-C', 'USB-A', '双口'] },
  ],
  数据线: [
    { name: '长度', values: ['1米', '1.5米', '2米'] },
    { name: '接口类型', values: ['USB-C转C', 'USB-A转C', '苹果Lightning'] },
  ],
  笔记本: [
    { name: '屏幕尺寸', values: ['13.3英寸', '14英寸', '15.6英寸', '16英寸'] },
    { name: '内存容量', values: ['16GB', '32GB', '64GB'] },
    { name: '硬盘容量', values: ['512GB', '1TB', '2TB'] },
    { name: '处理器', values: ['i5', 'i7', 'i9', 'M系列', '锐龙R7'] },
  ],
  台式机: [
    { name: '内存容量', values: ['16GB', '32GB', '64GB'] },
    { name: '硬盘容量', values: ['1TB', '2TB', '4TB'] },
    { name: '处理器', values: ['i5', 'i7', 'i9', '锐龙R5', '锐龙R7'] },
  ],
  键盘: [
    { name: '连接方式', values: ['有线', '无线', '蓝牙'] },
    { name: '轴体', values: ['青轴', '红轴', '茶轴', '黑轴'] },
  ],
  鼠标: [
    { name: '连接方式', values: ['有线', '无线', '蓝牙'] },
    { name: 'DPI', values: ['800', '1600', '3200', '6400'] },
  ],
  冰箱: [
    { name: '容量', values: ['200L以下', '200-400L', '400L以上'] },
    { name: '能效等级', values: ['一级', '二级', '三级'] },
    { name: '制冷方式', values: ['风冷', '直冷'] },
  ],
  空调: [
    { name: '匹数', values: ['1匹', '1.5匹', '2匹', '3匹'] },
    { name: '能效等级', values: ['一级', '二级', '三级'] },
    { name: '冷暖类型', values: ['单冷', '冷暖'] },
  ],
  电风扇: [
    { name: '类型', values: ['落地扇', '台扇', '吊扇', '无叶扇'] },
    { name: '档位', values: ['3档', '4档', '多档调速'] },
  ],
  加湿器: [
    { name: '水箱容量', values: ['2L', '4L', '6L'] },
    { name: '加湿量', values: ['200ml/h', '300ml/h', '500ml/h'] },
  ],
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI 未配置，请检查 backend/.env')
    process.exit(1)
  }
  await mongoose.connect(process.env.MONGODB_URI)

  const categories = await Category.find({ level: 3 }).lean()
  if (categories.length === 0) {
    throw new Error('三级分类为空：请先运行 pnpm --filter backend run seed')
  }

  let created = 0
  let synced = 0
  for (const cat of categories) {
    const attrs = SEED_ATTRS[cat.name]
    if (!attrs) continue
    for (const attr of attrs) {
      const exists = await Attr.findOne({ categoryId: cat._id, name: attr.name }).lean()
      if (exists) {
        await Attr.updateOne(
          { categoryId: cat._id, name: attr.name },
          { $set: { values: attr.values } },
        )
        synced++
      } else {
        await Attr.create({ categoryId: cat._id, name: attr.name, values: attr.values })
        created++
      }
    }
  }

  console.log(
    `✅ 平台属性就绪：覆盖 ${Object.keys(SEED_ATTRS).length} 个三级分类（本次新建 ${created}，同步 ${synced}）`,
  )
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('❌ 种子失败:', err)
  process.exit(1)
})
