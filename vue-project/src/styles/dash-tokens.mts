// ============================================================
// 数据大屏调色板 —— **脚本侧唯一事实源**
//
// 为什么脚本不能像样式那样用 var(--dash-*)：
//   ECharts 把这些颜色交给 canvas API（fillStyle / addColorStop），而 canvas 没有
//   CSS 级联上下文，无法解析 var() —— 传进去就是非法色值，ECharts 回落成 #000000
//   （实测报错："'var(--dash-cell-empty)' is an illegal color, fallback to '#000000'"）。
//   所以脚本侧必须拿**真实色值**。
//
// 唯一事实源策略：
//   · 脚本（图表 option / 颜色常量）→ import 本模块
//   · 样式（scoped CSS）→ 用 --dash-* 自定义属性，值由 .screen-canvas 暴露
//   两边的色值必须一致；改色时本文件与 src/styles/variables.scss 一起改
//   （variables.scss 里有同样的速查表注释）。
//
// 新增颜色前先查这里，不要在组件里写字面量。
// ============================================================

export const DASH = {
  // —— 底色 / 表面 ——
  bgDeep: '#0b1424', // 页面底 / 图表内深底
  panelBg: 'rgba(16, 31, 56, 0.72)', // 面板底
  overlayBg: '#12233f', // 浮层（下拉面板）底
  maskBg: 'rgba(138, 163, 192, 0.06)', // 行底纹
  textFade: 'rgba(138, 163, 192, 0.1)', // 极弱底

  // —— 文字（按强调层级递减）——
  text: '#e6f1ff', // 主文字
  textDim: '#c9dcf2', // 弱化文字
  textSub: '#8aa3c0', // 次文字
  textHint: 'rgba(138, 163, 192, 0.75)', // 提示文字
  textSoft: 'rgba(138, 163, 192, 0.7)', // 辅助文字
  textMuted: 'rgba(138, 163, 192, 0.6)', // 脚注文字
  textFaint: 'rgba(138, 163, 192, 0.5)', // 空态 / 禁用

  // —— 强调色 ——
  accent: '#00e5ff', // 主强调（品牌青）
  accent2: '#4da3ff', // 次强调（渐变起点）
  accentFaint: 'rgba(0, 229, 255, 0.06)', // 强调底：最弱
  accentMid: 'rgba(0, 229, 255, 0.08)', // 强调底：选中
  accentSoft: 'rgba(0, 229, 255, 0.14)', // 强调底：悬停
  accentLine: 'rgba(0, 229, 255, 0.25)', // 强调线
  accentGlow: 'rgba(0, 229, 255, 0.5)', // 强调光带
  accentBorder: 'rgba(0, 229, 255, 0.4)', // 强调描边（较实）

  // —— 描边 / 分隔 ——
  borderStrong: 'rgba(0, 229, 255, 0.7)', // 悬停描边
  borderBtn: 'rgba(0, 229, 255, 0.35)', // 按钮描边
  border: 'rgba(0, 229, 255, 0.3)', // 常规描边
  borderSoft: 'rgba(0, 229, 255, 0.16)', // 弱描边（面板）
  divider: 'rgba(138, 163, 192, 0.12)', // 分组分隔线
  gridLine: 'rgba(138, 163, 192, 0.15)', // ECharts 网格线

  // —— 语义色 ——
  warn: '#fab219', // 警示（待定价 / 更新失败）
  danger: '#f56c6c', // 异常（零库存）
  statusGood: '#0ca30c', // 状态：在架
  statusIdle: '#5b6b82', // 状态：下架已定价（中性）

  // —— 品牌色（渐变两端）——
  brandBlue: '#1976d2',
  brandCyan: '#00e5ff',

  // —— 热力图色阶 ——
  cellLow: '#163e6e', // 色阶低端
  cellLowRgb: [22, 62, 110] as [number, number, number], // 同上，供 t 值插值计算
  cellHighRgb: [0, 229, 255] as [number, number, number], // 色阶高端，同上
  cellEmpty: '#2a3346', // 零库存格
} as const
