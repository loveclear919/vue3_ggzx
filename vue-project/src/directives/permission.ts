import type { Directive } from 'vue'
import { useUserStore } from '@/stores/user'

// 按钮级权限指令：v-permission="'user:delete'"
// codes 不含绑定值 → display:none。用 display 切换而非 removeChild：可逆，且不破坏 Vue 的 vnode 对账。
// mounted + updated 双钩子：登录/登出/重新拉取导致 codes 变化后，按钮状态随之同步。
// 注意：这只是体验层（藏按钮），真正的裁决在后端 requirePermission 403
function toggle(el: HTMLElement, code: string | undefined) {
  if (!code) return
  el.style.display = useUserStore().hasCode(code) ? '' : 'none'
}

export const permission: Directive<HTMLElement, string> = {
  mounted(el, binding) {
    toggle(el, binding.value)
  },
  updated(el, binding) {
    toggle(el, binding.value)
  },
}
