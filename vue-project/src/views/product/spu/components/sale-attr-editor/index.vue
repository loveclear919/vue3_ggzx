<script setup lang="ts">
import { Plus, Delete } from '@element-plus/icons-vue'
import type { SpuSaleAttr } from '@/api/product/spu/type'
import type { BaseSaleAttrInfo } from '@/api/product/baseSaleAttr/type'
import { SPU_LIMITS } from '../../constants'

// 销售属性动态行编辑器：维度名下拉（字典）+ 多值标签输入 + 行增删
// 行数上限见 SPU_LIMITS.MAX_SALE_ATTR_COUNT；值级长度/个数校验由弹窗提交时负责
const model = defineModel<SpuSaleAttr[]>({ required: true })
defineProps<{ options: BaseSaleAttrInfo[] }>()

const updateValues = (saleAttr: SpuSaleAttr, values?: string[]) => {
  const next = values ?? []
  const unique = next.filter((value, index) => next.indexOf(value) === index)
  if (unique.length !== next.length) ElMessage.warning('属性值已存在')
  saleAttr.saleAttrValueList = unique
}

const addSaleAttr = () => {
  if (model.value.length >= SPU_LIMITS.MAX_SALE_ATTR_COUNT) {
    ElMessage.warning(`最多添加 ${SPU_LIMITS.MAX_SALE_ATTR_COUNT} 个销售属性`)
    return
  }
  model.value = [...model.value, { saleAttrName: '', saleAttrValueList: [] }]
}

const removeSaleAttr = (index: number) => {
  model.value = model.value.filter((_, i) => i !== index)
}
</script>
<template>
  <div class="sale-attr-list">
    <div v-for="(saleAttr, index) in model" :key="index" class="sale-attr-row">
      <el-select
        v-model="saleAttr.saleAttrName"
        placeholder="销售属性名"
        filterable
        class="sale-attr-name-select"
      >
        <el-option
          v-for="opt in options"
          :key="opt.saleAttrId"
          :label="opt.name"
          :value="opt.name"
        />
      </el-select>
      <el-input-tag
        :model-value="saleAttr.saleAttrValueList"
        class="sale-attr-values"
        @update:model-value="(values) => updateValues(saleAttr, values)"
      />
      <el-button :icon="Delete" @click="removeSaleAttr(index)"></el-button>
    </div>
    <el-button :icon="Plus" plain @click="addSaleAttr">添加销售属性</el-button>
  </div>
</template>

<style scoped lang="scss">
.sale-attr-list {
  width: 100%;
}

.sale-attr-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;

  .sale-attr-name-select {
    width: 160px;
  }

  .sale-attr-values {
    flex: 1;
  }
}
</style>
