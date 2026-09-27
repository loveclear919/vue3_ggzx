import { ref } from 'vue'
import { useLatestRequest } from './useLatestRequest'

// 需求参数： getXXXList(查找当页的函数), pageSize（默认为10 可以自行传入）
export function pageList<T>(
  getList: (pageNo: number, pageSize: number) => Promise<{ list: T[]; total: number }>,
  options?: { pageSize?: number },
) {
  // 初始化
  const pageNo = ref(1)
  const limit = ref(options?.pageSize ?? 10)
  const total = ref(0)
  const list = ref<T[]>([])
  // 竞态
  const { loading, run } = useLatestRequest()

  // 加载页面
  async function load(): Promise<boolean> {
    const result = await run(() => getList(pageNo.value, limit.value))
    if (result === undefined) return false

    list.value = result.list
    total.value = result.total

    // 数据为空
    if (list.value.length === 0) {
      if (total.value === 0 && pageNo.value > 1) {
        pageNo.value = 1
        return load()
      }
      const lastPage = Math.ceil(total.value / limit.value)
      if (lastPage >= 1 && lastPage < pageNo.value) {
        pageNo.value = lastPage
        return load()
      }
    }
    return true
  }

  async function reloadAfterDelete() {
    return load()
  }

  function pageSetOne() {
    pageNo.value = 1
    return load()
  }

  return { list, pageNo, limit, total, loading, load, reloadAfterDelete, pageSetOne }
}
