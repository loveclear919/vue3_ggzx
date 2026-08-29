<script setup lang="ts">
import { ArrowRight, Fold } from '@element-plus/icons-vue'
</script>
<template>
  <div class="tabbar">
    <div class="tabbar-left">
      <el-icon>
        <Fold />
      </el-icon>
      <el-breadcrumb :separator-icon="ArrowRight">
        <el-breadcrumb-item :to="{ path: '/' }">homepage</el-breadcrumb-item>
        <el-breadcrumb-item>promotion management</el-breadcrumb-item>
        <el-breadcrumb-item>promotion list</el-breadcrumb-item>
        <el-breadcrumb-item>promotion detail</el-breadcrumb-item>
      </el-breadcrumb>
    </div>
    <div class="tabbar-right"></div>
  </div>
</template>
<style scoped lang="scss">
:deep(.el-icon) {
  font-size: $base-menu-icon-size;
}

.tabbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 100%;

  .tabbar-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }
}
</style>
