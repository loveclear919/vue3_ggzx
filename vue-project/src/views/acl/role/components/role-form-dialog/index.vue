<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { RoleRow } from '@/api/acl/role/type'
import { createRole, updateRole } from '@/api/acl/role'
import type { FormInstance, FormRules } from 'element-plus'

// 新增 / 编辑共用弹窗：role 为 null 即新增模式（单变量模式，与 user/permission 弹窗一致）
const dialogVisible = defineModel<boolean>({ required: true })
const props = defineProps<{ role: RoleRow | null }>()
const emit = defineEmits<{ success: [] }>()

const dialogTitle = computed(() => (props.role ? '编辑角色' : '新增角色'))

// 表单
const formRef = ref<FormInstance>()
const form = ref({
  roleName: '',
  remark: '',
})

// 校验规则
const formRules: FormRules = {
  roleName: [
    { required: true, message: '请输入角色名', trigger: 'blur' },
    { min: 3, max: 20, message: '角色名长度 3-20 个字符', trigger: 'blur' },
  ],
}

// 提交表单
const handleSubmit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    if (props.role) {
      await updateRole(props.role.roleId, {
        roleName: form.value.roleName,
        remark: form.value.remark,
      })
      ElMessage.success('修改成功')
    } else {
      await createRole({ roleName: form.value.roleName, remark: form.value.remark })
      ElMessage.success('新增成功')
    }
    emit('success')
    dialogVisible.value = false
  } catch {
    // 失败提示由拦截器弹出（如 409 角色名已存在）
  } finally {
    submitting.value = false
  }
}

watch(dialogVisible, (newValue) => {
  if (!newValue) return
  formRef.value?.clearValidate()
  if (props.role) {
    form.value = {
      roleName: props.role.roleName,
      remark: props.role.remark ?? '',
    }
  } else {
    form.value = {
      roleName: '',
      remark: '',
    }
  }
})

// 提交
const submitting = ref(false)
</script>
<template>
  <el-dialog
    v-model="dialogVisible"
    :title="dialogTitle"
    width="560px"
    append-to-body
    destroy-on-close
  >
    <el-form ref="formRef" :model="form" :rules="formRules" label-width="80px">
      <el-form-item label="角色名称" prop="roleName">
        <el-input v-model="form.roleName" />
      </el-form-item>
      <el-form-item label="描述" prop="remark">
        <el-input v-model="form.remark" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss"></style>
