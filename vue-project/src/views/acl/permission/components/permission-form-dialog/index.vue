<script setup lang="ts">
import { useFormSubmit } from '@/composables/useFormSubmit'
import { computed, ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { createPermission, updatePermission } from '@/api/acl/permission'
import type { PermissionRow } from '@/api/acl/permission/type'
import { listToTree } from '@/utils/listToTree'
import type { TreeNode } from '@/utils/listToTree'

const props = defineProps<{
  editingRow: PermissionRow | null
  permissions: PermissionRow[]
  presetParent?: { permissionId: string; name: string } | null
}>()
const emit = defineEmits<{ success: [] }>()

// 新增 / 编辑共用弹窗
const dialogVisible = defineModel<boolean>({ required: true })
const dialogTitle = computed(() => (props.editingRow ? '编辑权限' : '新增权限'))
const formRef = ref<FormInstance>()
const form = ref({
  name: '',
  code: '',
  type: 'menu' as 'menu' | 'button',
  parentId: null as string | null,
})

// 规则：name 3-20；code 仅新增必填（创建后不可改，编辑只回显）；type 仅新增可选
const formRules = computed<FormRules>(() => ({
  name: [
    { required: true, message: '请输入权限名称', trigger: 'blur' },
    { min: 3, max: 20, message: '权限名称 3-20 个字符', trigger: 'blur' },
  ],
  code: props.editingRow
    ? []
    : [
        { required: true, message: '请输入权限值', trigger: 'blur' },
        {
          pattern: /^[a-z0-9_:/-]+$/,
          message: '权限值只能包含小写字母、数字、_ : / -',
          trigger: 'blur',
        },
      ],
  type: props.editingRow ? [] : [{ required: true, message: '请选择权限类型', trigger: 'change' }],
}))

// 父级候选树：
// 层级规则：button 节点不能当父级 → 禁用；
// 环校验：编辑模式下，「自己 + 自己的后代」不能当选 → 禁用
const parentTree = computed<TreeNode<PermissionRow & { id: string }>[]>(() => {
  const nodes = props.permissions.map((r) => ({ id: r.permissionId, ...r }))

  const disabledIds = new Set<string>()
  if (props.editingRow) {
    // BFS 收集需要禁用的ID
    const queue = [props.editingRow.permissionId]
    disabledIds.add(props.editingRow.permissionId)
    while (queue.length) {
      const cur = queue.shift()!
      for (const n of nodes) {
        if (n.parentId === cur && !disabledIds.has(n.id)) {
          disabledIds.add(n.id)
          queue.push(n.id)
        }
      }
    }
  }

  const marked = nodes.map((n) => ({
    ...n,
    disabled: n.type === 'button' || disabledIds.has(n.id),
  }))
  return listToTree(marked)
})

// 打开时按模式填充：编辑回显（code/type 只回显不可改）；新增清空，父级取行内按钮带入的预设值
watch(dialogVisible, (opened) => {
  if (!opened) return
  formRef.value?.clearValidate()
  form.value = props.editingRow
    ? {
        name: props.editingRow.name,
        code: props.editingRow.code,
        type: props.editingRow.type,
        parentId: props.editingRow.parentId,
      }
    : { name: '', code: '', type: 'menu', parentId: props.presetParent?.permissionId ?? null }
})

// 提交
const { submitting, submit } = useFormSubmit({
  formRef,
  onSuccess: async () => {
    if (props.editingRow) {
      await updatePermission(props.editingRow.permissionId, {
        name: form.value.name,
        parentId: form.value.parentId ?? null,
      })
      ElMessage.success('修改成功')
    } else {
      await createPermission({
        parentId: form.value.parentId,
        name: form.value.name,
        code: form.value.code,
        type: form.value.type,
      })
      ElMessage.success('新增成功')
    }
    dialogVisible.value = false
    emit('success')
  },
})

const handleSubmit = () => {
  void submit()
}
</script>
<template>
  <el-dialog
    v-model="dialogVisible"
    :title="dialogTitle"
    width="520px"
    append-to-body
    destroy-on-close
  >
    <el-form ref="formRef" :model="form" :rules="formRules" label-width="80px">
      <el-form-item label="权限名称" prop="name">
        <el-input v-model="form.name" placeholder="如：用户管理" maxlength="20" show-word-limit />
      </el-form-item>
      <el-form-item label="权限值" prop="code">
        <el-input
          v-if="!editingRow"
          v-model="form.code"
          placeholder="如：/acl/users 或 user:delete"
          maxlength="64"
        />
        <el-input v-else :model-value="form.code" disabled />
      </el-form-item>
      <el-form-item label="类型" prop="type">
        <el-radio-group v-if="!editingRow" v-model="form.type">
          <el-radio value="menu">菜单</el-radio>
          <el-radio value="button">按钮</el-radio>
        </el-radio-group>
        <span v-else>{{ form.type === 'menu' ? '菜单' : '按钮' }}</span>
      </el-form-item>
      <el-form-item label="父级">
        <!-- 新增：父级由行内按钮带入，只读展示；编辑：下拉移动节点（button/自己及后代禁用） -->
        <span v-if="!editingRow">{{ presetParent?.name ?? '顶级权限' }}</span>
        <el-tree-select
          v-else
          v-model="form.parentId"
          :data="parentTree"
          node-key="id"
          :props="{ label: 'name' }"
          check-strictly
          :render-after-expand="false"
          clearable
          placeholder="不选 = 顶级权限"
          class="full-width"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.full-width {
  width: 100%;
}
</style>
