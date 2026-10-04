<script setup lang="ts">
import { computed } from 'vue'
import type { SkuTodo, TodoCategory } from '@/api/dashboard/type'
import { DASH } from '@/styles/dash-tokens.mts'

const props = defineProps<{ todos: SkuTodo[]; pendingTotal: number }>()

// 三类语义色：待定价=黄（缺价，I11 闸门）、待备货=红（有价无货）、待上架=青（备好了没上）
const CATEGORY_COLOR: Record<TodoCategory, string> = {
  unpriced: DASH.warn,
  zeroStock: DASH.danger,
  notPublished: DASH.accent,
}

// 后端已按「类别优先级 → 货值」排好序，这里只转成展示行
const rows = computed(() =>
  props.todos.map((t) => ({
    ...t,
    priceText: t.price > 0 ? `¥${(t.price / 100).toLocaleString('zh-CN')}` : '—',
    color: CATEGORY_COLOR[t.category],
  })),
)

// 超过上限时提示还有多少条没展示（大屏是提示板，不藏总量）
const hiddenCount = computed(() => Math.max(0, props.pendingTotal - props.todos.length))
</script>

<template>
  <div class="sku-todo">
    <div v-if="rows.length === 0" class="todo-empty">
      ✓ 暂无待办，全部 SKU 已定价、已备货、已上架
    </div>
    <template v-else>
      <div class="todo-head">
        <span>类别</span><span>商品 / 组合</span> <span class="col-price">价格</span
        ><span class="col-stock">库存</span>
      </div>
      <div class="todo-body">
        <!-- key 用后端给的 skuId：列表按「类别优先级 → 货值」排序，30s 轮询后顺序会变，
             用下标做 key 会让 Vue 按位置复用 DOM（官方明确不推荐） -->
        <div v-for="row in rows" :key="row.skuId" class="todo-row">
          <span class="tag" :style="{ color: row.color, borderColor: row.color }">{{
            row.categoryLabel
          }}</span>
          <span class="ellipsis name">
            {{ row.spuName }}<em v-if="row.combo"> · {{ row.combo }}</em>
          </span>
          <span class="num">{{ row.priceText }}</span>
          <span class="num" :class="{ zero: row.stock === 0 }">{{ row.stock }}</span>
        </div>
      </div>
      <div v-if="hiddenCount > 0" class="todo-footnote">
        另有 {{ hiddenCount }} 条待办未展示（共 {{ pendingTotal }} 条）
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.sku-todo {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 表头与数据行**共用同一套 flex 列定义**（写在一处，杜绝两边各写一个 grid-template 而漂移）。
   用 flex 而非 grid 的固定宽度：固定 px 在窄视口下会被挤压溢出（实测 698px 的固定列需求
   在 579px 内容宽里放不下），flex-basis 会按可用空间自动收缩；价格/库存给 min-width 兜住右对齐。 */
.todo-head,
.todo-row {
  display: flex;
  gap: 8px;
  align-items: center;
  padding-inline: 10px;
  font-size: clamp(11px, 0.72vw, 13px);
}

/* 类别标签列：定宽（内容最长「待定价」三字） */
.todo-head > :first-child,
.todo-row > :first-child {
  flex: 0 0 auto;
  width: 58px;
}

/* 商品 / 组合：可伸缩主列，必须允许收缩到 0（否则长文本把右侧两列挤出面板） */
.todo-head > :nth-child(2),
.todo-row > :nth-child(2) {
  flex: 0 1 auto;
  min-width: 0;
}

/* 价格 / 库存：右对齐定宽列。
   min-width 按「表头 2 字 + 数值最长形态」定：价格最长 ¥12,285（7 字符）、库存最长 3 位，
   给足不换行即可 —— 多留的宽度全归主列（商品/组合天天不够用） */
.todo-head > :nth-child(3),
.todo-row > :nth-child(3) {
  flex: 0 0 auto;
  min-width: 56px;
  margin-left: auto; /* 把价格+库存整体推到右缘，主列再长也不影响 */
  text-align: right;
}

.todo-head > :nth-child(4),
.todo-row > :nth-child(4) {
  flex: 0 0 auto;
  min-width: 30px;
  text-align: right;
}

.todo-head {
  flex: 0 0 auto;
  font-size: clamp(10px, 0.65vw, 12px);
  color: var(--dash-text-sub);
  padding-bottom: 6px;
  /* 与 .todo-body 的 scrollbar-gutter:stable 配对：右侧多留一条滚动条宽度，
     否则表头比行宽出 scrollbar 那一截，价格/库存两列会整体错位（且视口一变就变） */
  padding-right: 18px;

  /* 数值列表头必须与数值同为右对齐 —— 否则「价格/库存」贴列左缘、数值贴列右缘，
     列越窄偏得越明显（这正是不同视口下表现不一致的原因） */
  .col-price,
  .col-stock {
    text-align: right;
  }
}

.todo-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* 常驻滚动条槽位：无滚动条时也占位，保证行宽恒等于表头宽 */
  scrollbar-gutter: stable;
  /* 面板高度有限时内部滚动；滚动条压暗避免抢视觉 */
  scrollbar-width: thin;
  scrollbar-color: var(--dash-border) transparent;
}

.todo-row {
  line-height: 1.5;
  padding-block: 5px;
  margin-bottom: 5px;
  border-radius: 6px;
  background: var(--dash-mask-bg);
  color: var(--dash-text);

  .tag {
    font-size: clamp(10px, 0.62vw, 12px);
    line-height: 1.5;
    text-align: center;
    border: 1px solid;
    border-radius: 4px;
    padding: 0 4px;
    white-space: nowrap;
  }

  .ellipsis {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .name em {
    font-style: normal;
    color: var(--dash-text-sub);
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--dash-text-dim);

    &.zero {
      color: var(--dash-danger);
    }
  }
}

.todo-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dash-text-muted);
  font-size: clamp(11px, 0.75vw, 13px);
}

.todo-footnote {
  flex: 0 0 auto;
  margin-top: 4px;
  text-align: right;
  font-size: clamp(10px, 0.65vw, 12px);
  color: var(--dash-text-soft);
}
</style>
