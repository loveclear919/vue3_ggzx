<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { SkuTodo, TodoCategory } from '@/api/dashboard/type'
import { DASH } from '@/styles/dash-tokens.mts'

const props = defineProps<{ todos: SkuTodo[] }>()

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

/* ---------- 虚拟列表（固定行高窗口化） ---------- */

// 窗口上下各多渲染几行：滚动时不至于露白，也给行高/字号的漂移留缓冲
const OVERSCAN = 3

const bodyRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewportH = ref(0)
// 行高只能实测：字号带 vw（clamp(11px, 0.72vw, 13px)），窄视口下 .tag 的高度还会反超文本行 ——
// 用公式推出来的行高和实际差个零点几像素，几百行滚下来会累积成肉眼可见的错位
const rowH = ref(0)

const total = computed(() => rows.value.length)

const startIndex = computed(() =>
  rowH.value > 0 ? Math.max(0, Math.floor(scrollTop.value / rowH.value) - OVERSCAN) : 0,
)

const endIndex = computed(() => {
  if (rowH.value <= 0) return Math.min(total.value, 1) // 首帧先渲染一行，量出行高再开窗
  const perScreen = Math.ceil((viewportH.value || rowH.value) / rowH.value)
  return Math.min(total.value, startIndex.value + perScreen + 2 * OVERSCAN)
})

const visibleRows = computed(() => rows.value.slice(startIndex.value, endIndex.value))
// 窗口整体平移到位：改 top/padding 会触发布局，translate 只走合成层
const windowOffset = computed(() => startIndex.value * rowH.value)
// 轨道高度 = 总行数 × 行高，滚动范围由它撑出来（DOM 里始终只有窗口那几行）
const trackHeight = computed(() => total.value * rowH.value)
// 滚到底（或本来就装得下）就撤掉底部渐隐，别让眼睛以为下面还有
const atEnd = computed(() => scrollTop.value + viewportH.value >= trackHeight.value - 1)

const measure = () => {
  const body = bodyRef.value
  if (!body) return
  viewportH.value = body.clientHeight
  const firstRow = body.querySelector<HTMLElement>('.todo-row')
  if (firstRow) {
    // 行距写在 CSS（.todo-row 的 margin-bottom），量行高必须带上 ——
    // 每行少算一个行距，窗口一滚就露缝
    const gap = parseFloat(getComputedStyle(firstRow).marginBottom) || 0
    rowH.value = firstRow.getBoundingClientRect().height + gap
  }
}

const onScroll = (e: Event) => {
  scrollTop.value = (e.target as HTMLElement).scrollTop
}

let ro: ResizeObserver | null = null

onMounted(() => {
  void nextTick(measure)
  // 面板随视口/上下排版变高变矮，一屏能放几行也跟着变 —— 盯着滚动容器自己
  ro = new ResizeObserver(measure)
  if (bodyRef.value) ro.observe(bodyRef.value)
})

// 30s 轮询换数据：行数与内容都可能变，行高重量一次（行高只受字号影响，通常是同值）
watch(
  () => props.todos,
  () => void nextTick(measure),
)

onBeforeUnmount(() => ro?.disconnect())
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
      <!-- 虚拟列表：DOM 里只留窗口内的行，轨道按「总行数 × 行高」撑出真实滚动范围。
           滚动条按需求隐藏，但仍可滚（滚轮 / tabindex 聚焦后键盘 / 触摸）；底部渐隐顶替它提示
           「下面还有」；role/aria-label 与每行的 posinset/setsize 补回结构信息 ——
           藏了滚动条又只渲染一部分行，这些只能自己给，读屏才知道这是「第 N 条 / 共 M 条」 -->
      <div
        ref="bodyRef"
        class="todo-body"
        :class="{ 'is-at-end': atEnd }"
        tabindex="0"
        role="list"
        :aria-label="`待办 SKU 列表，共 ${total} 条`"
        @scroll.passive="onScroll"
      >
        <div class="todo-track" :style="{ height: `${trackHeight}px` }">
          <div class="todo-window" :style="{ transform: `translateY(${windowOffset}px)` }">
            <!-- key 用后端给的 skuId：列表按「类别优先级 → 货值」排序，30s 轮询后顺序会变，
                 用下标做 key 会让 Vue 按位置复用 DOM（官方明确不推荐） -->
            <div
              v-for="(row, i) in visibleRows"
              :key="row.skuId"
              class="todo-row"
              role="listitem"
              :aria-posinset="startIndex + i + 1"
              :aria-setsize="total"
            >
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
        </div>
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
  /* 表头与数据行共用的横向内边距 */
  --todo-pad-x: 10px;
  /* 滚动条槽宽：滚动条已按需求隐藏，槽宽归零。表头右内边距 = 行内边距 + 槽宽 ——
     表头是滚动容器的兄弟、蹭不到那条槽，多算一个槽宽，价格/库存两列就会整体错位 */
  --todo-gutter: 0px;
}

/* 表头与数据行**共用同一套 flex 列定义**（写在一处，杜绝两边各写一个 grid-template 而漂移）。
   用 flex 而非 grid 的固定宽度：固定 px 在窄视口下会被挤压溢出（实测 698px 的固定列需求
   在 579px 内容宽里放不下），flex-basis 会按可用空间自动收缩；价格/库存给 min-width 兜住右对齐。 */
.todo-head,
.todo-row {
  display: flex;
  gap: 8px;
  align-items: center;
  padding-inline: var(--todo-pad-x);
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
  /* 与 .todo-body 的槽位配对（见 --todo-gutter）：表头是滚动容器的兄弟，自己补上那条槽宽，
     价格/库存列才和下面每一行对齐 */
  padding-right: calc(var(--todo-pad-x) + var(--todo-gutter));

  /* 数值列表头必须与数值同为右对齐 —— 否则「价格/库存」贴列左缘、数值贴列右缘，
     列越窄偏得越明显（这正是不同视口下表现不一致的原因） */
  .col-price,
  .col-stock {
    text-align: right;
  }
}

.todo-body {
  /* 高度由面板给定（index.vue 的 .todo-panel 用 contain: size 断开了「内容 → 高度」），
     这里只管吃满并允许内部滚动。滚动条一隐藏，同一条链上就不能再靠滚动条高度反推可视区，
     所以虚拟列表必须实测 clientHeight（见 measure） */
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* 藏滚动条但仍可滚：滚动条占位一并消失，槽宽归零、表头那笔补偿跟着收回 */
  scrollbar-width: none;

  &::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  /* 底部渐隐顶替滚动条提示「下面还有」。必须挂在滚动容器自身上才是钉在可视区的
     （挂伪元素会跟着内容一起滚走）；滚到底由 .is-at-end 撤掉，免得骗人 */
  &:not(.is-at-end) {
    mask-image: linear-gradient(to bottom, #000 calc(100% - 20px), transparent);
  }

  /* 没有滚动条可看，键盘用户至少要有可见的焦点位置 */
  &:focus-visible {
    outline: 1px solid var(--dash-accent-border);
    outline-offset: -1px;
  }
}

/* 占位轨道：高度 = 总行数 × 行高，滚动范围由它撑出来 */
.todo-track {
  position: relative;
}

/* 只装窗口内的那几行，整体平移到 startIndex 的位置 */
.todo-window {
  position: absolute;
  top: 0;
  inset-inline: 0;
  will-change: transform;
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
</style>
