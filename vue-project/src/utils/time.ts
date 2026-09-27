// ISO 时间字符串 → 本地时区展示格式（yyyy-MM-dd HH:mm:ss）。
// 不能直接截断 ISO 字符串：库里的时间是 UTC（末尾 Z），截断会拿 UTC 钟面当地钟面显示（差 8 小时）；
// 先解析成 Date（同一个瞬间），再用本地时区的 getter 格式化。非法输入返回 '—'
// 数据库中的ISO：2024-06-10T08:00:00.000Z → 本地时区展示：2024-06-10 16:00:00
export const formatDateTime = (iso: string) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export const getTimePeriod = () => {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 9) {
    return '早上'
  } else if (hour >= 9 && hour < 11) {
    return '上午'
  } else if (hour >= 11 && hour < 13) {
    return '中午'
  } else if (hour >= 13 && hour < 17) {
    return '下午'
  } else if (hour >= 17 && hour < 19) {
    return '傍晚'
  } else {
    return '晚上'
  }
}
