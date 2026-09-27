<script setup lang="ts">
import { useSettingStore } from '@/stores/setting'
const settingStore = useSettingStore()
</script>
<template>
  <router-view v-slot="{ Component, route }">
    <transition name="fade" mode="out-in">
      <keep-alive :include="['Spu']">
        <component :is="Component" :key="route.fullPath" v-if="!settingStore.refresh"></component>
      </keep-alive>
    </transition>
  </router-view>
</template>
<style scoped lang="scss">
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: all 0.3s ease;
}

.fade-enter-to,
.fade-leave-from {
  opacity: 1;
}
</style>
