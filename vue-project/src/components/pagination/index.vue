<script setup lang="ts">
const page = defineModel<number>('page', { required: true })
const size = defineModel<number>('size', { required: true })
const props = defineProps<{
  total: number
  pageSizes?: number[]
  layout?: string
}>()
const emit = defineEmits<{ 'current-change': []; 'size-change': [] }>()
</script>

<template>
  <el-pagination
    v-model:current-page="page"
    v-model:page-size="size"
    :page-sizes="props.pageSizes ?? [5, 10, 20, 50]"
    background
    size="large"
    :layout="props.layout ?? 'prev, pager, next, jumper, ->, sizes, total'"
    :total="total"
    @current-change="emit('current-change')"
    @size-change="emit('size-change')"
  />
</template>
