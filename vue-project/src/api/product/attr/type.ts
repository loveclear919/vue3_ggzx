// 属性管理（attr）模块请求/响应类型

// 平台属性对象 — 与后端 toAttrDTO 返回结构对齐
export interface AttrInfo {
  attrId: string
  name: string
  categoryId: string
  values: string[]
}

// 新增属性请求参数
export interface CreateAttrRequest {
  categoryId: string
  name: string
  values: string[]
}

// 更新属性请求参数 — 后端白名单只认 name/values，均可选
export interface UpdateAttrRequest {
  name?: string
  values?: string[]
}
