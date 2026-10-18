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
  perms: '',
  type: 'menu' as 'menu' | 'button',
  parentId: null as string | null,
  path: '',
  component: '',
  icon: '',
  hidden: false,
})

// 规则：name 3-20；perms 按钮必填（分组菜单可留空）且全字段可编辑（若依式纠错）；
// 路由元数据仅 menu 类型展示与校验；type 仅新增可选（后端 type 不可改）
const formRules = computed<FormRules>(() => ({
  name: [
    { required: true, message: '请输入权限名称', trigger: 'blur' },
    { min: 3, max: 20, message: '权限名称 3-20 个字符', trigger: 'blur' },
  ],
  perms: [
    {
      required: form.value.type === 'button',
      message: '按钮必须填写权限标识',
      trigger: 'blur',
    },
    {
      pattern: /^[a-z0-9_:-]*$/,
      message: '权限标识只能包含小写字母、数字、_ : -',
      trigger: 'blur',
    },
  ],
  path:
    form.value.type === 'menu'
      ? [
          { required: true, message: '菜单必须填写路由地址', trigger: 'blur' },
          {
            pattern: /^\/[a-z0-9/_-]*$/,
            message: '路由地址需以 / 开头，只能包含小写字母、数字、/ _ -',
            trigger: 'blur',
          },
        ]
      : [],
  component: [
    {
      pattern: /^[a-z0-9_/-]*$/,
      message: '组件路径只能包含小写字母、数字、_ / -',
      trigger: 'blur',
    },
  ],
  icon: [
    {
      pattern: /^[A-Za-z0-9_-]*$/,
      message: '图标名只能包含字母、数字、_ -',
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

// 打开时按模式填充：编辑全字段回显（type 只读）；新增清空，父级取行内按钮带入的预设值
watch(dialogVisible, (opened) => {
  if (!opened) return
  formRef.value?.clearValidate()
  form.value = props.editingRow
    ? {
        name: props.editingRow.name,
        perms: props.editingRow.perms,
        type: props.editingRow.type,
        parentId: props.editingRow.parentId,
        path: props.editingRow.path,
        component: props.editingRow.component,
        icon: props.editingRow.icon,
        hidden: props.editingRow.hidden,
      }
    : {
        name: '',
        perms: '',
        type: 'menu',
        parentId: props.presetParent?.permissionId ?? null,
        path: '',
        component: '',
        icon: '',
        hidden: false,
      }
})

// 提交
const { submitting, submit } = useFormSubmit({
  formRef,
  onSuccess: async () => {
    if (props.editingRow) {
      await updatePermission(props.editingRow.permissionId, {
        name: form.value.name,
        perms: form.value.perms,
        parentId: form.value.parentId ?? null,
        path: form.value.path,
        component: form.value.component,
        icon: form.value.icon,
        hidden: form.value.hidden,
      })
      ElMessage.success('修改成功')
    } else {
      await createPermission({
        parentId: form.value.parentId,
        name: form.value.name,
        perms: form.value.perms,
        type: form.value.type,
        path: form.value.path,
        component: form.value.component,
        icon: form.value.icon,
        hidden: form.value.hidden,
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
      <el-form-item label="权限标识" prop="perms">
        <el-input
          v-model="form.perms"
          placeholder="如：user:list 或 user:create；分组菜单可留空"
          maxlength="64"
        />
      </el-form-item>
      <el-form-item label="类型" prop="type">
        <el-radio-group v-if="!editingRow" v-model="form.type">
          <el-radio value="menu">菜单</el-radio>
          <el-radio value="button">按钮</el-radio>
        </el-radio-group>
        <span v-else>{{ form.type === 'menu' ? '菜单' : '按钮' }}</span>
      </el-form-item>
      <!-- 路由元数据：仅 menu 类型展示（后端按钮类型拒绝非空值） -->
      <template v-if="form.type === 'menu'">
        <el-form-item label="路由地址" prop="path">
          <el-input v-model="form.path" placeholder="如：/order/list" maxlength="64" />
        </el-form-item>
        <el-form-item label="组件路径" prop="component">
          <el-input
            v-model="form.component"
            placeholder="如：order/list（分组菜单留空）"
            maxlength="64"
          />
        </el-form-item>
        <el-form-item label="图标名" prop="icon">
          <el-input
            v-model="form.icon"
            placeholder="如：Goods（Element Plus 图标名）"
            maxlength="32"
          />
        </el-form-item>
        <el-form-item label="隐藏菜单">
          <el-switch v-model="form.hidden" />
          <span class="field-hint">隐藏后菜单不渲染，但可直达（子页面语义）</span>
        </el-form-item>
      </template>
      <el-form-item label="父级">
        <!-- 新增：父级由行内按钮带入，只读展示；编辑：下拉移动节点（button/自己及后代禁用） -->
        <span v-if="!editingRow">{{ presetParent?.name ?? '根节点' }}</span>
        <el-tree-select
          v-else
          v-model="form.parentId"
          :data="parentTree"
          node-key="id"
          :props="{ label: 'name' }"
          check-strictly
          :render-after-expand="false"
          placeholder="请选择父级（业务节点必须挂父级下）"
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

.field-hint {
  margin-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
