<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import type { FormInstance, FormRules, UploadRequestHandler, UploadProps } from 'element-plus'
import { getBrandList, createBrand, updateBrand, deleteBrand } from '@/api/product/trademark'
import { uploadFile } from '@/api/upload'
import type { BrandInfo } from '@/api/product/trademark/type'

// ---- 列表查询状态 ----
const pageNo = ref(1)
const limit = ref(10)
const total = ref(0)
const tableData = ref<BrandInfo[]>([])
const loading = ref(false)

// 拉取当前页数据：翻页 = 改状态重新查
const fetchBrandList = async () => {
  loading.value = true
  try {
    const result = await getBrandList({ page: pageNo.value, pageSize: limit.value })
    tableData.value = result.list
    total.value = result.total
  } catch {
    // 错误提示已由响应拦截器统一弹出，这里只负责让 loading 收尾
  } finally {
    loading.value = false
  }
}

// 切换每页条数：回到第 1 页再查（页容量变化后原页码可能越界）
const handleSizeChange = () => {
  pageNo.value = 1
  fetchBrandList()
}

// ---- 新增 / 编辑（共用一个弹窗） ----
const dialogVisible = ref(false)
const submitting = ref(false)
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
const handleSubmit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
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
  } catch {
    // 失败提示由拦截器弹出（如 409 品牌名称已存在）
  } finally {
    submitting.value = false
  }
}

// ---- 图片上传（选完即传，URL 存进表单；提交时随品牌一起保存） ----
const uploading = ref(false)

// 上传前客户端校验（与后端 multer 白名单一致，双重防线）
const beforeUpload: UploadProps['beforeUpload'] = (rawFile) => {
  if (!rawFile.type.startsWith('image/')) {
    ElMessage.error('仅支持图片文件')
    return false
  } else if (rawFile.size / 1024 / 1024 > 2) {
    ElMessage.error('图片大小不能超过 2MB')
    return false
  }
  return true
}

// 自定义上传
const handleUpload: UploadRequestHandler = async (options) => {
  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', options.file)
    const res = await uploadFile(formData)
    form.logoUrl = res.url
    // 必须调 onSuccess 通知组件，否则内部文件状态永远停留在 uploading
    options.onSuccess(res)
    ElMessage.success('上传成功')
  } catch (error) {
    // 运行时仅记录错误对象，never 断言只为满足类型
    options.onError(error as never)
  } finally {
    uploading.value = false
  }
}

// ---- 删除 ----
const handleDelete = async (row: BrandInfo) => {
  try {
    await ElMessageBox.confirm(`确定删除品牌「${row.name}」吗？删除后不可恢复`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return // 用户点了取消，静默退出
  }

  try {
    await deleteBrand(row.brandId)
    ElMessage.success('删除成功')
    // 当前页删空了且不是第 1 页 → 回退一页，避免停在空白页
    if (tableData.value.length === 1 && pageNo.value > 1) {
      pageNo.value--
    }
    fetchBrandList()
  } catch {
    // 失败提示由拦截器弹出（如 404 品牌不存在）
  }
}

onMounted(fetchBrandList)
</script>
<template>
  <el-card class="box-card">
    <!-- 工具栏 -->
    <el-button type="primary" size="large" :icon="Plus" @click="handleAdd">添加品牌</el-button>
    <!-- 表格 -->
    <el-table style="margin: 15px auto" border stripe :data="tableData" v-loading="loading">
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
          <!-- display:block 覆盖 EP 默认的 inline-block：消除行框基线下方空隙，行高与占位行一致 -->
          <el-image
            v-if="scope.row.logoUrl"
            :src="scope.row.logoUrl"
            style="width: 80px; height: 80px; display: block"
            fit="cover"
          />
          <div v-else class="logo-placeholder">暂无LOGO</div>
        </template>
      </el-table-column>
      <el-table-column label="品牌操作">
        <template #default="scope">
          <!-- EP 插槽的 scope.row 默认为宽泛的 DefaultRow，断言回业务类型 -->
          <el-button
            type="primary"
            size="default"
            :icon="Edit"
            @click="handleEdit(scope.row as BrandInfo)"
          ></el-button>
          <el-button
            type="danger"
            size="default"
            :icon="Delete"
            @click="handleDelete(scope.row as BrandInfo)"
          ></el-button>
        </template>
      </el-table-column>
    </el-table>
    <!-- 分页 -->
    <el-pagination
      v-model:current-page="pageNo"
      v-model:page-size="limit"
      :page-sizes="[5, 10, 20, 50]"
      background
      size="large"
      layout="prev, pager, next, jumper, ->, sizes, total"
      :total="total"
      @current-change="fetchBrandList"
      @size-change="handleSizeChange"
    />
    <!-- 新增 / 编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="480px">
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
          <!-- 选图即上传：成功后 URL 写入 form.logoUrl；编辑时回显预览，点击可重新选图 -->
          <el-upload
            :show-file-list="false"
            :http-request="handleUpload"
            :before-upload="beforeUpload"
            accept="image/jpeg,image/png,image/webp,image/gif"
          >
            <div class="logo-uploader" v-loading="uploading">
              <img v-if="form.logoUrl" :src="form.logoUrl" class="logo-preview" alt="品牌LOGO" />
              <el-icon v-else class="logo-uploader-icon">
                <Plus />
              </el-icon>
            </div>
          </el-upload>
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
.logo-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  font-size: 12px;
  color: #909399;
  background-color: #f5f7fa;
  border-radius: 4px;
}

// 弹窗内上传区：未上传显示虚线框 + 加号，已上传显示预览
.logo-uploader {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100px;
  height: 100px;
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.2s;

  &:hover {
    border-color: var(--el-color-primary);
  }

  .logo-uploader-icon {
    font-size: 24px;
    color: #8c939d;
  }

  .logo-preview {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}
</style>
