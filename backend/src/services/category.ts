import { Category, toCategoryNode, type CategoryNode } from '../models/Category.js'

// 业务层：商品分类

// 全量分类组装成树：一次查询 + 内存建树（分类数据量小，无需逐层查询）
export async function listCategoryTree(): Promise<CategoryNode[]> {
  const categories = await Category.find().sort({ createdAt: 1 }).lean()

  // 第一遍：为每条记录建节点并登记
  const nodeMap = new Map<string, CategoryNode>()
  for (const category of categories) {
    nodeMap.set(String(category._id), toCategoryNode(category))
  }

  // 第二遍：按 parentId 挂载 —— 有父级挂到父级 children，无父级进根数组
  const roots: CategoryNode[] = []
  for (const category of categories) {
    // 拿到节点
    const node = nodeMap.get(String(category._id))!
    // 拿到父级 id
    const parentId = category.parentId ? String(category.parentId) : null

    if (parentId && nodeMap.has(parentId)) {
      nodeMap.get(parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}
