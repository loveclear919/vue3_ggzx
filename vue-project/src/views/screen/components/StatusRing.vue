<script setup lang="ts">
import { computed } from 'vue'
import VChart from 'vue-echarts'
import type { DashboardKpi, SkuStatus } from '@/api/dashboard/type'
import { DASH } from '@/styles/dash-tokens.mts'

const props = defineProps<{ kpi: DashboardKpi; status: SkuStatus; firstRender: boolean }>()

// 三段互斥且完备（合计 = SKU 总数）——由后端直接给出，前端不再做减法推导。
// 历史坑：「在架 · 未定价」曾是一段，但 I11 上架闸门保证在架必已定价，该扇区恒为 0，
// 白白占一个图例位；现已收敛为三段。
const segments = computed(() => [
  { name: '在架', value: props.status.onSale, color: DASH.statusGood },
  { name: '下架 · 已定价', value: props.status.offPriced, color: DASH.statusIdle },
  { name: '下架 · 未定价', value: props.status.offUnpriced, color: DASH.warn },
])

const option = computed(() => ({
  animation: props.firstRender,
  series: [
    {
      type: 'pie',
      radius: ['62%', '82%'],
      // 不写 center：ECharts 默认 ['50%','50%'] 即图心，环心文字用 CSS 居中同一个点。
      // 曾写死 ['42%','50%'] 给图例让位，但那是「用魔数对齐另一个魔数」——
      // 环心文字要跟着写 left: calc(var(--ring-size) * 0.42) 手工同步，图例一改宽就漂移。
      avoidLabelOverlap: true,
      label: { show: false },
      emphasis: { scaleSize: 4 },
      itemStyle: { borderColor: DASH.bgDeep, borderWidth: 2 },
      data: segments.value.map((s) => ({
        name: s.name,
        value: s.value,
        itemStyle: { color: s.color },
      })),
    },
  ],
}))
</script>

<template>
  <div class="status-ring">
    <!-- 环与环心文字同处一个定尺寸盒子：文字居中 = 图心，几何只有一个事实源 -->
    <div class="ring-wrap">
      <v-chart class="ring-chart" :option="option" autoresize />
      <div class="ring-center">
        <span class="skuCount">{{ kpi.skuCount }}</span>
        <span>SKU 总数</span>
      </div>
    </div>
    <div class="ring-legend">
      <div v-for="s in segments" :key="s.name" class="legend-row">
        <span class="dot" :style="{ background: s.color }"></span>
        <span>{{ s.name }}</span>
        <em class="count">{{ s.value }}</em>
      </div>
      <!-- 环心是「总量」，这里给「可售占比」：同一个环回答「有多少」和「有多少能用」 -->
      <span class="rate-chip">可售率 {{ kpi.sellableRate }}%</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.status-ring {
  /* 定位上下文已下移到 .ring-wrap（环心文字只相对环定位），这里不再需要 position: relative */
  display: flex;
  align-items: center;
  /* 面板拉伸填满中行后，环+图例在面板剩余区内垂直居中（留白收进面板内） */
  flex: 1;
  justify-content: center;
  gap: var(--dash-gap);
  /* 图例换行是安全网，不是常态：左栏宽度已按「环 + 图例 min-content」反推（见 index.vue 的
     --dash-col-left），1201px 以上实测均为并排。留着它兜底的是数据/字体漂移 —— 计数位数再多、
     字号再变，最坏也只是图例掉到环下方（拿满面板宽度、环照旧居中），而不是被 overflow:hidden 裁掉。
     历史教训：环按视口高定尺寸（14vh）而列宽按视口宽定尺寸（19vw），两者脱钩时 1200~1450px
     图例只剩 30~90px，「● 下架 · 未定价 57」整行要 116px —— 文字冲出面板、圆点被压成 0 宽。 */
  flex-wrap: wrap;
  /* 内容驱动：高度 = 环形图 / 图例中较高者 + padding，不再 flex:1 依赖父级 */
  padding-top: 8px;
  --ring-size: var(--dash-ring-size);
}

/* 环 + 环心文字的共同定位盒（尺寸的唯一来源）。
   文字不再按「图占满容器」的假设定位 —— 那需要和 option 的 center 手工同步，改一处忘一处就偏。 */
.ring-wrap {
  position: relative;
  width: var(--ring-size);
  height: var(--ring-size);
  flex-shrink: 0;
}

.ring-chart {
  width: 100%;
  height: 100%;
}

.ring-center {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  pointer-events: none;

  .skuCount {
    display: block;
    font-size: clamp(20px, 1.2vw, 26px);
    color: var(--dash-text);
  }

  span {
    font-size: clamp(10px, 0.65vw, 12px);
    color: var(--dash-text-sub);
  }
}

.ring-legend {
  display: flex;
  flex-direction: column;
  gap: clamp(6px, 1vh, 10px);
  font-size: clamp(11px, 0.7vw, 13px);
  /* 换行的触发线 = 图例自身的 min-content（最长一行的实测宽，约 116px）。
     之前是 min-width: 0，等于允许把图例压到 0 宽 —— 内容就只能溢出面板被裁。 */
  min-width: min-content;
  flex: 1;

  .legend-row {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--dash-text);
    white-space: nowrap;

    .dot {
      width: 10px;
      height: 10px;
      border-radius: 3px;
      /* 图标不是可伸缩内容：它没有文字，min-content 为 0，容器一紧就被挤没（实测 0~6.4px） */
      flex: 0 0 auto;
    }

    .count {
      /* 数字紧跟文字（R37）：不再 margin-left:auto 拉开——面板变宽时「文字最左、数字最右」观感散 */
      margin-left: 8px;
      color: var(--dash-text-sub);
      font-variant-numeric: tabular-nums;
    }
  }

  .rate-chip {
    /* 列 flex 容器默认 align-items: stretch 会把子项拉满整列宽 —— chip 要按内容收缩，
       用 align-self: flex-start 退出拉伸（legend-row 的 count 右对齐仍依赖拉伸，不能动容器级） */
    align-self: flex-start;
    font-size: 12px;
    color: var(--dash-accent);
    border: 1px solid var(--dash-accent-border);
    border-radius: 4px;
    padding: 2px 8px;
    margin-top: 4px;
  }
}
</style>
