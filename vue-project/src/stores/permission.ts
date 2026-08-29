import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { RouteRecordRaw } from 'vue-router'
import { menuRoutes as staticMenuRoutes } from '@/router/routes'

export const usePermissionStore = defineStore('permission', () => {
  const routes = ref<RouteRecordRaw[]>(staticMenuRoutes)
  return { routes }
})
