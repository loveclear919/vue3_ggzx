<script setup lang="ts">
import { confirmDelete } from '@/composables/useDeleteConfirm'
import { computed, ref } from 'vue'
import type { RoleRow } from '@/api/acl/role/type'
import { Plus, Edit, Delete, Lock } from '@element-plus/icons-vue'
import { usePagedList } from '@/composables/usePagedList'
import { deleteRole, getRoleList } from '@/api/acl/role'
import { formatDateTime } from '@/utils/time'
import AppPagination from '@/components/pagination/index.vue'
import EditDialog from './components/role-form-dialog/index.vue'
import PermissionDrawer from './components/permission-drawer/index.vue'
import type { PermissionRow } from '@/api/acl/permission/type'
import { getPermissionList } from '@/api/acl/permission/index'
import { useUserStore } from '@/stores/user'

// 内置角色行对非 grant-super 操作者禁用编辑/分配权限（体验层；后端 403 仍是裁决）
const hasGrantSuper = computed(() => useUserStore().hasPerm('role:grant-super'))
const isBuiltinBlocked = (row: RoleRow) => row.builtin && !hasGrantSuper.value

// 分页列表
const {
  list: tableData,
  pageNo,
  limit,
  total,
  loading,
  load: fetchRoleList,
  reloadAfterDelete,
  setPageSize,
} = usePagedList((page, pageSize) => getRoleList({ page, pageSize }))

// 新增/编辑弹窗
const editingVisible = ref(false)
const editingRow = ref<RoleRow | null>(null)

const handleAdd = () => {
  editingRow.value = null
  editingVisible.value = true
}

const handleEdit = (row: RoleRow) => {
  editingRow.value = row
  editingVisible.value = true
}

const handleDelete = async (row: RoleRow) => {
  if (
    await confirmDelete({
      entity: '角色',
      name: row.roleName,
      onConfirm: () => deleteRole(row.roleId),
    })
  ) {
    await reloadAfterDelete()
  }
}

// 权限
const permissionVisible = ref(false)
const permissionRows = ref<PermissionRow[]>([])
const assigningRow = ref<RoleRow | null>(null)
// 拉取整体权限：返回是否成功 —— 失败时不能打开抽屉，否则空树点「确认」会把该角色权限清空
const fetchPermission = async (): Promise<boolean> => {
  try {
    permissionRows.value = await getPermissionList()
    return true
  } catch {
    return false // 错误提示由拦截器弹出
  }
}

// 获取已有权限ID
const assignPermission = async (row: RoleRow) => {
  if (!(await fetchPermission())) return
  assigningRow.value = row
  permissionVisible.value = true
}
// 拉取
fetchRoleList()
</script>
<template>
  <div>
    <el-card shadow="never">
      <template #header>
        <div class="role-header">
          <span>角色列表</span>
        </div>
      </template>
      <el-button
        v-permission="'role:create'"
        class="add-role"
        type="primary"
        :icon="Plus"
        @click="handleAdd"
        >添加角色</el-button
      >
      <el-table :data="tableData" border stripe v-loading="loading" row-key="roleId">
        <el-table-column label="序号" width="70" align="center">
          <template #default="scope">
            <span>{{ (pageNo - 1) * limit + scope.$index + 1 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="角色名称" min-width="120">
          <template #default="scope">
            <span>{{ (scope.row as RoleRow).roleName }}</span>
          </template>
        </el-table-column>
        <el-table-column label="描述" min-width="160" show-overflow-tooltip>
          <template #default="scope">
            <span>{{ (scope.row as RoleRow).remark || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="scope">
            <span>{{ formatDateTime((scope.row as RoleRow).createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="170">
          <template #default="scope">
            <span>{{ formatDateTime((scope.row as RoleRow).updatedAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="300" align="center">
          <template #default="scope">
            <el-button
              v-permission="'role:assign-perm'"
              type="primary"
              :icon="Lock"
              :disabled="isBuiltinBlocked(scope.row as RoleRow)"
              @click="assignPermission(scope.row as RoleRow)"
              >分配权限</el-button
            >
            <el-button
              v-permission="'role:update'"
              type="primary"
              :icon="Edit"
              :disabled="isBuiltinBlocked(scope.row as RoleRow)"
              @click="handleEdit(scope.row as RoleRow)"
              >编辑</el-button
            >
            <!-- 内置角色删除是无条件 403（与操作者无关）：必然失败的操作不给可点入口，禁用 + tooltip 说明原因。
                 disabled 按钮不触发鼠标事件，tooltip 需包一层 span 承载 -->
            <el-tooltip
              content="内置角色不可删除"
              placement="top"
              :disabled="!(scope.row as RoleRow).builtin"
            >
              <span>
                <el-button
                  v-permission="'role:delete'"
                  type="danger"
                  :icon="Delete"
                  :disabled="(scope.row as RoleRow).builtin"
                  @click="handleDelete(scope.row as RoleRow)"
                  class="deleteBtn"
                  >删除</el-button
                >
              </span>
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>
      <AppPagination
        v-model:page="pageNo"
        v-model:size="limit"
        :total="total"
        class="role-pagination"
        @current-change="fetchRoleList"
        @size-change="setPageSize"
      />
    </el-card>
    <EditDialog v-model="editingVisible" :role="editingRow" @success="fetchRoleList"></EditDialog>
    <PermissionDrawer
      v-model="permissionVisible"
      :row="assigningRow"
      :permissions="permissionRows"
      @success="fetchRoleList"
    ></PermissionDrawer>
  </div>
</template>
<style scoped lang="scss">
.role-header {
  height: 32px;
  line-height: 32px;

  span {
    font-size: 15px;
    font-weight: 600;
    white-space: nowrap;
  }
}

.add-role {
  margin-bottom: 20px;
}

.role-pagination {
  margin-top: 15px;
  justify-content: flex-end;
}

.deleteBtn {
  margin-left: 12px;
}
</style>
