<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import CategoryDrilldown from '@/components/category/index.vue'
import type { CategoryFlatNode } from '@/api/category/type'
import { getAllBrands } from '@/api/product/trademark'
import type { BrandInfo } from '@/api/product/trademark/type'
import { getBaseSaleAttrList } from '@/api/product/baseSaleAttr'
import type { BaseSaleAttrInfo } from '@/api/product/baseSaleAttr/type'
import { getSpuList, deleteSpu } from '@/api/product/spu'
import type { SpuInfo } from '@/api/product/spu/type'
import SpuFormDialog from './components/spu-form-dialog/index.vue'

// ---- 逐级下钻分类选择（左侧）：下钻逻辑抽离为全局组件 components/category，本页只响应选中 ----
const selectedCategory = ref<CategoryFlatNode | null>(null)

// 选中三级分类：重置分页并查该分类下的 SPU 列表
const handleCategorySelect = (node: CategoryFlatNode) => {
  selectedCategory.value = node
  pageNo.value = 1 // 切换分类回到第 1 页
  fetchSpuList()
}

// ---- SPU 列表（右侧） ----
const pageNo = ref(1)
const limit = ref(10)
const total = ref(0)
const tableData = ref<SpuInfo[]>([])
const loading = ref(false)
const emptyText = computed(() => (selectedCategory.value ? '暂无数据' : '请先在左侧选择三级分类'))

const fetchSpuList = async () => {
  if (!selectedCategory.value) return
  loading.value = true
  try {
    const result = await getSpuList({
      categoryId: selectedCategory.value.categoryId,
      page: pageNo.value,
      pageSize: limit.value,
    })
    tableData.value = result.list
    total.value = result.total
  } catch {
    // 错误提示已由响应拦截器统一弹出
  } finally {
    loading.value = false
  }
}

const handleSizeChange = () => {
  pageNo.value = 1
  fetchSpuList()
}

// ---- 下拉数据（品牌 / 基础销售属性字典，供弹窗组件使用） ----
const brandOptions = ref<BrandInfo[]>([])
const saleAttrOptions = ref<BaseSaleAttrInfo[]>([])

const fetchOptions = async () => {
  // 品牌与销售属性字典互不依赖，并行拉取
  // all-or-nothing：两个下拉都是弹窗的必填来源，任一失败都提交不了，就没必要做"半个表单可用"的部分成功
  try {
    const [brands, saleAttrs] = await Promise.all([getAllBrands(), getBaseSaleAttrList()])
    brandOptions.value = brands
    saleAttrOptions.value = saleAttrs
  } catch {
    // 错误提示已由响应拦截器统一弹出；下拉保持空列表，点「添加SPU」时表单校验会拦住（不会提交半份数据）
  }
}

// 品牌 id → 名称 映射（列表列展示用）
const brandNameMap = computed(() => {
  const map: Record<string, string> = {}
  for (const brand of brandOptions.value) {
    map[brand.brandId] = brand.name
  }
  return map
})

// ---- 新增 / 编辑（共用弹窗，表单逻辑在 components/spu-form-dialog） ----
const dialogVisible = ref(false)
// null = 新增；有值 = 编辑（持有整行数据供弹窗填充快照）
const editingRow = ref<SpuInfo | null>(null)

const handleAdd = () => {
  editingRow.value = null
  dialogVisible.value = true
}

const handleEdit = (row: SpuInfo) => {
  editingRow.value = row
  dialogVisible.value = true
}

// 弹窗提交成功：关闭并刷新列表（新增的数据按 createdAt 倒序排在第 1 页）
const handleDialogSuccess = () => {
  dialogVisible.value = false
  if (!editingRow.value) {
    pageNo.value = 1
  }
  fetchSpuList()
}

