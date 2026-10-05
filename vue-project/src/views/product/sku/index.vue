<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Edit } from '@element-plus/icons-vue'
import { getSpuById } from '@/api/product/spu'
import type { SpuInfo } from '@/api/product/spu/type'
import { clearSkus, getSkuList, updateSku } from '@/api/product/sku'
import type { SkuInfo } from '@/api/product/sku/type'
import { centsToYuan } from '@/utils/money'
import { useLatestRequest } from '@/composables/useLatestRequest'
import { usePagedList } from '@/composables/usePagedList'
import AppPagination from '@/components/pagination/index.vue'
import GenerateForm from '@/views/product/sku/components/generate-form/index.vue'
import EditDialog from '@/views/product/sku/components/edit-dialog/index.vue'

const route = useRoute()
const router = useRouter()

// ---- SPU 上下文：SKU 页不接下钻，凭 URL 的 spuId 自洽（刷新/直链都可用） ----
const spuId = computed(() => (typeof route.query.spuId === 'string' ? route.query.spuId : ''))
const spu = ref<SpuInfo | null>(null)
// SPU 上下文拉取（只认最后一次请求，防竞态）
const { loading: contextLoading, run: runSpu } = useLatestRequest()

const fetchSpu = async () => {
  if (!spuId.value) return
  const data = await runSpu(() => getSpuById(spuId.value))
  if (data !== undefined) spu.value = data
}

// ---- SKU 列表（分页） ----
// 分页三件套收口：usePagedList 持有状态 + 竞态防护
const {
  list: tableData,
  pageNo,
  limit,
  total,
  loading,
  load: loadSkuList,
  setPageSize,
} = usePagedList((page, pageSize) => getSkuList({ spuId: spuId.value, page, pageSize }), {
  pageSize: 5,
})

// 拉取入口统一带「有 spuId」守卫
const fetchSkuList = () => {
  if (!spuId.value) return
  loadSkuList()
}

// 期望组合数
const expectedCount = computed(() =>
  spu.value
    ? spu.value.saleAttrList.reduce((acc, dim) => acc * dim.saleAttrValueList.length, 1)
    : 0,
)

// ---- 上下架 / 编辑 / 清空重建 ----
const handleToggleSale = async (row: SkuInfo, isSale: boolean) => {
  // 上架闸门（前端体验拦截，后端是真正闸门）：未定价不能上架
  if (isSale && row.price <= 0) {
    ElMessage.warning('请先设置价格再上架')
    return
  }
  // 零库存可以上架（在架 + 无货 = 售罄，是正常经营状态：硬拦会导致卖断货被强制下架、
  // 补货后还要人工重新上架），但一次点击就改了状态、库存列容易被忽略，软提醒确认一次
  if (isSale && row.stock <= 0) {
    try {
      await ElMessageBox.confirm(
        '该 SKU 当前库存为 0，上架后将显示为售罄。确认上架吗？',
        '零库存上架',
        { type: 'warning', confirmButtonText: '确认上架', cancelButtonText: '取消' },
      )
    } catch {
      return // 用户取消：开关是单向绑定（:model-value 不回写），列表未重拉，视图自动回落
    }
  }
  try {
    await updateSku(row.skuId, { isSale })
    if (isSale) {
      ElMessage.success('商品已上架')
    } else {
      ElMessage.warning('商品已下架')
    }
  } catch {
    // 失败提示由拦截器弹出；列表重拉后开关回落到服务端真实状态
  }
  fetchSkuList()
}

// --- 编辑弹窗 ---
const editVisible = ref(false)
const editingRow = ref<SkuInfo | null>(null)
const handleEdit = (row: SkuInfo) => {
  editingRow.value = row
  editVisible.value = true
}
const handleEditSuccess = () => {
  editVisible.value = false
  fetchSkuList()
}

// --- 清空重建 ---
const handleClear = async () => {
  try {
    await ElMessageBox.confirm(
      '清空后该 SPU 的全部 SKU（含已填价格库存）将被删除，需重新生成。确定清空吗？',
      '清空重建',
      { type: 'warning', confirmButtonText: '清空', cancelButtonText: '取消' },
    )
  } catch {
    return // 用户取消
  }
  try {
    await clearSkus(spuId.value)
    ElMessage.success('已清空')
  } catch {
    return // 失败提示由拦截器弹出
  }
  fetchSkuList()
}

// --- 生成表单成功回调：重拉列表 ---
const handleGenerateSuccess = () => {
  pageNo.value = 1
  fetchSkuList()
}

watch(
  spuId,
  () => {
    // 直接重定向回父页，不落空态
    if (!spuId.value) {
      router.replace('/product/spu')
      return
    }
    pageNo.value = 1
    fetchSpu()
    fetchSkuList()
  },
  { immediate: true },
)
</script>

