// 商品分类模块类型

// 树节点 — 与后端 toCategoryNode 返回结构对齐（children 由后端组装）
export interface CategoryNode {
  categoryId: string
  name: string
  level: 1 | 2 | 3
  parentId: string | null
  children: CategoryNode[]
}
