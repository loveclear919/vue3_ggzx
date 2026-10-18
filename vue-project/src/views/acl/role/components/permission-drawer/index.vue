<script setup lang="ts">
import { useFormSubmit } from '@/composables/useFormSubmit'
import { computed, ref } from 'vue'
import type { ElTree } from 'element-plus'
import type { RoleRow } from '@/api/acl/role/type'
import type { PermissionRow } from '@/api/acl/permission/type'
import { updateRole } from '@/api/acl/role'
import { listToTree } from '@/utils/listToTree'

// 分配权限抽屉：el-tree 勾选菜单/按钮，提交 = 勾选 id（含半选）写入 Role.permissions
const permissionVisible = defineModel<boolean>({ required: true })
const props = defineProps<{ row: RoleRow | null; permissions: PermissionRow[] }>()
const emit = defineEmits<{ success: [] }>()

// 平铺 → 树（computed：跟随 props.permissions 响应式重算）
const root = computed(() =>
  listToTree(props.permissions.map((r) => ({ id: r.permissionId, ...r }))),
)

const treeRef = ref<InstanceType<typeof ElTree>>()

// 根节点（parentId = null，全树唯一结构容器）不是权限值：禁用勾选。
// 注意 EP 语义：disabled 节点的【已勾选状态】仍会被 getCheckedKeys 返回 —— 后端 updateRole 另有静默剔除兜底
const treeProps = {
  label: 'name',
  disabled: (data: { parentId?: string | null }) => data.parentId === null,
}

const { submitting, submit } = useFormSubmit({
  onSuccess: async () => {
    if (!props.row) return
    const tree = treeRef.value
    if (!tree) return
    // 只存 checked（叶子 + 全选父级）：半选父级是推导值，入库会导致回显漂移 + 聚合越权；
    // 回显时 el-tree 会从叶子勾选状态自动推导父级半选/全选
    const checkedIds = tree.getCheckedKeys() as string[]
    await updateRole(props.row.roleId, { permissions: checkedIds })
    ElMessage.success('权限已更新')
    permissionVisible.value = false
    emit('success')
  },
})

const handleSubmit = () => {
  if (!root.value.length) {
    ElMessage.warning('权限列表尚未加载，请刷新后重试')
    return
  }
  void submit()
}
</script>
<template>
  <el-drawer v-model="permissionVisible" size="480px" append-to-body destroy-on-close>
    <template #header>
      <h3>分配菜单与按钮的权限</h3>
    </template>
    <template #default>
      <el-tree
        ref="treeRef"
        style="max-width: 600px"
        :data="root"
        node-key="id"
        :props="treeProps"
        show-checkbox
        :default-checked-keys="props.row?.permissions ?? []"
      />
    </template>
    <template #footer>
      <div class="drawer-footer">
        <el-button @click="permissionVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确认</el-button>
      </div>
    </template>
  </el-drawer>
</template>
<style scoped lang="scss">
// 抽屉 footer 默认无 flex 占位，需要撑满宽度让按钮组靠左排布
.drawer-footer {
  flex: auto;
}
</style>