<template>
  <div class="sku-page">
    <el-card shadow="never">
      <template #header>
        <div class="sku-header">
          <span class="card-title">SKU管理{{ spu ? `（${spu.name}）` : '' }}</span>
          <div class="sku-actions">
            <el-button
              v-permission="'sku:clear'"
              v-if="total > 0"
              type="danger"
              plain
              @click="handleClear"
              >清空重建</el-button
            >
            <el-button :icon="ArrowLeft" @click="router.push('/product/spu')"
              >返回SPU列表</el-button
            >
          </div>
        </div>
      </template>

      <div v-loading="contextLoading">
        <!-- 销售属性上下文：SKU 不重复存储平台属性/维度定义，需要时从 SPU 读 -->
        <div class="spu-context">
          <template v-if="spu && spu.saleAttrList.length > 0">
            <span v-for="dim in spu.saleAttrList" :key="dim.saleAttrName" class="dim-item">
              {{ dim.saleAttrName }}：{{ dim.saleAttrValueList.join(' / ') }}
            </span>
          </template>
          <span v-else-if="spu" class="dim-item">该 SPU 未定义销售属性</span>
        </div>

        <!-- 已生成：完整性提示 + 表格 -->
        <template v-if="total > 0">
          <el-alert
            v-if="total !== expectedCount"
            type="warning"
            :closable="false"
            show-icon
            class="completeness-alert"
            :title="`完整性提示：该 SPU 应有 ${expectedCount} 个组合，当前只有 ${total} 个 —— 可能由历史写入中断造成，可清空重建`"
          />

          <el-table :data="tableData" border v-loading="loading" row-key="skuId">
            <el-table-column label="组合" min-width="180">
              <template #default="scope">
                <el-tag
                  v-for="value in (scope.row as SkuInfo).skuSaleAttrValueList"
                  :key="value.saleAttrName"
                  size="small"
                  class="combo-tag"
                >
                  {{ value.saleAttrName }}: {{ value.saleAttrValue }}
                </el-tag>
                <span
                  v-if="(scope.row as SkuInfo).skuSaleAttrValueList.length === 0"
                  class="no-dim"
                >
                  （无规格）
                </span>
              </template>
            </el-table-column>
            <el-table-column label="名称" min-width="180" show-overflow-tooltip>
              <template #default="scope">
                <span>{{ (scope.row as SkuInfo).skuName }}</span>
              </template>
            </el-table-column>
            <el-table-column label="价格(元)" width="100" align="right">
              <template #default="scope">
                <span>{{ centsToYuan((scope.row as SkuInfo).price) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="重量(克)" width="90" align="right">
              <template #default="scope">
                <span>{{ (scope.row as SkuInfo).weight }}</span>
              </template>
            </el-table-column>
            <el-table-column label="库存" width="80" align="right">
              <template #default="scope">
                <span>{{ (scope.row as SkuInfo).stock }}</span>
              </template>
            </el-table-column>
            <el-table-column label="图片" width="70" align="center">
              <template #default="scope">
                <el-image
                  v-if="(scope.row as SkuInfo).skuDefaultImg"
                  :src="(scope.row as SkuInfo).skuDefaultImg"
                  class="sku-image"
                  fit="cover"
                />
                <el-image
                  v-else-if="spu?.imageList[0]"
                  :src="spu.imageList[0].imageUrl"
                  class="sku-image"
                  fit="cover"
                />
                <span v-else class="no-dim">无图</span>
              </template>
            </el-table-column>
            <el-table-column label="上架" width="80" align="center">
              <template #default="scope">
                <el-switch
                  :model-value="(scope.row as SkuInfo).isSale"
                  @change="handleToggleSale(scope.row as SkuInfo, $event as boolean)"
                />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80" align="center">
              <template #default="scope">
                <el-button
                  v-permission="'sku:update'"
                  type="primary"
                  size="default"
                  :icon="Edit"
                  @click="handleEdit(scope.row as SkuInfo)"
                />
              </template>
            </el-table-column>
          </el-table>

          <AppPagination
            v-model:page="pageNo"
            v-model:size="limit"
            :total="total"
            class="sku-pagination"
            @current-change="fetchSkuList"
            @size-change="setPageSize"
          />
        </template>

        <!-- 未生成：笛卡尔积生成表单 -->
        <GenerateForm v-else-if="spu" :spu="spu" @success="handleGenerateSuccess" />
      </div>
    </el-card>

    <EditDialog
      v-if="spu"
      v-model="editVisible"
      :sku="editingRow"
      :spu-first-image="spu.imageList[0]?.imageUrl ?? ''"
      @success="handleEditSuccess"
    />
  </div>
</template>

<style scoped lang="scss">
.card-title {
  font-size: 15px;
  font-weight: 600;
}

.sku-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sku-actions {
  display: flex;
  gap: 8px;
}

.spu-context {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 15px;
}

.dim-item {
  font-size: 13px;
  padding: 4px 10px;
  border-radius: 4px;
  background-color: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
}

.completeness-alert {
  margin-bottom: 12px;
}

.combo-tag {
  margin: 2px 6px 2px 0;
}

.no-dim {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.sku-image {
  width: 40px;
  height: 40px;
  display: block;
}

// 分页器间距由父级控制（class 透传到 AppPagination 根元素）
.sku-pagination {
  margin-top: 15px;
  justify-content: flex-end;
}
</style>
