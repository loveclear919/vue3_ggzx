<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { createUser, updateUser } from '@/api/acl/user'
import type { UserRow } from '@/api/acl/user/type'
import { PHONE_REGEX } from '@/utils/phone'

// 新增 / 编辑共用弹窗：editingRow 为 null 即新增模式（单变量模式，与 role/edit-dialog 一致）
const dialogVisible = defineModel<boolean>({ required: true })
const props = defineProps<{ editingRow: UserRow | null }>()
const emit = defineEmits<{ success: [] }>()

const dialogTitle = computed(() => (props.editingRow ? '编辑用户' : '新增用户'))

const formRef = ref<FormInstance>()
const form = ref({
  username: '',
  phone: '',
  password: '',
  desc: '',
})

// 规则与后端 User 模型对齐（手机号严格正则、用户名 3-20、密码 ≥6）；
// 新增只填手机号（用户名自动生成），编辑只改用户名（手机号是身份，白名单不含 phone）
const formRules = computed<FormRules>(() => ({
  username: props.editingRow
    ? [
        { required: true, message: '请输入用户名', trigger: 'blur' },
        { min: 3, max: 20, message: '用户名长度 3-20 个字符', trigger: 'blur' },
      ]
    : [],
  phone: props.editingRow
    ? []
    : [
        { required: true, message: '请输入手机号', trigger: 'blur' },
        { pattern: PHONE_REGEX, message: '手机号格式不正确', trigger: 'blur' },
      ],
  password: props.editingRow
    ? []
    : [
        { required: true, message: '请输入密码', trigger: 'blur' },
        { min: 6, message: '密码至少 6 位', trigger: 'blur' },
      ],
}))

const submitting = ref(false)

// 打开时按模式填充：编辑回显（密码不回显），新增清空
watch(dialogVisible, (opened) => {
  if (!opened) return
  formRef.value?.clearValidate()
  form.value = props.editingRow
    ? {
        username: props.editingRow.username,
        phone: props.editingRow.phone,
        password: '',
        desc: props.editingRow.desc,
      }
    : { username: '', phone: '', password: '', desc: '' }
})

const handleSubmit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    if (props.editingRow) {
      await updateUser(props.editingRow.userId, {
        username: form.value.username,
        desc: form.value.desc,
      })
      ElMessage.success('修改成功')
    } else {
      await createUser({
        phone: form.value.phone,
        password: form.value.password,
        desc: form.value.desc,
      })
      ElMessage.success('新增成功')
    }
    dialogVisible.value = false
    emit('success')
  } catch {
    // 失败提示由拦截器弹出（如 409 手机号已存在 / 用户名已存在）
  } finally {
    submitting.value = false
  }
}
</script>
<template>
  <el-dialog
    v-model="dialogVisible"
    :title="dialogTitle"
    width="480px"
    append-to-body
    destroy-on-close
  >
    <el-form ref="formRef" :model="form" :rules="formRules" label-width="80px">
      <!-- 新增：手机号 + 密码（用户名自动生成）；编辑：手机号只回显，展示名可改 -->
      <el-form-item label="手机号" prop="phone">
        <el-input
          v-if="!editingRow"
          v-model="form.phone"
          placeholder="11 位手机号"
          maxlength="11"
        />
        <!-- 手机号是身份：编辑只回显（后端白名单不含 phone） -->
        <el-input v-else :model-value="form.phone" disabled />
      </el-form-item>
      <el-form-item v-if="editingRow" label="用户名" prop="username">
        <el-input
          v-model="form.username"
          placeholder="3-20 个字符"
          maxlength="20"
          show-word-limit
        />
      </el-form-item>
      <el-form-item v-if="!editingRow" label="密码" prop="password">
        <el-input v-model="form.password" type="password" placeholder="至少 6 位" show-password />
      </el-form-item>
      <el-form-item label="描述">
        <el-input v-model="form.desc" placeholder="如：商品运营" maxlength="200" show-word-limit />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
    </template>
  </el-dialog>
</template>
