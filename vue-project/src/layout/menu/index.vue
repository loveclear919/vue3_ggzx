<script setup lang="ts">
import { getMenuIcon } from '@/layout/menu/iconMap'
import type { RouteRecordRaw } from 'vue-router'
defineProps<{ menuList: RouteRecordRaw[] }>()
defineOptions({ name: 'AppMenu' })
</script>

<template>
  <template v-for="item in menuList" :key="item.path">
    <template v-if="!item.meta?.hidden">
      <!-- 有子路由 -->
      <el-sub-menu v-if="item.children?.length" :index="item.path">
        <template #title>
          <el-icon>
            <component :is="getMenuIcon(item.meta?.icon)" />
          </el-icon>
          <span>{{ item.meta?.title }}</span>
        </template>
        <!-- 循环 每个child渲染成菜单项 -->
        <!-- <el-menu-item v-for="child in item.children" :key="child.path" :index="child.path">
          <span>{{ child.meta.title }}</span>
        </el-menu-item> -->
        <!-- 递归 -->
        <AppMenu :menuList="item.children || []" />
      </el-sub-menu>
      <!-- 无子路由 -->
      <el-menu-item v-else :index="item.path">
        <el-icon>
          <component :is="getMenuIcon(item.meta?.icon)" />
        </el-icon>
        <template #title>
          <span>{{ item.meta?.title }}</span>
        </template>
      </el-menu-item>
    </template>
  </template>
</template>

<style scoped lang="scss">
:deep(.el-icon) {
  font-size: $base-menu-icon-size;
}
</style>
