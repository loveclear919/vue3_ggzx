import { ref } from 'vue'
import { useLatestRequest } from './useLatestRequest'

// 分页列表组合式函数：外部传入 fetcher，内部维护 pageNo/limit/total/list/loading
export function usePagedList<T>(
  fetcher: (page: number, pageSize: number) => Promise<{ list: T[]; total: number }>,
  options?: { pageSize?: number },
) {
  const pageNo = ref(1)
  const limit = ref(options?.pageSize ?? 10)
  const total = ref(0)
  const list = ref<T[]>([])
  const { loading, run } = useLatestRequest()

  async function load(): Promise<boolean> {
    const result = await run(() => fetcher(pageNo.value, limit.value))
    if (result === undefined) return false

    list.value = result.list
    total.value = result.total

    // 本页为空时的页码自愈
    if (list.value.length === 0) {
      // (1) 数据全没了 → 回首页展示空态
      if (total.value === 0 && pageNo.value > 1) {
        pageNo.value = 1
        return await load()
      }
      // (2) 越界 → 跳到最后一个非空页
      const lastPage = Math.ceil(total.value / limit.value)
      if (lastPage >= 1 && lastPage < pageNo.value) {
        pageNo.value = lastPage
        return await load()
      }
    }
    return true
  }

  async function reloadAfterDelete() {
    await load()
  }

  // 换每页容量：回第 1 页再拉。无参 —— 新容量已通过 v-model:size 同步进 limit，事件只负责通知
  function setPageSize() {
    pageNo.value = 1
    return load()
  }

  return { list, pageNo, limit, total, loading, load, reloadAfterDelete, setPageSize }
}
