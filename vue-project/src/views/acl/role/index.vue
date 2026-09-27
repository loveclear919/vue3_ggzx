<script setup lang="ts">
import { ref } from 'vue'
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
  try {
    await ElMessageBox.confirm(`确定删除角色「${row.roleName}」吗？删除后不可恢复`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return // 用户取消
  }
  try {
    await deleteRole(row.roleId)
    ElMessage.success('删除成功')
  } catch {
    return
  }
  await reloadAfterDelete()
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
  assigningRow.value = row
  if (!(await fetchPermission())) return
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
      <el-button class="add-role" type="primary" :icon="Plus" @click="handleAdd"
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
            <el-button type="primary" :icon="Lock" @click="assignPermission(scope.row as RoleRow)"
              >分配权限</el-button
            >
            <el-button type="primary" :icon="Edit" @click="handleEdit(scope.row as RoleRow)"
              >编辑</el-button
            >
            <el-button type="danger" :icon="Delete" @click="handleDelete(scope.row as RoleRow)"
              >删除</el-button
            >
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
</style>
