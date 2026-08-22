<script setup lang="ts">
import zhCn from 'element-plus/es/locale/lang/zh-cn'
</script>

<template>
  <!-- 按需引入模式下通过 ConfigProvider 下发中文语言包（替代 app.use(ElementPlus, { locale })） -->
  <el-config-provider :locale="zhCn">
    <router-view />
  </el-config-provider>
</template>

<style scoped lang="scss"></style>
