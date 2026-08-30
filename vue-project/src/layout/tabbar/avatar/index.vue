<script setup lang="ts">
import { Right, User } from '@element-plus/icons-vue'
</script>
<template>
  <div class="avatar-wrapper">
    <img src="@/assets/images/avatar.gif" alt="" />
    <el-card>
      <template #header>
        <div class="card-header">
          <span>Loveclear</span>
        </div>
      </template>
      <button class="user-btn" type="button">
        <el-icon>
          <User />
        </el-icon>
        <span>个人中心</span>
      </button>
      <template #footer>
        <button class="logout-btn" type="button">
          <el-icon>
            <Right />
          </el-icon>
          <span>退出登录</span>
        </button>
      </template>
    </el-card>
  </div>
</template>
<style scoped lang="scss">
.avatar-wrapper {
  position: relative;
  padding: 12px;

  img {
    position: relative;
    z-index: 2;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
  }

  .el-card {
    position: absolute;
    top: 0;
    transform: translate(-125px, 55px);
    opacity: 0;
    visibility: hidden;
    width: 240px;
    z-index: 1;
    color: #61666d;

    .el-icon {
      margin-right: 8px;
    }

    .user-btn,
    .logout-btn {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      width: 100%;
      padding: 10px;
      border-radius: 8px;
      background: transparent;
      cursor: pointer;
    }

    .user-btn:hover,
    .logout-btn:hover {
      background-color: #e3e5e7;
    }

    .card-header {
      font-size: 16px;
      font-weight: bold;
      text-align: center;
      padding: 12px 0 0;
    }
  }
}

.avatar-wrapper:hover img {
  transform: translate(-25px, 15px) scale(1.5);
  transition: all 0.2s ease-in-out;
}

.avatar-wrapper:hover .el-card {
  opacity: 1;
  visibility: visible;
  transition: all 0.2s ease-in-out;
}
</style>
