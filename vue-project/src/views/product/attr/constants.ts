// 属性模块边界常量：与后端 backend/src/models/Attr.ts 的 ATTR_LIMITS 一一对应
//
// 为什么是「镜像」而不是「共享」：前后端是两个独立包（vue-project / backend），前端不能 import 后端代码，
// 浏览器也不该拿到服务端的校验规则。代价是改边界要动两处 —— 所以两端的键名保持完全一致，
// 让 diff 时能一眼比对（真正的兜底永远在后端：前端只是提前告知，绕过前端也不会写进脏数据）
//
// 只镜像前端真正会拦截的项：用不到的键不预留，避免「看起来对齐，其实没人用」
export const ATTR_LIMITS = {
  NAME_LENGTH: 30, // 属性名长度（校验规则与输入框 maxlength 共用，此前是两处硬编码的 30）
  VALUE_LENGTH: 30, // 单个属性值长度
  MAX_VALUES_COUNT: 20, // 一个属性最多允许的属性值个数
} as const
