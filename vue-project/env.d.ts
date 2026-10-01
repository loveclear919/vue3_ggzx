/// <reference types="vite/client" />
/// <reference types="unplugin-icons/types/vue" />

// 关闭 Vite 的 any 兜底索引签名（strictImportMetaEnv 是 vite 官方开关）：
// 默认 ImportMetaEnv 带 Record<string, any>，错拼的键会静默落到 any；
// 声明此字段后 fallback 变 never，未声明的 env 键直接 TS2339
interface ViteTypeOptions {
  strictImportMetaEnv: unknown
}

// 自定义环境变量的类型声明（键与 .env.example 对齐）：配合上面的严格开关，
// 名字写错（如 VITE_APP_BASE_APII）会直接报类型错误，而不是静默拿到 undefined
interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
  readonly VITE_APP_BASE_API: string
}
