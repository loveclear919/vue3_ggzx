// HTML 转义：拼接 HTML 字符串前的唯一出口
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

// 顺带把 undefined/null 归一成空串：属性值下标越界时不会拼出 "undefined"
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]!)
}
