import { defineStore } from 'pinia'
import { nextTick, onScopeDispose, ref } from 'vue'
import { THEME_KEY } from '@/utils/storage'

// 主题三态：亮色 / 暗色 / 跟随系统
export type ThemeMode = 'light' | 'dark' | 'auto'

export const useSettingStore = defineStore('setting', () => {
  const fold = ref(false)
  // 用户是否手动点过折叠开关：手动选择优先，视口自动折叠/恢复不得覆盖（见 layout 的 matchMedia 逻辑）
  const foldManual = ref(false)
  const refresh = ref(false)

  function toggleFold() {
    fold.value = !fold.value
    foldManual.value = true
  }

  // ---- 主题 ----
  // index.html 的内联脚本已按同一份 localStorage 值防过闪烁，此处只做状态接管与后续切换
  const theme = ref<ThemeMode>((localStorage.getItem(THEME_KEY) as ThemeMode | null) ?? 'auto')
  const systemDark = matchMedia('(prefers-color-scheme: dark)')

  // 把状态翻译成 html 上的 class（EP 暗色变量的作用域就是 html.dark）
  function applyTheme() {
    const isDark = theme.value === 'dark' || (theme.value === 'auto' && systemDark.matches)
    document.documentElement.classList.toggle('dark', isDark)
  }

  function setTheme(mode: ThemeMode) {
    theme.value = mode
    localStorage.setItem(THEME_KEY, mode)
    applyTheme()
  }

  // 跟随系统：auto 模式下响应系统主题实时变化（切到 light/dark 后则忽略）
  const handleSystemThemeChange = () => {
    if (theme.value === 'auto') applyTheme()
  }
  systemDark.addEventListener('change', handleSystemThemeChange)
  // 作用域销毁时自动移除全局 matchMedia 监听，防止叠加
  onScopeDispose(() => {
    systemDark.removeEventListener('change', handleSystemThemeChange)
  })

  // 与内联脚本幂等对齐：脚本只保证首帧正确，这里保证运行时状态一致
  applyTheme()

  // 刷新页面
  async function refreshPage() {
    refresh.value = true
    await nextTick()
    refresh.value = false
  }

  // 全屏
  async function fullScreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      ElMessage.warning('浏览器拒绝全屏操作')
    }
  }
  return { fold, foldManual, toggleFold, refresh, refreshPage, fullScreen, theme, setTheme }
})
