<script setup lang="ts">
import { useFormSubmit } from '@/composables/useFormSubmit'
import { computed, ref, watch } from 'vue'
import { updateUser } from '@/api/acl/user'
import type { UserRow } from '@/api/acl/user/type'
import type { RoleRow } from '@/api/acl/role/type'
import { useUserStore } from '@/stores/user'

// 角色分配抽屉：只改角色（多选框组）。
// 角色列表由页面持有并传入（表格标签渲染也需要同一份），本组件纯展示 + 提交
const drawerVisible = defineModel<boolean>({ required: true })
const props = defineProps<{ row: UserRow | null; roleOptions: RoleRow[] }>()
const emit = defineEmits<{ success: [] }>()

const assignRoles = ref<string[]>([])

// 内置角色选项仅 grant-super 持有者可勾选（体验层禁用；后端 403 仍是裁决）
const hasGrantSuper = computed(() => useUserStore().hasCode('role:grant-super'))
const isBuiltinDisabled = (option: RoleRow) => option.builtin && !hasGrantSuper.value

watch(drawerVisible, (opened) => {
  if (!opened || !props.row) return
  assignRoles.value = [...props.row.roles]
})

const { submitting, submit } = useFormSubmit({
  onSuccess: async () => {
    if (!props.row) return
    await updateUser(props.row.userId, { roles: [...assignRoles.value] })
    ElMessage.success('角色已更新')
    drawerVisible.value = false
    emit('success')
  },
})

const handleSubmit = () => {
  if (assignRoles.value.length === 0) {
    ElMessage.warning('至少选择一个角色')
    return
  }
  void submit()
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
          <el-checkbox
            v-for="option in roleOptions"
            :key="option.roleId"
            :value="option.roleId"
            :disabled="isBuiltinDisabled(option)"
          >
            {{ option.roleName }}
            <el-tag v-if="option.builtin" size="small" type="danger" style="margin-left: 6px"
              >内置</el-tag
            >
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
