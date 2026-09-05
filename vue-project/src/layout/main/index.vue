<script setup lang="ts">
import { useSettingStore } from '@/stores/setting'
const settingStore = useSettingStore()
</script>
<template>
  <router-view v-slot="{ Component }">
    <transition name="fade" mode="out-in">
      <component :is="Component" v-if="!settingStore.refresh" />
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
