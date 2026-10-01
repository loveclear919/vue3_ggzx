// 删除确认的统一封装：确认弹窗 + 执行 + 成功提示（六页 handleDelete 共用的同一形态）
// 返回 true = 已删除（调用方负责刷新列表）；false = 用户取消或删除失败（失败提示由拦截器弹出）
// ElMessage / ElMessageBox 由 unplugin-auto-import 注入，无需手动 import
export async function confirmDelete(options: {
  entity: string // 实体名（用于确认文案，如「角色」「品牌」）
  name: string // 展示名（确认文案里的「」内）
  onConfirm: () => Promise<unknown>
  successMsg?: string
}): Promise<boolean> {
  try {
    await ElMessageBox.confirm(
      `确定删除${options.entity}「${options.name}」吗？删除后不可恢复`,
      '删除确认',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return false // 用户取消
  }
  try {
    await options.onConfirm()
    ElMessage.success(options.successMsg ?? '删除成功')
    return true
  } catch {
    return false // 失败提示由拦截器弹出（如 409 引用保护）
  }
}
