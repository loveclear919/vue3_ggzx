import { createRouter, createWebHistory } from 'vue-router'
import { constantRoutes } from './routes'
import { setupGuards } from './guards'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: constantRoutes,
  // 滚动行为
  scrollBehavior() {
    return { top: 0, left: 0 }
  },
})

// 注册全部导航守卫（认证、记录访问路径等）
setupGuards(router)

export default router
