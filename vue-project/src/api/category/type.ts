// 商品分类模块类型

// 平铺子级节点（逐级下钻用）— 与后端 CategoryFlatNode 对齐
export interface CategoryFlatNode {
  categoryId: string
  name: string
  level: 1 | 2 | 3
  parentId: string | null
  hasChildren: boolean
}
