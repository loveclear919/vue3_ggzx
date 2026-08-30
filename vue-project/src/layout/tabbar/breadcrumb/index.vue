<script setup lang="ts">
import { Fold, Expand, Minus } from '@element-plus/icons-vue'
import { useSettingStore } from '@/stores/setting'
import { useRoute } from 'vue-router'
import { getMenuIcon } from '@/utils/iconMap'
import { computed } from 'vue'
const $route = useRoute()
const settingStore = useSettingStore()
const changeIcon = () => {
  settingStore.fold = !settingStore.fold
}
const bread = computed(() => {
  return $route.matched.filter((item) => item.meta.title && item.meta.hidden !== true)
})
</script>
<template>
  <div class="breadcrumb">
    <el-icon class="breadcrumb-icon" @click="changeIcon" @mousedown.prevent>
      <Fold v-if="!settingStore.fold" />
      <Expand v-else />
    </el-icon>
    <el-breadcrumb :separator-icon="Minus">
      <el-breadcrumb-item
        v-for="(item, index) in bread"
        :key="item.path"
        :to="index < bread.length - 1 ? item.path : undefined"
      >
        <el-icon>
          <component :is="getMenuIcon(item.meta.icon)"></component>
        </el-icon>
        <span>{{ item.meta.title }}</span>
      </el-breadcrumb-item>
    </el-breadcrumb>
  </div>
</template>
<style scoped lang="scss">
.breadcrumb {
  display: flex;
  align-items: center;
  margin-left: 15px;

  .breadcrumb-icon {
    margin-right: 20px;
    font-size: $base-menu-icon-size;
  }

  .el-breadcrumb {
    // 每个项内部：图标 + 文字 用 flex 垂直居中，间距交给 gap
    :deep(.el-breadcrumb__inner) {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
  }
}
</style>
