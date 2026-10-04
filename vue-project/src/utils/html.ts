// HTML 转义：拼接 HTML 字符串前的唯一出口
// 消费方：ECharts tooltip 的 formatter —— 它默认 renderMode:'html'，返回的字符串会被直接写进
// innerHTML（echarts/lib/component/tooltip/TooltipHTMLContent.js 的 el.innerHTML = content）。
// 商品名 / 属性值 / 品牌名都是库里的人工录入内容，未转义就拼进去 = 存储型 XSS：
// 低权限运营改一个商品名，就能打到有 /screen 权限的看板用户。
//
// 边界：这里只做转义，不做白名单消毒 —— 本项目没有需要保留的富文本（v-html 用量为 0）。
// 将来若出现必须渲染用户富文本的位置，那里应引入 DOMPurify，而不是把标签转义成字面量。
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
