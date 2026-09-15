// 转义正则特殊字符：用户输入作为 $regex 的字面量匹配，
// 防止 `(` 之类字符破坏模式语法导致 MongoServerError，或构造出非预期的匹配语义
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
