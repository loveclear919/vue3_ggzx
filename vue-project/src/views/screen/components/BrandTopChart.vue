<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import VChart from 'vue-echarts'
import type { BrandValue } from '@/api/dashboard/type'
import { DASH } from '@/styles/dash-tokens.mts'
import { escapeHtml } from '@/utils/html'

const props = defineProps<{ brandTop: BrandValue[]; firstRender: boolean }>()

const chartRef = ref<InstanceType<typeof VChart> | null>(null)
const chartW = ref(0)

const syncWidth = () => {
  chartW.value = chartRef.value?.chart?.getWidth() ?? 0
}

// 刻度密度要跟着**容器**宽度走。ECharts 官方的响应式（baseOption + media）只在 setOption 时求值 ——
// 实测容器 460→322 后调 resize()，刻度纹丝不动，补一次 setOption 才换档；而 vue-echarts 的 autoresize
// 只调 resize()，所以 media 在本项目里等于静态配置。改走官方 onResize 钩子把宽度喂进 option：
// 宽度一变 option 重算，setOption 自然带上新档位。
// 两处同步缺一不可 —— onResize 只在尺寸真的变了才回调，挂载首帧要自己补一次。
watch(
  () => chartRef.value?.chart,
  () => syncWidth(),
  { immediate: true },
)

// 分 → 元；货值量级到千万，坐标轴用「万」压缩，避免长数字把绘图区挤没
const toYuan = (cents: number) => Math.round(cents / 100)

// 刻度间隔的取整阶梯（1 / 1.2 / … ×10ⁿ）
const NICE_STEP = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]

// 坐标轴上限：按「目标 3 段」把数据最大值顶到一个好看的数上。与容器宽度无关，只跟数据走 ——
// 钉住它，条形占比就不会因为换档（或数据刷新时舍入不同）而跳动。
const axisMax = computed(() => {
  const top = Math.max(0, ...props.brandTop.map((b) => toYuan(b.value)))
  if (top <= 0) return undefined
  const rough = top / 3
  const mag = 10 ** Math.floor(Math.log10(rough))
  const interval = (NICE_STEP.find((n) => n >= rough / mag) ?? 10) * mag
  return Math.ceil(top / interval) * interval
})

// 分档。阈值来自实测的「相邻标签最小间隙」，不是拍的：
//   · 300px 起「0/300/600/900/1200 万」5 个标签余量 +6.1px（280px 时只剩 +1.1px，不敢用）
//   · 420px 起 7 个标签余量 +8.4px（360px 时只剩 +1.9px）
// 窄于 300px 时不再关闭数字，而是只标两端：实测 200~300px 之间绘图区被左右标签挤到只剩约 83~170px，
// 放不下完整标尺，但「0 … 上限」两个标签在任意宽度都稳。
const divisions = computed(() => (chartW.value < 420 ? 4 : 6))
const endsOnly = computed(() => chartW.value < 300)

const option = computed(() => ({
  animation: props.firstRender,
  grid: {
    left: 8,
    right: 48,
    top: 8,
    bottom: 8,
    outerBoundsMode: 'same',
    outerBoundsContain: 'axisLabel',
  },
  xAxis: {
    type: 'value',
    // max 与 interval 必须一起钉：只钉 max 时 splitNumber 只是「提示」，实测会排出
    // 0 / 500 / 1000 / 1200 这种最后一段忽然变窄的不均匀刻度
    ...(axisMax.value !== undefined
      ? { max: axisMax.value, interval: axisMax.value / divisions.value }
      : {}),
    splitLine: { lineStyle: { color: DASH.gridLine } },
    axisLabel: {
      color: DASH.textSub,
      formatter: (v: number) => {
        // 窄档只标两端：货值已逐个标在条形右端，刻度只需给出量程
        if (endsOnly.value)
          return v === 0 ? '0' : v === axisMax.value ? `${Math.round(v / 10000)}万` : ''
        return `${Math.round(v / 10000)}万`
      },
    },
  },
  yAxis: {
    type: 'category',
    inverse: true,
    data: props.brandTop.map((b) => b.brandName),
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: DASH.text, fontSize: 13 },
  },
  tooltip: {
    trigger: 'item',
    backgroundColor: DASH.bgDeep,
    borderColor: DASH.border,
    textStyle: { color: DASH.text },
    // 悬浮窗必须完整可见。ECharts 默认把浮窗放进图表容器、贴边只「翻到光标另一侧」，翻过去是负坐标
    // 也没人拦 —— 面板又是 overflow:hidden，于是越界的部分直接被切：实测容器 206×240、浮窗 173×85 时
    // 被切 6460~9860px²（约一半内容看不见）；只翻不裁也不行，翻到左侧会溜出视口（页面 left = -104）。
    //   · appendTo:'body'：DOM 挂到 body，彻底脱离 .panel 的裁剪上下文（ECharts 6 现行 API；appendToBody 已废弃）
    //   · confine:true：再把浮窗锚回图表区域内，堵住「翻出去跑到视口外」那条路
    //   · displayTransition:false：ECharts 6 官方开关（默认 true）。true 时 hide() 只置 visibility:hidden/opacity:0，
    //     盒子留在原地 —— 挂到 body 后它是文档里的绝对定位盒子，窗口缩小后老坐标把文档撑宽：1920 下 hover 本图、
    //     再把视口缩到 1015，实测文档宽 1091 / 视口 1005，多出的 86px 露出 html 白底 = 横向滚动条 + 右侧白条
    //     （缩到 800 时白条 301px）。false 后隐藏即 display:none，盒子彻底退出布局，这条泄漏才不存在。
    // 内容比图表还大时（热力图多 SKU 格）两者都压不住，那就宁可溢出也不能丢内容 —— 这正是 appendTo 的价值。
    confine: true,
    appendTo: 'body',
    displayTransition: false,
    // 货值 + 该品牌的 SKU 结构（货值高但 SKU 少 = 单件贵重，是有效的运营信号）
    // brandName 来自库里的录入内容，tooltip 默认 html 模式会把它当 HTML 插入，必须转义
    formatter: (p: { dataIndex: number }) => {
      const b = props.brandTop[p.dataIndex]
      if (!b) return ''
      return `${escapeHtml(b.brandName)}<br/>库存货值：¥${toYuan(b.value).toLocaleString('zh-CN')}<br/>SKU ${b.skuCount} 个 · 在架 ${b.onSale} 个`
    },
  },
  series: [
    {
      type: 'bar',
      barWidth: 12,
      data: props.brandTop.map((b) => toYuan(b.value)),
      itemStyle: {
        borderRadius: 4,
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 1,
          y2: 0,
          colorStops: [
            { offset: 0, color: DASH.brandBlue },
            { offset: 1, color: DASH.accent },
          ],
        },
      },
      label: {
        show: true,
        position: 'right',
        color: DASH.textSub,
        formatter: (p: { value: number }) => `${(p.value / 10000).toFixed(0)}万`,
      },
    },
  ],
}))
</script>

<template>
  <v-chart
    ref="chartRef"
    class="brand-chart"
    :option="option"
    :autoresize="{ onResize: syncWidth }"
  />
</template>

<style scoped lang="scss">
.brand-chart {
  width: 100%;
  /* 内容驱动布局：图表自身撑出高度，不再依赖父级 flex:1 分配 */
  height: var(--dash-chart-h);

  /* ≤1200 双列档：面板被拉伸，图表改 flex 填充跟随面板（固定高度会让图表在重排后失配） */
  @media (max-width: 1200px) {
    height: auto;
    flex: 1;
    min-height: 180px;
  }
}
</style>
