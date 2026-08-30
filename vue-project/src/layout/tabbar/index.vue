<script setup lang="ts">
import { Refresh, FullScreen, Setting } from '@element-plus/icons-vue'
import Breadcrumb from './breadcrumb/index.vue'
import Avatar from './avatar/index.vue'
</script>
<template>
  <div class="tabbar">
    <Breadcrumb />
    <div class="tabbar-right">
      <Avatar />
      <el-button type="primary" circle :icon="Refresh"></el-button>
      <el-button type="primary" circle :icon="FullScreen"></el-button>
      <el-button type="primary" circle :icon="Setting"></el-button>
    </div>
  </div>
</template>
<style scoped lang="scss">
.tabbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 100%;

  .tabbar-right {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-right: 30px;
    gap: 20px;
  }
}
</style>
