<script setup lang="ts">
import type { SpuAttrForm } from '../../types'

// 平台属性行编辑器：属性名展示 + 属性值候选下拉（values 作候选，allow-create 可填列表外新值）
const model = defineModel<SpuAttrForm[]>({ required: true })
defineProps<{ loading?: boolean }>()
</script>
<template>
  <div v-loading="loading" class="platform-attr-list">
    <div v-for="attr in model" :key="attr.attrName" class="platform-attr-row">
      <span class="platform-attr-name">{{ attr.attrName }}</span>
      <el-select
        v-model="attr.attrValue"
        filterable
        allow-create
        default-first-option
        :placeholder="`请输入或选择${attr.attrName}`"
        class="platform-attr-value"
      >
        <el-option v-for="opt in attr.valueOptions" :key="opt" :label="opt" :value="opt" />
      </el-select>
    </div>
    <el-empty v-if="!model.length" description="该分类暂无平台属性" :image-size="60" />
  </div>
</template>

<style scoped lang="scss">
.platform-attr-list {
  width: 100%;
}

.platform-attr-row {
  display: flex;
  align-items: center;
  margin-bottom: 10px;

  .platform-attr-name {
    flex-shrink: 0;
    width: 90px;
    padding-right: 12px;
    text-align: right;
    color: var(--el-text-color-regular);
  }

  .platform-attr-value {
    flex: 1;
  }
}
</style>
