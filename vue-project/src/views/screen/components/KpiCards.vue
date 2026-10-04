<script setup lang="ts">
import { computed } from 'vue'
import type { DashboardKpi } from '@/api/dashboard/type'

const props = defineProps<{ kpi: DashboardKpi; stockValue: number; firstRender: boolean }>()

// 库存总价值（分 → 元，千分位）——运营大盘的视觉锚点
const stockValueText = computed(() => (props.stockValue / 100).toLocaleString('zh-CN'))

// 可售率是后端算好的整数（0~100），这里只负责拼「分子/分母」的辅助文案
const sellableHint = computed(() => `${props.kpi.sellable} / ${props.kpi.skuCount}`)

// 品牌覆盖：只显示「有 SPU 的品牌 / 品牌表总数」，落差不藏（空品牌不该混进覆盖率）
const brandCoveredHint = computed(() => `共 ${props.kpi.brandTotal} 个`)

const cards = computed(() => [
  {
    label: '可售率',
    value: props.kpi.sellableRate,
    unit: '%',
    hint: sellableHint.value,
    hero: true,
  },
  {
    label: '库存总价值',
    value: stockValueText.value,
    unit: '元',
    hint: 'Σ 价格 × 库存',
  },
  {
    label: '待办 SKU',
    value: props.kpi.pending,
    unit: '个',
    hint: '待定价 / 待备货 / 待上架',
    warn: true,
  },
  {
    label: '在架 SKU',
    value: props.kpi.onSale,
    unit: '个',
    hint: `下架 ${props.kpi.skuCount - props.kpi.onSale} 个`,
  },
  {
    label: '品牌覆盖',
    value: props.kpi.brandCovered,
    unit: '个',
    hint: brandCoveredHint.value,
  },
])
</script>

<template>
  <div class="kpi-cards">
    <div
      v-for="card in cards"
      :key="card.label"
      class="kpi-card"
      :class="{ 'is-first-render': firstRender, 'is-hero': card.hero }"
    >
      <span class="kpi-label">{{ card.label }}</span>
      <span class="kpi-value">
        <b :class="{ warn: card.warn }">{{ card.value }}</b
        ><em>{{ card.unit }}</em>
      </span>
      <span class="kpi-hint">{{ card.hint }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.kpi-cards {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--dash-gap);
}

.kpi-card {
  background: var(--dash-card-gradient);
  border: 1px solid var(--dash-border-soft);
  border-radius: var(--dash-radius);
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: clamp(12px, 1.4vh, 18px) clamp(10px, 1.1vw, 22px);
  min-width: 0;
  overflow: hidden;

  /* 首屏入场动画；轮询更新不重播 */
  &.is-first-render {
    animation: kpi-in 0.5s ease both;
  }
}

@keyframes kpi-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* 断点体系：1920 基准 5 列 / ≤1200 三列 / ≤768 两列 */
@media (max-width: 1200px) {
  .kpi-cards {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 768px) {
  .kpi-cards {
    grid-template-columns: repeat(2, 1fr);
  }

  .kpi-card {
    min-height: 76px;
  }
}

.kpi-label {
  font-size: clamp(11px, 0.7vw, 13px);
  /* 原先引用了一个从未定义的 --dash-text-secondary，导致兜底值永远生效；已改为直接用真实令牌 */
  color: var(--dash-text-sub);
  letter-spacing: 0.1vw;
}

.kpi-value {
  font-size: clamp(28px, 2vw, 38px);
  font-weight: 700;
  margin-top: 0.4vh;
  color: var(--dash-text);

  /* 可售率卡是视觉锚点：渐变数字 + 单位回落为灰 */
  .is-hero & {
    font-size: clamp(24px, 1.8vw, 32px);
    background: var(--dash-brand-gradient);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;

    em {
      background: none;
      -webkit-background-clip: initial;
      background-clip: initial;
      color: var(--dash-text-sub);
    }
  }

  b.warn {
    color: var(--dash-warn);
  }

  em {
    font-style: normal;
    font-size: clamp(12px, 0.8vw, 15px);
    color: var(--dash-text-sub);
    margin-left: 0.3vw;
  }
}

/* 辅助文案：给出分子/分母，避免「47%」失去参照 */
.kpi-hint {
  margin-top: 0.3vh;
  font-size: clamp(10px, 0.62vw, 12px);
  color: var(--dash-text-hint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
