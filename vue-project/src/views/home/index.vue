<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Monitor } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()
</script>

<template>
  <div class="home-page">
    <el-card shadow="never" class="welcome-card">
      <h2>你好，{{ userStore.userInfo?.username ?? '朋友' }}</h2>
      <p>欢迎使用商品运营管理后台 —— 从这里开始管理你的品牌、商品与团队权限。</p>
    </el-card>

    <!-- 数据大屏入口：v-permission 控显隐（无 /screen 权限的用户不可见），全屏页的显式正向入口 -->
    <el-card
      v-permission="'/screen'"
      shadow="never"
      class="entry-card"
      @click="router.push('/screen')"
    >
      <div class="entry-body">
        <el-icon :size="28" color="#00e5ff"><Monitor /></el-icon>
        <div>
          <h3>商品运营数据大屏</h3>
          <p>全屏展示商品运营实时指标（库存总价值 / 价格带 / 品牌货值 / 待办 SKU）</p>
        </div>
      </div>
    </el-card>
  </div>
</template>

<style scoped lang="scss">
.home-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.welcome-card {
  h2 {
    margin-bottom: 8px;
  }
  p {
    color: var(--el-text-color-secondary);
  }
}

.entry-card {
  cursor: pointer;
  transition: box-shadow 0.2s;

  &:hover {
    box-shadow: var(--el-box-shadow-light);
  }

  .entry-body {
    display: flex;
    align-items: center;
    gap: 16px;

    h3 {
      margin-bottom: 4px;
    }
    p {
      color: var(--el-text-color-secondary);
      font-size: 13px;
    }
  }
}
</style>
