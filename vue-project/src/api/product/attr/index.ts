// 属性管理接口统一出口
import request from '@/utils/request'
import type { AttrInfo, CreateAttrRequest, UpdateAttrRequest } from './type'

const BASE_URL = '/attr'

// 按三级分类查询属性列表
export const getAttrList = (categoryId: string) =>
  request.get<AttrInfo[]>(BASE_URL, { params: { categoryId } })

// 新增属性
export const createAttr = (data: CreateAttrRequest) => request.post<AttrInfo>(BASE_URL, data)

// 更新属性
export const updateAttr = (id: string, data: UpdateAttrRequest) =>
  request.patch<AttrInfo>(`${BASE_URL}/${id}`, data)

// 删除属性
export const deleteAttr = (id: string) => request.delete<null>(`${BASE_URL}/${id}`)
