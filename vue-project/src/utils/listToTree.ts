// utils/listToTree.ts
// 平铺列表 → 树：一遍建索引（不污染入参）、一遍挂载（孤儿静默丢弃）、先序递归排序。
// 信任上游无环数据（后端 parentId 环校验已拦截）；若数据有环，sortRecursive 会无限递归

export interface TreeSource {
  id: string // 主键契约：调用方负责把业务 id 字段映射到 id（如 { id: r.permissionId, ...r }）
  parentId: string | null
  sortIndex: number
}

export type TreeNode<T> = T & { children: TreeNode<T>[] }

export function listToTree<T extends TreeSource>(list: readonly T[]): TreeNode<T>[] {
  // 先建索引，顺便把每个节点包成带 children 的副本，避免污染入参
  const nodeMap = new Map<string, TreeNode<T>>()
  for (const item of list) {
    nodeMap.set(item.id, { ...item, children: [] })
  }

  const roots: TreeNode<T>[] = []
  for (const item of list) {
    const node = nodeMap.get(item.id)!

    // 根判定
    if (item.parentId === null) {
      roots.push(node)
      continue
    }

    // 找父节点；找不到就是孤儿，静默忽略
    const parent = nodeMap.get(item.parentId)
    if (!parent) continue

    parent.children.push(node)
  }

  // 先序排序：当前层按 sortIndex 排完，再递归子层（各自 children 数组原地排序）
  const sortRecursive = (nodes: TreeNode<T>[]) => {
    nodes.sort((a, b) => a.sortIndex - b.sortIndex)
    for (const n of nodes) {
      if (n.children.length) sortRecursive(n.children)
    }
  }
  sortRecursive(roots)

  return roots
}
