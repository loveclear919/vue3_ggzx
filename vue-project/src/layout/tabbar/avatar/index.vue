<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Lock, Right, User } from '@element-plus/icons-vue'
import { useRouter, useRoute } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { useUserStore } from '@/stores/user'
import { changePassword, updateUserInfo } from '@/api/user'
// 注意：Components 插件 dirs 为空、无目录自动注册，组件必须显式 import
import ImageUploader from '@/components/image-uploader/index.vue'

const $router = useRouter()
const $route = useRoute()
const userStore = useUserStore()

const logout = () => {
  userStore.logout()
  $router.push({ path: '/login', query: { redirect: $route.path } })
}

// ---- 个人资料弹窗：本人可改展示名（username）+ 头像，手机号只读 ----
const profileVisible = ref(false)
const savingProfile = ref(false)
const profileFormRef = ref<FormInstance>()
const profileForm = reactive({ username: '' })
const profileRules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度 3-20 个字符', trigger: 'blur' },
  ],
}

// ImageUploader 的模型是图片数组；头像最多 1 张，用「数组 ↔ 单值」桥接
type AvatarImage = { imageUrl: string; imageName: string }
const avatarImages = ref<AvatarImage[]>([])

// 头像预览：待上传的新图 > 已保存的头像；都没有时用默认图（默认图不进库，只是展示）
const pendingAvatar = computed(
  () => avatarImages.value[0]?.imageUrl ?? userStore.userInfo?.avatar ?? '',
)

const openProfile = () => {
  profileForm.username = userStore.userInfo?.username ?? ''
  avatarImages.value = userStore.userInfo?.avatar
    ? [{ imageUrl: userStore.userInfo.avatar, imageName: '' }]
    : []
  profileVisible.value = true
}

const handleSaveProfile = async () => {
  const valid = await profileFormRef.value?.validate().catch(() => false)
  if (!valid) return

  savingProfile.value = true
  try {
    await updateUserInfo({
      username: profileForm.username,
      avatar: avatarImages.value[0]?.imageUrl ?? '',
    })
    // 以服务端为准刷新 store，顶栏头像与用户名随之更新
    await userStore.fetchUserInfo()
    ElMessage.success('保存成功')
    profileVisible.value = false
  } catch {
    // 失败提示由拦截器弹出（如 409 用户名已存在）
  } finally {
    savingProfile.value = false
  }
}

// ---- 修改密码弹窗：独立于个人资料（原密码校验是独立流程） ----
const passwordVisible = ref(false)
const savingPassword = ref(false)
const passwordFormRef = ref<FormInstance>()
const passwordForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })
const passwordRules: FormRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== passwordForm.newPassword) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
}

const openPassword = () => {
  passwordForm.oldPassword = ''
  passwordForm.newPassword = ''
  passwordForm.confirmPassword = ''
  passwordFormRef.value?.clearValidate()
  passwordVisible.value = true
}

const handleSavePassword = async () => {
  const valid = await passwordFormRef.value?.validate().catch(() => false)
  if (!valid) return

  savingPassword.value = true
  try {
    await changePassword({
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword,
    })
    ElMessage.success('密码修改成功')
    passwordVisible.value = false
  } catch {
    // 失败提示由拦截器弹出（如原密码不正确）
  } finally {
    savingPassword.value = false
  }
}
</script>
<template>
  <div class="avatar-wrapper">
    <!-- 有自定义头像时优先展示，否则回退默认图 -->
    <img v-if="userStore.userInfo?.avatar" :src="userStore.userInfo.avatar" alt="" />
    <img v-else src="@/assets/images/avatar.gif" alt="" />
    <el-card>
      <template #header>
        <div class="card-header">
          <span>{{ userStore.userInfo?.username }}</span>
        </div>
      </template>
      <button class="user-btn" type="button" @click="openProfile">
        <el-icon>
          <User />
        </el-icon>
        <span>个人资料</span>
      </button>
      <button class="user-btn" type="button" @click="openPassword">
        <el-icon>
          <Lock />
        </el-icon>
        <span>修改密码</span>
      </button>
      <template #footer>
        <button class="logout-btn" type="button" @click="logout">
          <el-icon>
            <Right />
          </el-icon>
          <span>退出登录</span>
        </button>
      </template>
    </el-card>

    <!-- 个人资料弹窗（destroy-on-close 约定：关闭即销毁，不残留上次的表单状态） -->
    <el-dialog
      v-model="profileVisible"
      title="个人资料"
      width="480px"
      append-to-body
      destroy-on-close
    >
      <el-form ref="profileFormRef" :model="profileForm" :rules="profileRules" label-width="80px">
        <el-form-item label="用户名" prop="username">
          <el-input
            v-model="profileForm.username"
            placeholder="3-20 个字符"
            maxlength="20"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input :model-value="userStore.userInfo?.phone ?? ''" disabled />
        </el-form-item>
        <el-form-item label="头像">
          <div class="avatar-editor">
            <ImageUploader v-model="avatarImages" :max="1" />
            <div class="avatar-preview">
              <span class="preview-label">预览</span>
              <img v-if="pendingAvatar" :src="pendingAvatar" alt="" />
              <img v-else src="@/assets/images/avatar.gif" alt="" />
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="profileVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingProfile" @click="handleSaveProfile"
          >确定</el-button
        >
      </template>
    </el-dialog>

    <!-- 修改密码弹窗（destroy-on-close 约定） -->
    <el-dialog
      v-model="passwordVisible"
      title="修改密码"
      width="480px"
      append-to-body
      destroy-on-close
    >
      <el-form
        ref="passwordFormRef"
        :model="passwordForm"
        :rules="passwordRules"
        label-width="80px"
      >
        <el-form-item label="原密码" prop="oldPassword">
          <el-input
            v-model="passwordForm.oldPassword"
            type="password"
            placeholder="请输入原密码"
            show-password
          />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="passwordForm.newPassword"
            type="password"
            placeholder="至少 6 位"
            show-password
          />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="passwordForm.confirmPassword"
            type="password"
            placeholder="请再次输入新密码"
            show-password
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingPassword" @click="handleSavePassword"
          >确定</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>
<style scoped lang="scss">
.avatar-wrapper {
  position: relative;
  padding: 12px;

  img {
    position: relative;
    z-index: 10;
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
    z-index: 9;
    color: var(--el-text-color-regular);

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
      background-color: var(--el-fill-color-light);
    }

    .card-header {
      font-size: 16px;
      font-weight: bold;
      text-align: center;
      padding: 12px 0 0;
    }
  }
}

// 弹窗内头像编辑区：上传器 + 即时预览并排
.avatar-editor {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.avatar-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;

  .preview-label {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  img {
    position: static;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    object-fit: cover;
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
