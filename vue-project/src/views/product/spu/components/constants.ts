// SPU 模块边界常量：与后端 backend/src/models/Spu.ts 的 SPU_LIMITS 一一对应
//
// 为什么是「镜像」而不是「共享」：前后端是两个独立包（vue-project / backend），前端不能 import 后端代码，
// 浏览器也不该拿到服务端的校验规则。代价是改边界要动两处 —— 所以两端的键名保持完全一致，
// 让 diff 时能一眼比对（真正的兜底永远在后端：前端只是提前告知，绕过前端也不会写进脏数据）
//
// 只镜像前端真正会拦截的项：IMAGE_NAME_LENGTH / MAX_ATTR_COUNT / ATTR_NAME_LENGTH /
// SALE_ATTR_NAME_LENGTH 均为「前端没有自由输入入口」的字段（属性名来自分类预置、销售属性名来自字典），
// 不在前端重复定义
export const SPU_LIMITS = {
  NAME_LENGTH: 100, // SPU 名称长度（校验规则与输入框 maxlength 共用）
  DESCRIPTION_LENGTH: 500, // SPU 描述长度
  MAX_IMAGE_COUNT: 10, // 一个 SPU 最多几张图片
  ATTR_VALUE_LENGTH: 200, // 单个平台属性值长度
  MAX_SALE_ATTR_COUNT: 10, // 销售属性（维度）行数上限
  MAX_SALE_ATTR_VALUES: 20, // 单个销售属性最多几个属性值
  SALE_ATTR_VALUE_LENGTH: 30, // 单个销售属性值长度
} as const
