<script setup lang="ts">
import { useRouter } from 'vue-router'
import { usePermissionStore } from '@/stores/permission'
import { findFirstAccessiblePath } from '@/utils/routeAccess'

const router = useRouter()

// 返回入口走第一个可达菜单（而非写死 /home）：无该权限的角色不会又被弹回 404 死循环
const goHome = () => {
  const path = findFirstAccessiblePath(usePermissionStore().routes) ?? '/'
  router.push(path)
}
</script>

<template>
  <div class="not-found">
    <h1>404</h1>
    <p>页面不存在或没有访问权限</p>
    <el-button type="primary" @click="goHome">返回首页</el-button>
  </div>
</template>

<style scoped lang="scss">
.not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  height: 100vh;

  h1 {
    font-size: 72px;
    color: var(--el-text-color-primary);
  }

  p {
    color: var(--el-text-color-secondary);
  }
}
</style>
