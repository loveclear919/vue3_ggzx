import { ref } from 'vue'

// 只认最后一次请求：快速连续触发时，过期响应的结果与 loading 收尾都被丢弃（防竞态）。
//
// 语义边界（三个「不是」）：
// 1. 每个 fetch 场景创建自己的实例，不要全局共享 —— 「最后一次」是场景内的语义，
//    共享会把 A 场景的请求当成 B 场景的过期请求
// 2. 不是「取消」：过期请求仍会跑完、照常消耗网络；要真正中断需配合 AbortController
//    （task 接收 signal、过期时 abort）—— 当前量级不需要，留作升级路径
// 3. 不是「防抖」：不减少请求数量；要减少请求数需配合 debounce ——
//    点击类触发（下钻/翻页/切分类）不应防抖，将来搜索框输入场景再引入
export function useLatestRequest() {
  let seq = 0
  const loading = ref(false)

  async function run<T>(task: () => Promise<T>): Promise<T | undefined> {
    const current = ++seq
    loading.value = true
    try {
      const result = await task()
      if (current === seq) return result // 是最新一次 → 返回结果
    } catch {
      // 错误提示已由响应拦截器统一弹出，这里静默
    } finally {
      if (current === seq) loading.value = false // 只有最新一次负责收尾
    }
    return undefined // 过期响应 → 调用方拿不到结果，天然丢弃
  }

  return { loading, run }
}
