// 商品分类接口
import request from '@/utils/request'
import type { CategoryFlatNode } from './type'

const BASE_URL = '/category'

// 平铺查询某父级下的子级（不传 parentId = 一级分类）：逐级下钻用，永远不渲染全量
export const getCategoryChildren = (parentId?: string) =>
  request.get<CategoryFlatNode[]>(BASE_URL, { params: { parentId } })
