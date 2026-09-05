<script setup lang="ts">
import Logo from '@/layout/logo/index.vue'
import Menu from '@/layout/menu/index.vue'
import Main from '@/layout/main/index.vue'
import TabBar from '@/layout/tabbar/index.vue'
import { useRoute } from 'vue-router'
import { usePermissionStore } from '@/stores/permission'
import { useSettingStore } from '@/stores/setting'
const settingStore = useSettingStore()
const permissionStore = usePermissionStore()
const route = useRoute()
</script>
<template>
  <div class="layout_container" :class="{ collapsed: settingStore.fold }">
    <!-- 左侧菜单 -->
    <div class="layout_slider">
      <!-- Logo -->
      <Logo></Logo>
      <!-- 展示菜单 -->
      <el-scrollbar class="scrollbar">
        <el-menu
          class="menu"
          :router="true"
          :default-active="route.path"
          :collapse="settingStore.fold"
          :collapse-transition="false"
        >
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
  // 统一设置侧边栏宽度
  --menu-width: #{$base-menu-width};

  &.collapsed {
    --menu-width: #{$base-menu-collapsed-width};
  }

  .layout_slider {
    width: var(--menu-width);
    height: 100vh;
    background-color: $base-menu-background;
    color: white;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

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
    left: var(--menu-width);
    z-index: $z-tabbar;
    width: calc(100% - var(--menu-width));
    height: $base-tabbar-height;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .layout_main {
    position: absolute;
    // 关键：非 auto 的 z-index 让内容区形成独立层叠上下文，
    // 内部组件（el-table sticky 头、固定列等）的 z-index 永不外溢压过外壳
    z-index: 0;
    left: var(--menu-width);
    top: $base-tabbar-height;
    padding: 10px;
    width: calc(100% - var(--menu-width));
    height: calc(100vh - $base-tabbar-height);
    // 防止内容溢出
    overflow: auto;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
}
</style>
