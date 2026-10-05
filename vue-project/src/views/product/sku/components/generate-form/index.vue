<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { SpuInfo } from '@/api/product/spu/type'
import { generateSkus } from '@/api/product/sku'
import type { SkuSaleAttrValue } from '@/api/product/sku/type'
import { yuanToCents } from '@/utils/money'
import { SKU_LIMITS } from '../../constants'

// 整组生成表单：按 SPU 销售属性展开笛卡尔积行，运营逐行填价格/重量/库存/上架后一次提交
const props = defineProps<{ spu: SpuInfo }>()
const emit = defineEmits<{ success: [] }>()

interface GenerateRow {
  combo: SkuSaleAttrValue[]
  priceYuan: string // 输入单位为元，提交前走 yuanToCents 字符串换算
  weight: number
  stock: number
  isSale: boolean
}

// 组合数先算乘积数
const combinationCount = computed(() =>
  props.spu.saleAttrList.reduce((acc, dim) => acc * dim.saleAttrValueList.length, 1),
)
const overLimit = computed(() => combinationCount.value > SKU_LIMITS.MAX_COMBINATIONS)

// 笛卡尔积展开
const rows = ref<GenerateRow[]>([])
const buildRows = () => {
  let combos: SkuSaleAttrValue[][] = [[]]
  for (const dim of props.spu.saleAttrList) {
    const next: SkuSaleAttrValue[][] = []
    for (const combo of combos) {
      for (const value of dim.saleAttrValueList) {
        next.push([...combo, { saleAttrName: dim.saleAttrName, saleAttrValue: value }])
      }
    }
    combos = next
  }
  rows.value = combos.map((combo) => ({ combo, priceYuan: '', weight: 0, stock: 0, isSale: false }))
}
// 监听 spuId 而非 spu 对象引用：父组件重新赋值 spu（即使内容相同）不会重建行、清掉已填内容
watch(() => props.spu.spuId, buildRows, { immediate: true })

const dimValue = (row: GenerateRow, dimName: string) =>
  row.combo.find((v) => v.saleAttrName === dimName)?.saleAttrValue ?? ''

const submitting = ref(false)

const handleGenerate = async () => {
  for (const [index, row] of rows.value.entries()) {
    const priceYuan = row.priceYuan.trim()
    if (priceYuan) {
      const cents = yuanToCents(priceYuan)
      if (cents === null) {
        ElMessage.warning(`第 ${index + 1} 行价格格式不合法（最多两位小数）`)
        return
      }
      if (cents > SKU_LIMITS.PRICE_MAX) {
        ElMessage.warning(`第 ${index + 1} 行价格超过上限`)
        return
      }
    }
    if (!Number.isInteger(row.weight) || row.weight < 0 || row.weight > SKU_LIMITS.WEIGHT_MAX) {
      ElMessage.warning(`第 ${index + 1} 行重量不合法（0 ~ ${SKU_LIMITS.WEIGHT_MAX} 克）`)
      return
    }
    if (!Number.isInteger(row.stock) || row.stock < 0 || row.stock > SKU_LIMITS.STOCK_MAX) {
      ElMessage.warning(`第 ${index + 1} 行库存不合法（0 ~ ${SKU_LIMITS.STOCK_MAX}）`)
      return
    }
    if (row.isSale && (yuanToCents(row.priceYuan) ?? 0) <= 0) {
      ElMessage.warning(`第 ${index + 1} 行已勾选上架但未定价`)
      return
    }
  }

  // 零库存上架软提醒（三处入口同一条规则：列表开关 / 编辑弹窗 / 这里）。
  // 生成时勾了上架但库存为 0 的行都是新造的「售罄」，聚合成一次确认 ——
  // 逐行弹窗会把批量操作打断 N 次，而这里用户本来就该逐行核对过表格
  const soldOutCount = rows.value.filter((row) => row.isSale && row.stock <= 0).length
  if (soldOutCount > 0) {
    try {
      await ElMessageBox.confirm(
        `有 ${soldOutCount} 个 SKU 为「在架 + 零库存」，将显示为售罄。确认生成吗？`,
        '零库存上架',
        { type: 'warning', confirmButtonText: '确认生成', cancelButtonText: '取消' },
      )
    } catch {
      return // 用户取消：不提交，表格内容原样保留
    }
  }

  submitting.value = true
  try {
    await generateSkus({
      spuId: props.spu.spuId,
      items: rows.value.map((row) => ({
        skuSaleAttrValueList: row.combo,
        price: yuanToCents(row.priceYuan) ?? 0, // 留空 = 未定价
        weight: row.weight,
        stock: row.stock,
        isSale: row.isSale,
      })),
    })
    ElMessage.success('生成成功')
    emit('success')
  } catch {
    // 失败提示由拦截器弹出（409 已生成 / 400 组合不完整等）
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="generate-section">
    <el-alert
      v-if="overLimit"
      type="error"
      :closable="false"
      show-icon
      :title="`组合数超上限：该 SPU 的销售属性共有 ${combinationCount} 个组合（上限 ${SKU_LIMITS.MAX_COMBINATIONS}），请先调整 SPU 的销售属性`"
    />

    <template v-else>
      <el-table :data="rows" border>
        <el-table-column
          v-for="dim in spu.saleAttrList"
          :key="dim.saleAttrName"
          :label="dim.saleAttrName"
          min-width="110"
        >
          <template #default="scope">
            <span>{{ dimValue(scope.row as GenerateRow, dim.saleAttrName) }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="spu.saleAttrList.length === 0" label="规格" min-width="110">
          <template #default><span class="no-dim">无规格</span></template>
        </el-table-column>
        <el-table-column label="价格(元)" min-width="200">
          <template #default="scope">
            <el-input
              v-model="(scope.row as GenerateRow).priceYuan"
              placeholder="选填，留空 = 未定价"
            />
          </template>
        </el-table-column>
        <el-table-column label="重量(克)" min-width="150">
          <template #default="scope">
            <el-input-number
              v-model="(scope.row as GenerateRow).weight"
              :min="0"
              :max="SKU_LIMITS.WEIGHT_MAX"
              :step="10"
              controls-position="right"
              style="width: 100%"
            />
          </template>
        </el-table-column>
        <el-table-column label="库存" min-width="150">
          <template #default="scope">
            <el-input-number
              v-model="(scope.row as GenerateRow).stock"
              :min="0"
              :max="SKU_LIMITS.STOCK_MAX"
              :step="1"
              controls-position="right"
              style="width: 100%"
            />
          </template>
        </el-table-column>
        <el-table-column label="上架" min-width="70" align="center">
          <template #default="scope">
            <el-switch v-model="(scope.row as GenerateRow).isSale" />
          </template>
        </el-table-column>
      </el-table>
      <div class="generate-footer">
        <el-button
          v-permission="'sku:generate'"
          type="primary"
          :loading="submitting"
          @click="handleGenerate"
        >
          生成 {{ rows.length }} 个 SKU
        </el-button>
        <span class="generate-tip"
          >生成即落库（价格可留空 = 未定价），默认全部下架；单组合停售用「上架」开关控制</span
        >
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.generate-footer {
  margin-top: 15px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.generate-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.no-dim {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
