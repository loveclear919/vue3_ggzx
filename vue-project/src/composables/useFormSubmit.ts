import { ref } from 'vue'
import type { FormInstance } from 'element-plus'

// 提交骨架收口（9 处表单/抽屉提交共用的同一形态）：
//   表单校验（可选）→ 前置检查（可选）→ loading 生命周期 → 成功回调。
// beforeSubmit 的返回值透传给 onSuccess（T）：检查产物（如 SKU 换算好的分、SPU 清洗后的列表）
// 走显式参数而非缓存 ref —— 时序契约由类型系统检查；返回 false 中断提交。
// 差异部分（API 调用、成功文案、关闭弹窗/emit/刷新列表）全在 onSuccess；失败静默（拦截器弹文案）。
export function useFormSubmit<T = void>(options: {
  formRef?: { value?: FormInstance | null } // 无表单（抽屉类提交）时省略
  beforeSubmit?: () => T | false | Promise<T | false>
  onSuccess: (data: T) => Promise<void> | void
}) {
  const submitting = ref(false)

  const submit = async (): Promise<boolean> => {
    if (options.formRef) {
      const valid = await options.formRef.value?.validate().catch(() => false)
      if (!valid) return false
    }
    // false 中断；其余值（含 void 站点的 undefined）透传给 onSuccess
    let data = undefined as T
    if (options.beforeSubmit) {
      const result = await options.beforeSubmit()
      if (result === false) return false
      data = result
    }
    submitting.value = true
    try {
      await options.onSuccess(data)
      return true
    } catch {
      return false // 失败提示由拦截器弹出
    } finally {
      // 延迟清除 loading：成功关闭弹窗的瞬间避免 loading 闪烁
      setTimeout(() => {
        submitting.value = false
      }, 300)
    }
  }

  return { submitting, submit }
}
