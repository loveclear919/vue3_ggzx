<script setup lang="ts">
import { computed, type Component } from 'vue'
import { Refresh, FullScreen, Sunny, Moon, Monitor, Check } from '@element-plus/icons-vue'
import Breadcrumb from './breadcrumb/index.vue'
import Avatar from './avatar/index.vue'
import { useSettingStore } from '@/stores/setting'
import type { ThemeMode } from '@/stores/setting'
const settingStore = useSettingStore()

// 三态主题：value/label/icon 一处维护（避免两份映射表 key 漂移）
const themeOptions: Array<{ value: ThemeMode; label: string; icon: Component }> = [
  { value: 'light', label: '亮色', icon: Sunny },
  { value: 'dark', label: '暗色', icon: Moon },
  { value: 'auto', label: '跟随系统', icon: Monitor },
]
const themeIcon = computed(
  () => themeOptions.find((opt) => opt.value === settingStore.theme)?.icon ?? Sunny,
)

// el-dropdown 的 command 类型是宽泛的 string | number | object，在此收口后再交给 store
const handleThemeCommand = (command: string | number | object) => {
  settingStore.setTheme(command as ThemeMode)
}
</script>
<template>
  <div class="tabbar">
    <Breadcrumb />
    <div class="tabbar-right">
      <Avatar />
      <el-button
        type="primary"
        circle
        :icon="Refresh"
        @click="settingStore.refreshPage()"
      ></el-button>
      <el-button
        type="primary"
        circle
        :icon="FullScreen"
        @click="settingStore.fullScreen()"
      ></el-button>
      <!-- 主题三态切换：图标随当前模式变化，下拉里打勾标记当前项 -->
      <!-- placement=bottom-end：菜单右边缘对齐按钮，向内（左）展开。
           默认的 bottom 是 start 对齐，会向右溢出视口 —— popper 挂在 body 上且是 absolute，
           超出部分会撑出文档横向滚动条 -->
      <el-dropdown trigger="click" placement="bottom-end" @command="handleThemeCommand">
        <el-button type="primary" circle :icon="themeIcon"></el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-for="opt in themeOptions"
              :key="opt.value"
              :command="opt.value"
              :class="{ 'is-theme-active': settingStore.theme === opt.value }"
            >
              <el-icon style="margin-right: 8px">
                <component :is="opt.icon" />
              </el-icon>
              {{ opt.label }}
              <el-icon v-if="settingStore.theme === opt.value" style="margin-left: 8px">
                <Check />
              </el-icon>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
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

    // flex 容器用 gap 统一控制间距，抵消 EP 的 .el-button + .el-button 相邻兄弟 margin
    .el-button + .el-button {
      margin-left: 0;
    }
  }
}
</style>
