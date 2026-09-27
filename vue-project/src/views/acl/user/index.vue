<script setup lang="ts">
import { ref, watch } from 'vue'
import { Plus, Edit, Delete, User, Search, Refresh } from '@element-plus/icons-vue'
import { usePagedList } from '@/composables/usePagedList'
import AppPagination from '@/components/pagination/index.vue'
import { deleteUser, getUserList } from '@/api/acl/user'
import type { UserRow } from '@/api/acl/user/type'
import { getRoleList } from '@/api/acl/role'
import type { RoleRow } from '@/api/acl/role/type'
import { formatDateTime } from '@/utils/time'
import { useUserStore } from '@/stores/user'
import UserFormDialog from './components/user-form-dialog/index.vue'
import AssignRoleDrawer from './components/assign-role-drawer/index.vue'

const userStore = useUserStore()

// ---- 列表 ----
const keyword = ref('')

const {
  list: tableData,
  pageNo,
  limit,
  total,
  loading,
  load: fetchUserList,
  reloadAfterDelete,
  setPageSize,
} = usePagedList(
  (page, pageSize) => getUserList({ page, pageSize, keyword: keyword.value.trim() || undefined }),
  { pageSize: 5 },
)

const handleSearch = () => {
  pageNo.value = 1
  fetchUserList()
}
const handleReset = () => {
  keyword.value = ''
  pageNo.value = 1
  fetchUserList()
}

// ---- 角色列表（表格标签映射 + 分配抽屉共用，页面持有单一数据源） ----
const roleOptions = ref<RoleRow[]>([])

const fetchRoleOptions = async () => {
  try {
    const res = await getRoleList({ page: 1, pageSize: 100 })
    roleOptions.value = res.list
  } catch {
    // 失败提示由拦截器弹出；角色列表拉取失败时标签回退显示原始 id
  }
}

// 找不到对应角色时回退显示 id：防御性回退，不因脏数据破图
const roleLabel = (roleId: string) =>
  roleOptions.value.find((option) => option.roleId === roleId)?.roleName ?? roleId
const roleTagType = (roleId: string): 'danger' | 'info' =>
  roleOptions.value.find((option) => option.roleId === roleId)?.roleName === 'super_admin'
    ? 'danger'
    : 'info'

// ---- 新增 / 编辑（表单逻辑在 user-form-dialog 子组件） ----
const dialogVisible = ref(false)
// null = 新增；有值 = 编辑（持有整行数据供弹窗填充快照）
const editingRow = ref<UserRow | null>(null)

const handleAdd = () => {
  editingRow.value = null
  dialogVisible.value = true
}

const handleEdit = (row: UserRow) => {
  editingRow.value = row
  dialogVisible.value = true
}

const handleDialogSuccess = () => {
  fetchUserList()
  // 改的是自己：同步 store，顶栏用户名才跟得上（若 username 变了 watch 会再拉一次列表，可接受）
  if (editingRow.value?.userId === userStore.userInfo?.userId) {
    userStore.fetchUserInfo()
  }
}

// ---- 角色分配抽屉（勾选与提交在 assign-role-drawer 子组件） ----
const assignVisible = ref(false)
const assigningRow = ref<UserRow | null>(null)

const handleAssign = (row: UserRow) => {
  assigningRow.value = row
  fetchRoleOptions() // 打开抽屉前拉最新角色列表（角色可能刚被新增/改名）
  assignVisible.value = true
}

const handleAssignSuccess = () => {
  fetchUserList()
}

