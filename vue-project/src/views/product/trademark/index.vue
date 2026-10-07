<script setup lang="ts">
import { useFormSubmit } from '@/composables/useFormSubmit'
import { confirmDelete } from '@/composables/useDeleteConfirm'
import { computed, onMounted, reactive, ref } from 'vue'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import type { FormInstance, FormRules } from 'element-plus'
import { getBrandList, createBrand, updateBrand, deleteBrand } from '@/api/product/trademark'
import type { BrandInfo } from '@/api/product/trademark/type'
import { usePagedList } from '@/composables/usePagedList'
import AppPagination from '@/components/pagination/index.vue'
import ImageUploader from '@/components/image-uploader/index.vue'

// ---- 列表查询状态（分页三件套收口：usePagedList 持有状态 + 竞态防护 + 删空回退） ----
const {
  list: tableData,
  pageNo,
  limit,
  total,
  loading,
  load: fetchBrandList,
  reloadAfterDelete,
  setPageSize,
} = usePagedList((page, pageSize) => getBrandList({ page, pageSize }))

// ---- 新增 / 编辑（共用一个弹窗） ----
const dialogVisible = ref(false)
// null = 新增模式；有值 = 编辑模式（存正在编辑的 brandId）
const editingId = ref<string | null>(null)
const dialogTitle = computed(() => (editingId.value ? '编辑品牌' : '新增品牌'))

const formRef = ref<FormInstance>()
const form = reactive({ name: '', logoUrl: '' })

// 校验规则与后端 Schema 对齐（name 必填、最长 30）
const formRules: FormRules = {
  name: [
    { required: true, message: '请输入品牌名称', trigger: 'blur' },
    { max: 30, message: '品牌名称不能超过 30 个字符', trigger: 'blur' },
  ],
}

const handleAdd = () => {
  editingId.value = null
  form.name = ''
  form.logoUrl = ''
  formRef.value?.clearValidate() // 清掉上次打开留下的校验红字
  dialogVisible.value = true
}

const handleEdit = (row: BrandInfo) => {
  editingId.value = row.brandId
  form.name = row.name
  form.logoUrl = row.logoUrl
  formRef.value?.clearValidate()
  dialogVisible.value = true
}

// 提交：先前端校验，通过后按模式调新增/更新接口
const { submitting, submit } = useFormSubmit({
  formRef,
  onSuccess: async () => {
    if (editingId.value) {
      await updateBrand(editingId.value, { ...form })
      ElMessage.success('修改成功')
    } else {
      await createBrand({ ...form })
      ElMessage.success('新增成功')
      pageNo.value = 1 // 列表按 createdAt 倒序，新数据在第 1 页
    }
    dialogVisible.value = false
    fetchBrandList()
  },
})

const handleSubmit = () => {
  void submit()
}

// ---- 图片上传：复用全局 ImageUploader（选完即传，URL 存进表单；提交时随品牌一起保存） ----
// ImageUploader 的模型是图片数组；品牌 LOGO 最多 1 张，用「数组 ↔ 单值」桥接
const logoImages = computed<{ imageUrl: string; imageName: string }[]>({
  get: () => (form.logoUrl ? [{ imageUrl: form.logoUrl, imageName: '' }] : []),
  set: (val) => {
    form.logoUrl = val[0]?.imageUrl ?? ''
  },
})

// ---- 删除 ----
const handleDelete = async (row: BrandInfo) => {
  if (
    await confirmDelete({
      entity: '品牌',
      name: row.name,
      onConfirm: () => deleteBrand(row.brandId),
    })
  ) {
    // 本页删空且非第 1 页 → 回退一页再拉（reloadAfterDelete 内置该编排）
    await reloadAfterDelete()
  }
}

onMounted(fetchBrandList)
</script>
<template>
  <el-card class="box-card">
    <!-- 工具栏 -->
    <el-button
      v-permission="'brand:create'"
      type="primary"
      size="large"
      :icon="Plus"
      @click="handleAdd"
      >添加品牌</el-button
    >
    <!-- 表格 -->
    <el-table
      class="brand-table"
      border
      stripe
      :data="tableData"
      v-loading="loading"
      row-key="brandId"
    >
      <el-table-column label="序号" width="80" align="center">
        <template #default="scope">
          <span>{{ (pageNo - 1) * limit + scope.$index + 1 }}</span>
        </template>
      </el-table-column>
      <el-table-column label="品牌名称">
        <template #default="scope">
          <span>{{ scope.row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column label="品牌LOGO">
        <template #default="scope">
          <!-- logoUrl 为空时展示占位，不显示破图 -->
          <el-image
            v-if="scope.row.logoUrl"
            :src="scope.row.logoUrl"
            class="brand-logo-img"
            fit="cover"
            lazy
          />
          <div v-else class="logo-placeholder">暂无LOGO</div>
        </template>
      </el-table-column>
      <el-table-column label="品牌操作">
        <template #default="scope">
          <!-- EP 插槽的 scope.row 默认为宽泛的 DefaultRow，断言回业务类型 -->
          <el-button
            v-permission="'brand:update'"
            type="primary"
            size="default"
            :icon="Edit"
            @click="handleEdit(scope.row as BrandInfo)"
          ></el-button>
          <el-button
            v-permission="'brand:delete'"
            type="danger"
            size="default"
            :icon="Delete"
            @click="handleDelete(scope.row as BrandInfo)"
          ></el-button>
        </template>
      </el-table-column>
    </el-table>
    <!-- 分页 -->
    <AppPagination
      v-model:page="pageNo"
      v-model:size="limit"
      :total="total"
      class="brand-pagination"
      @current-change="fetchBrandList"
      @size-change="setPageSize"
    />
    <!-- 新增 / 编辑弹窗 -->
    <!-- append-to-body：脱离内容区 z-index:0 的层叠上下文，弹窗才能压过顶部导航（z-index:100） -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="480px"
      append-to-body
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <el-form-item label="品牌名称" prop="name">
          <el-input
            v-model="form.name"
            placeholder="请输入品牌名称"
            maxlength="30"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="品牌LOGO" prop="logoUrl">
          <!-- 选图即上传：URL 经「数组 ↔ 单值」桥接写入 form.logoUrl；编辑时回显，可删除重传 -->
          <ImageUploader v-model="logoImages" :max="1" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<style scoped lang="scss">
.brand-table {
  margin: 15px auto;
}

// 分页器间距由父级控制（class 透传到 AppPagination 根元素）
.brand-pagination {
  margin-top: 15px;
  justify-content: flex-end;
}

// display:block 覆盖 EP 默认的 inline-block：消除行框基线下方空隙，行高与占位行一致
.brand-logo-img {
  width: 80px;
  height: 80px;
  display: block;
}

.logo-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background-color: var(--el-fill-color-light);
  border-radius: 4px;
}
</style>
