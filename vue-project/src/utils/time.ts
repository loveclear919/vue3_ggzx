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