// ---- 删除 ----
const handleDelete = async (row: UserRow) => {
  try {
    await ElMessageBox.confirm(`确定删除用户「${row.username}」吗？删除后不可恢复`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return // 用户取消
  }
  try {
    await deleteUser(row.userId)
    ElMessage.success('删除成功')
  } catch {
    return // 失败提示由拦截器弹出（如不能删自己）
  }
  await reloadAfterDelete()
}

fetchUserList()
fetchRoleOptions() // 进页面即拉角色列表：角色标签渲染依赖它（不只是抽屉打开时）

// 个人资料改了用户名 → store 刷新
watch(
  // getter
  () => userStore.userInfo?.username,
  () => fetchUserList(),
)
</script>

<template>
  <div class="user-page">
    <el-card shadow="never">
      <template #header>
        <div class="user-header">
          <span class="card-title">用户列表</span>
          <el-input
            v-model="keyword"
            class="user-input"
            placeholder="输入用户名/手机号搜索"
            :prefix-icon="Search"
            clearable
            @keyup.enter="handleSearch"
          />
          <el-button type="primary" :icon="Search" @click="handleSearch">搜索</el-button>
          <el-button type="primary" plain :icon="Refresh" @click="handleReset">重置</el-button>
        </div>
      </template>
      <el-button class="add-user" type="primary" :icon="Plus" @click="handleAdd"
        >添加用户</el-button
      >
      <el-table :data="tableData" border stripe v-loading="loading" row-key="userId">
        <el-table-column label="序号" width="70" align="center">
          <template #default="scope">
            <span>{{ (pageNo - 1) * limit + scope.$index + 1 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="用户名" min-width="120">
          <template #default="scope">
            <span>{{ (scope.row as UserRow).username }}</span>
          </template>
        </el-table-column>
        <el-table-column label="手机号" width="130">
          <template #default="scope">
            <span>{{ (scope.row as UserRow).phone }}</span>
          </template>
        </el-table-column>
        <el-table-column label="描述" min-width="160" show-overflow-tooltip>
          <template #default="scope">
            <span>{{ (scope.row as UserRow).desc || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="角色" min-width="140">
          <template #default="scope">
            <el-tag
              v-for="role in (scope.row as UserRow).roles"
              :key="role"
              size="small"
              :type="roleTagType(role)"
              class="role-tag"
            >
              {{ roleLabel(role) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="scope">
            <span>{{ formatDateTime((scope.row as UserRow).createdAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="170">
          <template #default="scope">
            <span>{{ formatDateTime((scope.row as UserRow).updatedAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="300" align="center">
          <template #default="scope">
            <el-button type="primary" :icon="User" @click="handleAssign(scope.row as UserRow)"
              >角色分配</el-button
            >
            <el-button type="primary" :icon="Edit" @click="handleEdit(scope.row as UserRow)"
              >编辑</el-button
            >
            <el-button type="danger" :icon="Delete" @click="handleDelete(scope.row as UserRow)"
              >删除</el-button
            >
          </template>
        </el-table-column>
      </el-table>

      <AppPagination
        v-model:page="pageNo"
        v-model:size="limit"
        :total="total"
        class="user-pagination"
        @current-change="fetchUserList"
        @size-change="setPageSize"
      />
    </el-card>

    <!-- 新增 / 编辑弹窗：表单与校验在子组件，成功事件驱动列表刷新与 store 同步 -->
    <UserFormDialog
      v-model="dialogVisible"
      :editing-row="editingRow"
      @success="handleDialogSuccess"
    />

    <!-- 角色分配抽屉（独立于编辑：只改角色，多选框组） -->
    <AssignRoleDrawer
      v-model="assignVisible"
      :row="assigningRow"
      :role-options="roleOptions"
      @success="handleAssignSuccess"
    />
  </div>
</template>

<style scoped lang="scss">
.user-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 20px;

  .card-title {
    font-size: 15px;
    font-weight: 600;
    white-space: nowrap;
  }

  .user-input {
    width: 240px;
    margin-right: 12px;
  }
}

.add-user {
  margin-bottom: 20px;
}

.role-tag {
  margin: 2px 6px 2px 0;
}

// 分页器间距由父级控制（class 透传到 AppPagination 根元素）
.user-pagination {
  margin-top: 15px;
  justify-content: flex-end;
}
</style>
