<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ArrowRight } from '@element-plus/icons-vue'
import { getCategoryChildren } from '@/api/category'
import type { CategoryFlatNode } from '@/api/category/type'
import { useLatestRequest } from '@/composables/useLatestRequest'

// 逐级下钻分类选择器：永远只渲染当前层级的平铺列表（分类再多也不撑爆视图）
// 使用方只关心「选中了哪个三级分类」：@select 事件；selectedId 用于回显高亮
const props = defineProps<{ selectedId?: string }>()
const emit = defineEmits<{ select: [node: CategoryFlatNode] }>()

// 下钻路径栈：[] = 正在看一级分类
const categoryPath = ref<CategoryFlatNode[]>([])
// 当前层级的平铺列表
const categoryLevelList = ref<CategoryFlatNode[]>([])
// 层级拉取（只认最后一次请求，防快速连点的竞态）
const { loading: treeLoading, run: runCategoryLevel } = useLatestRequest()

const fetchCategoryLevel = async (parentId?: string) => {
  const list = await runCategoryLevel(() => getCategoryChildren(parentId))
  if (list !== undefined) categoryLevelList.value = list
}

// 点击分类项：一级/二级下钻看子级，三级选中并向外抛 select
const handleCategoryClick = (node: CategoryFlatNode) => {
  if (node.level < 3) {
    categoryPath.value.push(node)
    fetchCategoryLevel(node.categoryId)
  } else {
    emit('select', node)
  }
}

// 面包屑回跳：路径截断到该层级，重新拉对应层级的子级列表
const goBackTo = (index: number) => {
  const parent = categoryPath.value[index]
  if (!parent) return
  categoryPath.value = categoryPath.value.slice(0, index + 1)
  fetchCategoryLevel(parent.categoryId)
}

const goBackToRoot = () => {
  categoryPath.value = []
  fetchCategoryLevel()
}

onMounted(fetchCategoryLevel)
</script>
<template>
  <el-card shadow="never">
    <template #header>
      <span class="card-title">商品分类</span>
    </template>
    <el-breadcrumb separator="/" class="category-crumb">
      <el-breadcrumb-item>
        <a @click.prevent="goBackToRoot">全部</a>
      </el-breadcrumb-item>
      <el-breadcrumb-item v-for="(node, index) in categoryPath" :key="node.categoryId">
        <a v-if="index < categoryPath.length - 1" @click.prevent="goBackTo(index)">{{
          node.name
        }}</a>
        <span v-else>{{ node.name }}</span>
      </el-breadcrumb-item>
    </el-breadcrumb>
    <div v-loading="treeLoading" class="category-list">
      <div
        v-for="node in categoryLevelList"
        :key="node.categoryId"
        class="category-item"
        :class="{ active: props.selectedId === node.categoryId }"
        @click="handleCategoryClick(node)"
      >
        <span>{{ node.name }}</span>
        <el-icon v-if="node.level < 3 && node.hasChildren" class="category-item-arrow">
          <ArrowRight />
        </el-icon>
      </div>
      <el-empty
        v-if="!categoryLevelList.length && !treeLoading"
        description="暂无分类"
        :image-size="60"
      />
    </div>
  </el-card>
</template>

<style scoped lang="scss">
.card-title {
  font-size: 15px;
  font-weight: 600;
}

.category-crumb {
  margin-bottom: 20px;
}

.category-list {
  max-height: 520px;
  overflow-y: auto;
}

.category-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 14px;
  color: var(--el-text-color-regular);
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background-color: var(--el-fill-color-light);
  }

  &.active {
    color: var(--el-color-primary);
    font-weight: 600;
    background-color: var(--el-color-primary-light-9);
  }

  .category-item-arrow {
    color: var(--el-text-color-disabled);
  }
}
</style>
