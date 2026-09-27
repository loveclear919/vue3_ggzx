// 默认展示名生成：注册 / 管理员创建时不要求填用户名，自动生成「用户 + 6 位随机数字」。
// 碰撞概率 1/10⁶ 量级，且 username 有唯一索引兜底：调用方捕获 11000(username) 后重新生成再试
export function generateDefaultUsername() {
  return `用户${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`
}
