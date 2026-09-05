import { defineStore } from 'pinia'
import { nextTick, ref } from 'vue'

export const useSettingStore = defineStore('setting', () => {
  const fold = ref(false)
  const refresh = ref(false)

  // 刷新页面
  async function refreshPage() {
    refresh.value = true
    await nextTick()
    refresh.value = false
  }

  // 全屏
  async function fullScreen() {
    let full = document.fullscreenElement
    if (!full) {
      document.documentElement.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }
  return { fold, refresh, refreshPage, fullScreen }
})
