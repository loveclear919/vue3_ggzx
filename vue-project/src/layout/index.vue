<script setup lang="ts">
import Logo from '@/layout/logo/index.vue'
import Menu from '@/layout/menu/index.vue'
import Main from '@/layout/main/index.vue'
import TabBar from '@/layout/tabbar/index.vue'
import { useRoute } from 'vue-router'
import { usePermissionStore } from '@/stores/permission'
const permissionStore = usePermissionStore()
const route = useRoute()
console.log(route)
</script>
<template>
  <div class="layout_container">
    <!-- 左侧菜单 -->
    <div class="layout_slider">
      <!-- Logo -->
      <Logo></Logo>
      <!-- 展示菜单 -->
      <el-scrollbar class="scrollbar">
        <el-menu class="menu" :router="true" :default-active="route.path">
          <Menu :menuList="permissionStore.routes"></Menu>
        </el-menu>
      </el-scrollbar>
    </div>
    <!-- 顶部导航 -->
    <div class="layout_tabbar">
      <TabBar></TabBar>
    </div>
    <!-- 内容展示区域 -->
    <div class="layout_main">
      <Main></Main>
    </div>
  </div>
</template>
<style scoped lang="scss">
.layout_container {
  position: relative;
  width: 100%;
  height: 100vh;
  background-color: white;

  .layout_slider {
    width: $base-menu-width;
    height: 100vh;
    background-color: $base-menu-background;
    color: white;

    .scrollbar {
      width: 100%;
      height: calc(100vh - $base-menu-logo-height);

      .menu {
        --el-menu-bg-color: $vivo-dark;
        --el-menu-text-color: white;
        --el-menu-hover-bg-color: rgba(255, 255, 255, 0.1);
        border-right: none;
      }
    }
  }

  .layout_tabbar {
    position: fixed;
    top: 0;
    left: $base-menu-width;
    width: calc(100% - $base-menu-width);
    height: $base-tabbar-height;
  }

  .layout_main {
    position: absolute;
    left: $base-menu-width;
    top: $base-tabbar-height;
    padding: 10px;
    width: calc(100% - $base-menu-width);
    height: calc(100vh - $base-tabbar-height);
    // 防止内容溢出
    overflow: auto;
    background-color: skyblue;
  }
}
</style>