// ---- 删除 ----
const handleDelete = async (row: SpuInfo) => {
  try {
    await ElMessageBox.confirm(`确定删除 SPU「${row.name}」吗？删除后不可恢复`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return // 用户取消
  }

  try {
    await deleteSpu(row.spuId)
    ElMessage.success('删除成功')
    if (tableData.value.length === 1 && pageNo.value > 1) {
      pageNo.value--
    }
    fetchSpuList()
  } catch {
    // 失败提示由拦截器弹出
  }
}

onMounted(fetchOptions)
</script>

<template>
  <!-- 单根容器：路由切换的 Transition 只能动画单根元素组件 -->
  <div class="spu-page">
    <el-row :gutter="20">
      <!-- 左侧：逐级下钻分类选择（抽离为全局组件 components/category，本页只响应 select 事件） -->
      <el-col :span="6">
        <CategoryDrilldown
          :selected-id="selectedCategory?.categoryId"
          @select="handleCategorySelect"
        />
      </el-col>

      <!-- 右侧：SPU 列表 -->
      <el-col :span="18">
        <el-card shadow="never">
          <template #header>
            <div class="spu-header">
              <span class="card-title"
                >SPU列表{{ selectedCategory ? `（${selectedCategory.name}）` : '' }}</span
              >
              <el-button
                type="primary"
                :icon="Plus"
                :disabled="!selectedCategory"
                @click="handleAdd"
              >
                添加SPU
              </el-button>
            </div>
          </template>

          <el-table :data="tableData" border stripe v-loading="loading" :empty-text="emptyText">
            <el-table-column label="序号" width="70" align="center">
              <template #default="scope">
                <span>{{ (pageNo - 1) * limit + scope.$index + 1 }}</span>
              </template>
            </el-table-column>
            <el-table-column label="名称" width="180" show-overflow-tooltip>
              <template #default="scope">
                <span>{{ scope.row.name }}</span>
              </template>
            </el-table-column>
            <el-table-column label="描述" show-overflow-tooltip>
              <template #default="scope">
                <span>{{ scope.row.description || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="品牌" width="120">
              <template #default="scope">
                <span>{{ brandNameMap[scope.row.brandId] || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="图片" width="90" align="center">
              <template #default="scope">
                <el-image
                  v-if="scope.row.imageList[0]"
                  :src="scope.row.imageList[0].imageUrl"
                  class="spu-image"
                  fit="cover"
                />
                <span v-else class="no-image">无图</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" align="center">
              <template #default="scope">
                <el-button
                  type="primary"
                  size="default"
                  :icon="Edit"
                  @click="handleEdit(scope.row as SpuInfo)"
                ></el-button>
                <el-button
                  type="danger"
                  size="default"
                  :icon="Delete"
                  @click="handleDelete(scope.row as SpuInfo)"
                ></el-button>
              </template>
            </el-table-column>
          </el-table>

          <el-pagination
            v-model:current-page="pageNo"
            v-model:page-size="limit"
            :page-sizes="[5, 10, 20, 50]"
            background
            size="large"
            layout="prev, pager, next, jumper, ->, sizes, total"
            :total="total"
            class="spu-pagination"
            @current-change="fetchSpuList"
            @size-change="handleSizeChange"
          />
        </el-card>
      </el-col>
    </el-row>

    <!-- 新增 / 编辑弹窗：表单与校验在子组件，成功事件驱动列表刷新 -->
    <SpuFormDialog
      v-if="selectedCategory"
      v-model="dialogVisible"
      :editing-row="editingRow"
      :category-id="selectedCategory.categoryId"
      :brand-options="brandOptions"
      :sale-attr-options="saleAttrOptions"
      @success="handleDialogSuccess"
    />
  </div>
</template>

<style scoped lang="scss">
.card-title {
  font-size: 15px;
  font-weight: 600;
}

.spu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.spu-pagination {
  margin-top: 15px;
  justify-content: flex-end;
}

.no-image {
  font-size: 12px;
  color: #909399;
}

// display:block 覆盖 EP 默认的 inline-block：消除行框基线下方空隙，行高与「无图」占位行一致
.spu-image {
  width: 48px;
  height: 48px;
  display: block;
}
</style>
