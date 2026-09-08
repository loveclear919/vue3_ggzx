// 商品分类接口
import request from '@/utils/request'
import type { CategoryNode } from './type'

enum Api {
  TREE = '/category/tree',
}

// 获取三级分类树（用于属性管理、商品等模块的分类选择器）
export const getCategoryTree = () => request.get<CategoryNode[]>(Api.TREE)
