<script setup lang="ts">
import { confirmDelete } from '@/composables/useDeleteConfirm'
import { onMounted, ref, computed } from 'vue'
import type { PermissionRow } from '@/api/acl/permission/type'
import { deletePermission, getPermissionList, swapPermission } from '@/api/acl/permission'
import { listToTree } from '@/utils/listToTree'
import { formatDateTime } from '@/utils/time'
import { Edit, Delete, Plus, ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import PermissionFormDialog from './components/permission-form-dialog/index.vue'

// 权限列表展示
const permissions = ref<PermissionRow[]>([])
const loading = ref(false)
// 拉取整体权限
const fetchPermission = async () => {
  loading.value = true
  try {
    permissions.value = await getPermissionList()
  } catch {
    // 交由拦截器处理
  } finally {
    loading.value = false
  }
}
// 树形结构
const root = computed(() =>
  listToTree(permissions.value.map((r) => ({ id: r.permissionId, ...r }))),
)

// 新增 / 编辑（表单逻辑在 permission-form-dialog 子组件）
const dialogVisible = ref(false)
// null = 新增；有值 = 编辑（持有整行数据供弹窗填充快照）
const editingRow = ref<PermissionRow | null>(null)
// 行内「新增」带入的父级：新增模式的父级预设（当前行 = 新节点的父）
const presetParent = ref<{ permissionId: string; name: string } | null>(null)

const handleAddChild = (row: PermissionRow) => {
  editingRow.value = null
  presetParent.value = { permissionId: row.permissionId, name: row.name }
  dialogVisible.value = true
}

const handleEdit = (row: PermissionRow) => {
  editingRow.value = row
  presetParent.value = null
  dialogVisible.value = true
}

// 提交成功
const handleDialogSuccess = () => {
  fetchPermission()
}

// ---- 上移 / 下移（同层交换排序） ----
// 预计算每行的同层邻居（父级分组 + sortIndex 排序，相邻即互为邻居）：
// 模板逐行调用 findSibling 是 O(n²) 且每次重渲染都重算，这里随 permissions 变化只算一次
const neighborMaps = computed(() => {
  const upMap = new Map<string, string>()
  const downMap = new Map<string, string>()
  const groups = new Map<string | null, PermissionRow[]>()
  for (const p of permissions.value) {
    const list = groups.get(p.parentId)
    if (list) list.push(p)
    else groups.set(p.parentId, [p])
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.sortIndex - b.sortIndex)
    // 顺向取前驱（上移目标）、逆向取后继（下移目标）：相邻遍历代替索引访问，规避未定义断言
    let prev: PermissionRow | undefined
    for (const cur of list) {
      if (prev) upMap.set(cur.permissionId, prev.permissionId)
      prev = cur
    }
    let next: PermissionRow | undefined
    for (const cur of [...list].reverse()) {
      if (next) downMap.set(cur.permissionId, next.permissionId)
      next = cur
    }
  }
  return { upMap, downMap }
})

const handleMove = async (row: PermissionRow, direction: 'up' | 'down') => {
  const map = direction === 'up' ? neighborMaps.value.upMap : neighborMaps.value.downMap
  const targetId = map.get(row.permissionId)
  if (!targetId) return
  try {
    await swapPermission(row.permissionId, targetId)
  } catch {
    return // 失败提示由拦截器弹出（如 409 排序冲突，请刷新后重试）
  }
  await fetchPermission()
}

// 删除
const handleDelete = async (row: PermissionRow) => {
  if (
    await confirmDelete({
      entity: '权限',
      name: row.name,
      onConfirm: () => deletePermission(row.permissionId),
    })
  ) {
    await fetchPermission()
  }
}

// 挂载
onMounted(fetchPermission)
</script>
<template>
  <div class="permission-page">
    <el-card shadow="never">
      <template #header>
        <div class="permission-header">
          <span class="card-title">菜单权限列表</span>
        </div>
      </template>
      <el-table :data="root" row-key="id" border v-loading="loading">
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column prop="perms" label="权限标识" min-width="150" show-overflow-tooltip />
        <el-table-column label="类型" width="80" align="center">
          <template #default="scope">
            <el-tag
              size="small"
              :type="(scope.row as PermissionRow).type === 'menu' ? 'success' : 'info'"
            >
              {{ (scope.row as PermissionRow).type === 'menu' ? '菜单' : '按钮' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="200">
          <template #default="scope">
            <span>{{ formatDateTime((scope.row as PermissionRow).createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="修改时间" width="200">
          <template #default="scope">
            <span>{{ formatDateTime((scope.row as PermissionRow).updatedAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="430" align="center">
          <template #default="scope">
            <!-- 上移/下移：同层交换排序（邻居表预计算，无邻居时禁用） -->
            <el-button
              v-permission="'permission:swap'"
              size="small"
              :icon="ArrowUp"
              :disabled="!neighborMaps.upMap.has((scope.row as PermissionRow).permissionId)"
              @click="handleMove(scope.row as PermissionRow, 'up')"
            ></el-button>
            <el-button
              v-permission="'permission:swap'"
              size="small"
              :icon="ArrowDown"
              :disabled="!neighborMaps.downMap.has((scope.row as PermissionRow).permissionId)"
              @click="handleMove(scope.row as PermissionRow, 'down')"
            ></el-button>
            <!-- 行内新增：当前行 = 新节点的父（button 不能有子级，不显示新增） -->
            <el-button
              v-permission="'permission:create'"
              v-if="(scope.row as PermissionRow).type === 'menu'"
              type="primary"
              :icon="Plus"
              @click="handleAddChild(scope.row as PermissionRow)"
            >
              新增
            </el-button>
            <el-button
              v-permission="'permission:update'"
              type="primary"
              :icon="Edit"
              @click="handleEdit(scope.row as PermissionRow)"
            >
              编辑
            </el-button>
            <el-button
              v-permission="'permission:delete'"
              type="danger"
              :icon="Delete"
              @click="handleDelete(scope.row as PermissionRow)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增 / 编辑弹窗：表单与校验在子组件，成功事件驱动列表刷新 -->
    <PermissionFormDialog
      v-model="dialogVisible"
      :editing-row="editingRow"
      :permissions="permissions"
      :preset-parent="presetParent"
      @success="handleDialogSuccess"
    />
  </div>
</template>
<style scoped lang="scss">
.permission-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
}
</style>
