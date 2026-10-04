<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import type { PriceBand } from '@/api/dashboard/type'
import { DASH } from '@/styles/dash-tokens.mts'

const props = defineProps<{ bands: PriceBand[]; firstRender: boolean }>()

// 未定价档是语义色（I11 上架闸门的可视化叙事），其余档统一品牌渐变
const bandColor = (band: PriceBand) =>
  band.label === '未定价'
    ? DASH.warn
    : {
        type: 'linear',
        x: 0,
        y: 0,
        x2: 1,
        y2: 0,
        colorStops: [
          { offset: 0, color: DASH.brandBlue },
          { offset: 1, color: DASH.accent },
        ],
      }

const option = computed(() => ({
  animation: props.firstRender,
  grid: {
    left: 8,
    right: 40,
    top: 8,
    bottom: 8,
    outerBoundsMode: 'same',
    outerBoundsContain: 'axisLabel',
  },
  xAxis: {
    type: 'value',
    splitLine: { lineStyle: { color: DASH.gridLine } },
    axisLabel: { color: DASH.textSub },
  },
  yAxis: {
    type: 'category',
    inverse: true, // 未定价在第一档（顶部）
    data: props.bands.map((b) => b.label),
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: DASH.text, fontSize: 13 },
  },
  tooltip: {
    trigger: 'item',
    backgroundColor: DASH.bgDeep,
    borderColor: DASH.border,
    textStyle: { color: DASH.text },
    // 同 BrandTop/DimHeatmap（数据依据见 BrandTopChart 注释）：面板 overflow:hidden 会切掉越界浮窗，
    // 故挂 body 让内容始终可见，再用 confine 把浮窗锚在图表区域内、别翻到视口外
    confine: true,
    appendTo: 'body',
    // 隐藏态必须是 display:none（依据见 BrandTopChart 注释）：挂在 body 的浮窗盒子若只置 visibility:hidden，
    // 会一直留在文档流外的老坐标上，缩小视口时撑出横向滚动条 + 右侧白条
    displayTransition: false,
    formatter: '{b}：{c} 个 SKU',
  },
  series: [
    {
      type: 'bar',
      barWidth: 14,
      data: props.bands.map((b) => ({
        name: b.label,
        value: b.count,
        itemStyle: { color: bandColor(b), borderRadius: 4 },
      })),
      label: { show: true, position: 'right', color: DASH.text },
    },
  ],
}))

// 脚注：分带合计（= SKU 总数）+ 未定价档
// 注意文案：实测未定价 SKU 同时也是零库存、未上架（三态高度重合），
// 所以这里说「未铺货」而不是「待定价待运营」—— 它不是一个独立的定价待办队列
const total = computed(() => props.bands.reduce((sum, b) => sum + b.count, 0))
const unpriced = computed(() => props.bands.find((b) => b.label === '未定价')?.count ?? 0)
</script>

<template>
  <div class="price-band">
    <v-chart class="band-chart" :option="option" autoresize />
    <div class="footnote">
      共 {{ total }} 个 SKU · {{ unpriced }} 个未定价（同为零库存、未上架）
    </div>
  </div>
</template>

<style scoped lang="scss">
.price-band {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.band-chart {
  flex: 1;
  min-height: 0;
  width: 100%;
}

.footnote {
  margin-top: 4px;
  text-align: right;
  font-size: clamp(10px, 0.65vw, 12px);
  color: var(--dash-text-muted);
}
</style>
