import { Category } from '../models/Category.js'

// 业务层：商品分类

// 平铺子级节点（逐级下钻用）—— 不返回 children，避免整棵组装：数据量大时只传当前层级
export interface CategoryFlatNode {
  categoryId: string
  name: string
  level: 1 | 2 | 3
  parentId: string | null
  hasChildren: boolean
}

// 按父级平铺查询子级（不传 parentId = 一级分类）：attr/SPU 页逐级下钻与分类管理共用
// hasChildren 用一次聚合批量判断，避免逐条 countDocuments 造成 N+1
export async function listChildCategories(parentId?: string): Promise<CategoryFlatNode[]> {
  const filter = parentId ? { parentId } : { parentId: null }
  const list = await Category.find(filter).sort({ createdAt: 1 }).lean()

  if (list.length === 0) return []

  const childCounts = await Category.aggregate<{ _id: unknown; count: number }>([
    { $match: { parentId: { $in: list.map((category) => category._id) } } },
    { $group: { _id: '$parentId', count: { $sum: 1 } } },
  ])

  const countMap = new Map(childCounts.map((row) => [String(row._id), row.count]))

  // id 统一 String()：与前端 CategoryFlatNode（categoryId: string / parentId: string | null）契约一致，
  // 不依赖 ObjectId 的 JSON 序列化隐式转换
  return list.map((category) => ({
    categoryId: String(category._id),
    name: category.name,
    level: category.level,
    parentId: category.parentId ? String(category.parentId) : null,
    hasChildren: (countMap.get(String(category._id)) ?? 0) > 0,
  }))
}
