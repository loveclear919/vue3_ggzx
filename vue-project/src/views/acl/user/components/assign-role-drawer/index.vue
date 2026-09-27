<script setup lang="ts">
import { ref, watch } from 'vue'
import { updateUser } from '@/api/acl/user'
import type { UserRow } from '@/api/acl/user/type'
import type { RoleRow } from '@/api/acl/role/type'

// 角色分配抽屉：只改角色（多选框组）。
// 角色列表由页面持有并传入（表格标签渲染也需要同一份），本组件纯展示 + 提交
const drawerVisible = defineModel<boolean>({ required: true })
const props = defineProps<{ row: UserRow | null; roleOptions: RoleRow[] }>()
const emit = defineEmits<{ success: [] }>()

const assignRoles = ref<string[]>([])
const submitting = ref(false)

watch(drawerVisible, (opened) => {
  if (!opened || !props.row) return
  assignRoles.value = [...props.row.roles]
})

const handleSubmit = async () => {
  if (!props.row) return
  if (assignRoles.value.length === 0) {
    ElMessage.warning('至少选择一个角色')
    return
  }
  submitting.value = true
  try {
    await updateUser(props.row.userId, { roles: [...assignRoles.value] })
    ElMessage.success('角色已更新')
    drawerVisible.value = false
    emit('success')
  } catch {
    // 失败提示由拦截器弹出
  } finally {
    setTimeout(() => (submitting.value = false), 300) // 延迟清除 loading，避免闪烁
  }
}
</script>
<template>
  <el-drawer v-model="drawerVisible" title="分配角色" size="360px" append-to-body destroy-on-close>
    <el-form label-width="80px">
      <el-form-item label="用户名">
        <span>{{ row?.username }}</span>
      </el-form-item>
      <el-form-item label="角色">
        <el-checkbox-group v-model="assignRoles">
          <el-checkbox v-for="option in roleOptions" :key="option.roleId" :value="option.roleId">
            {{ option.roleName }}
          </el-checkbox>
        </el-checkbox-group>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="drawerVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
    </template>
  </el-drawer>
</template>

<style scoped lang="scss">
// 抽屉内角色选项纵向排列
.el-checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
