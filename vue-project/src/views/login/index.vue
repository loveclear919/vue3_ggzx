<script setup lang="ts">
import { reactive, ref } from 'vue'
import { Iphone, Lock } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { usePermissionStore } from '@/stores/permission'
import { useRoute, useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { getTimePeriod } from '@/utils/time'
import { PHONE_REGEX } from '@/utils/phone'
import { findLandingPath, isPathAccessible } from '@/utils/routeAccess'

const userStore = useUserStore()
const $router = useRouter()
const $route = useRoute()

// 卡片翻转状态：false = 注册面（正面），true = 登录面（背面）
const flipped = ref(false)

// 两个表单各自独立的数据（登录凭据是手机号，用户名是注册后自动生成的展示名）
const registerForm = reactive({
  phone: '',
  password: '',
  confirmPassword: '',
})

const loginForm = reactive({
  phone: '',
  password: '',
})

// 获取表单实例
const registerFormRef = ref<FormInstance>()
const loginFormRef = ref<FormInstance>()

// 注册表单校验规则 — 文案与后端 Schema 校验保持一致；手机号严格正则（不做清洗）
const registerRules: FormRules = {
  phone: [
    { type: 'string', required: true, message: '请输入手机号', trigger: 'blur' },
    { type: 'string', pattern: PHONE_REGEX, message: '手机号格式不正确', trigger: 'blur' },
  ],
  password: [
    { type: 'string', required: true, message: '请输入密码', trigger: 'blur' },
    { type: 'string', min: 6, message: '密码至少 6 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { type: 'string', required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      type: 'string',
      validator: (_rule, value, callback) => {
        if (value !== registerForm.password) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
}

// 登录表单校验规则
const loginRules: FormRules = {
  phone: [
    { type: 'string', required: true, message: '请输入手机号', trigger: 'blur' },
    { type: 'string', pattern: PHONE_REGEX, message: '手机号格式不正确', trigger: 'blur' },
  ],
  password: [{ type: 'string', required: true, message: '请输入密码', trigger: 'blur' }],
}

// 登录业务
const login = async () => {
  // ① 前端校验优先：不通过直接拦截，不发请求
  const valid = await loginFormRef.value?.validate().catch(() => false)
  if (!valid) return

  try {
    await userStore.login(loginForm.phone, loginForm.password)
    // 支持路由守卫传来的 redirect 参数，登录后跳回原页面。
    // 落地页必须可达（permission store 此刻已按 codes 过滤）：
    // redirect 无权限 / 无 redirect 时回退到第一个可达菜单 —— 无 /home 权限的角色不再停在裸 404
    const redirect = typeof $route.query.redirect === 'string' ? $route.query.redirect : ''
    const routes = usePermissionStore().routes
    const redirectPath = redirect.split('?')[0] ?? ''
    const target =
      redirectPath && isPathAccessible(redirectPath, routes)
        ? redirect
        : (findLandingPath(routes, userStore.userInfo?.codes ?? []) ?? '/404')
    // 先跳转、后问候：await 等导航完成（含异步路由组件加载、页面挂载），
    // 慢网速下问候弹窗也在页面渲染完之后才登场，而不是对着白屏一闪而过
    await $router.push(target)
    ElNotification.success({
      title: `${getTimePeriod()}好!`,
      // 优先展示名（username），未改名时回退到手机号
      message: `欢迎回来，${userStore.userInfo?.username ?? loginForm.phone}!`,
    })
  } catch {
    // ② 绕过前端的请求由后端兜底，错误提示已由响应拦截器弹出
  }
}

// 注册业务
const register = async () => {
  // ① 前端校验优先
  const valid = await registerFormRef.value?.validate().catch(() => false)
  if (!valid) return

  try {
    await userStore.register(registerForm.phone, registerForm.password)
    ElNotification.success({ title: '注册成功', message: '请登录你的新账号' })
    // 清空敏感字段，翻到登录面
    registerForm.password = ''
    registerForm.confirmPassword = ''
    flipped.value = true
  } catch (e) {
    // ② 后端兜底（如手机号已存在），提示由拦截器弹出
    console.error('[register] 注册失败:', e)
  }
}
</script>

<template>
  <div class="login-container">
    <el-row class="login-row">
      <el-col :span="0" :lg="12" class="left-panel"></el-col>
      <el-col :span="24" :lg="12" class="right-panel">
        <!-- 3D 翻转容器 -->
        <div class="flip-card">
          <div class="flip-inner" :class="{ flipped }">
            <!-- 正面：注册表单 -->
            <div class="flip-face front">
              <h2>欢迎注册</h2>
              <p>创建你的新账号</p>
              <el-form ref="registerFormRef" :model="registerForm" :rules="registerRules">
                <el-form-item prop="phone">
                  <el-input
                    v-model="registerForm.phone"
                    placeholder="请输入手机号"
                    size="large"
                    :prefix-icon="Iphone"
                    maxlength="11"
                  />
                </el-form-item>
                <el-form-item prop="password">
                  <el-input
                    v-model="registerForm.password"
                    type="password"
                    placeholder="请输入密码"
                    size="large"
                    :prefix-icon="Lock"
                    show-password
                  />
                </el-form-item>
                <el-form-item prop="confirmPassword">
                  <el-input
                    v-model="registerForm.confirmPassword"
                    type="password"
                    placeholder="请再次输入密码"
                    size="large"
                    :prefix-icon="Lock"
                    show-password
                  />
                </el-form-item>
                <el-button type="primary" size="large" class="submit-btn" round @click="register">
                  注 册
                </el-button>
              </el-form>
              <div class="switch-link" @click="flipped = true">已有账号？去登录</div>
            </div>
            <!-- 背面：登录表单 -->
            <div class="flip-face back">
              <h2>欢迎回来</h2>
              <p>登录你的账号</p>
              <el-form ref="loginFormRef" :model="loginForm" :rules="loginRules">
                <el-form-item prop="phone">
                  <el-input
                    v-model="loginForm.phone"
                    placeholder="请输入手机号"
                    size="large"
                    :prefix-icon="Iphone"
                    maxlength="11"
                  />
                </el-form-item>
                <el-form-item prop="password">
                  <el-input
                    v-model="loginForm.password"
                    type="password"
                    placeholder="请输入密码"
                    size="large"
                    :prefix-icon="Lock"
                    show-password
                  />
                </el-form-item>
                <el-button type="primary" size="large" class="submit-btn" round @click="login">
                  登 录
                </el-button>
              </el-form>
              <div class="switch-link" @click="flipped = false">没有账号？去注册</div>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped lang="scss">
.login-container {
  width: 100vw;
  height: 100vh;
  background: url('@/assets/images/login_bg.svg') no-repeat center center / cover;
  background-color: var(--el-bg-color-page);
  display: flex;
  justify-content: center;
  align-items: center;

  .login-row {
    width: 96.5vw;
    height: 94vh;
    padding: 0 5vw;
    // 80% 磨砂白：随主题取底色再降不透明度，暗色下自动变成 80% 深色
    background-color: color-mix(in srgb, var(--el-bg-color) 80%, transparent);
    border-radius: 10px;
  }

  .left-panel {
    height: 100%;
    background: url('@/assets/images/login_left.png') no-repeat center center / contain;
  }

  .right-panel {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ---- 3D 翻转核心 ---- */
  .flip-card {
    width: 100%;
    max-width: 420px;
    // 透视距离：越小 3D 感越强
    perspective: 1200px;
  }

  .flip-inner {
    position: relative;
    // 关键：子元素保留在 3D 空间里，否则翻转不成立
    transform-style: preserve-3d;
    transition: transform 0.6s cubic-bezier(0.4, 0.2, 0.2, 1);

    &.flipped {
      transform: translateZ(-100px) rotateY(180deg);
    }
  }

  .flip-face {
    width: 100%;
    padding: 48px 40px 40px;
    background-color: var(--el-bg-color);
    border-radius: 16px;
    box-shadow: 0 12px 32px rgba(31, 45, 61, 0.08);
    // 关键：看不到自己的背面
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;

    h2 {
      margin-bottom: 8px;
      font-size: 1.75rem;
      text-align: center;
    }

    p {
      margin-bottom: 32px;
      font-size: 0.875rem;
      color: var(--el-text-color-secondary);
      text-align: center;
    }

    .el-form-item {
      margin-bottom: 24px;
    }

    .submit-btn {
      width: 100%;
      margin-top: 8px;
      letter-spacing: 4px;
    }

    .switch-link {
      margin-top: 20px;
      font-size: 0.875rem;
      color: var(--el-color-primary);
      text-align: center;
      cursor: pointer;

      &:hover {
        text-decoration: underline;
      }
    }

    // 背面：预先转 180°，并绝对定位叠在正面上，保证两面同尺寸
    &.back {
      position: absolute;
      inset: 0;
      transform: translateZ(-100px) rotateY(180deg);
      // 登录面内容少，垂直居中视觉更平衡
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
  }
}
</style>
