<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getDashboardStats } from '@/api/dashboard'
import type { DashboardStats } from '@/api/dashboard/type'
import { useLatestRequest } from '@/composables/useLatestRequest'
import '@/utils/echarts'
import KpiCards from './components/KpiCards.vue'
import BrandTopChart from './components/BrandTopChart.vue'
import StatusRing from './components/StatusRing.vue'
import PriceBandChart from './components/PriceBandChart.vue'
import DimHeatmap from './components/DimHeatmap.vue'
import SkuTodoList from './components/SkuTodoList.vue'

// ===== 数据流：拉取 → 30s 轮询 → 防竞态 → 后台暂停 → 卸载清理 =====
const { run } = useLatestRequest()
const stats = ref<DashboardStats | null>(null)
const firstRender = ref(true) // 首屏入场动画；轮询更新一律不重播
const updatedAt = ref('--:--:--')
const fetchFailed = ref(false)
const POLL_INTERVAL = 30_000

// 只有**第一次**请求出声，之后一律静默：失败点已有顶栏的「更新失败」标在持续提示，
// 再每 30s 弹一次全局 toast 不增加任何信息。
// （判据用「是否首次」而不是 stats 是否为空 —— 首次就挂时 stats 恒为空，
//   按后者会退化成每 30s 弹一次，正是要修的那个刷屏）
let firstLoad = true

const fetchStats = async () => {
  const data = await run(() => getDashboardStats({ silent: !firstLoad }))
  firstLoad = false
  if (data) {
    stats.value = data
    updatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    fetchFailed.value = false
    // 首屏入场动画（0.5s）播完后再摘 flag；若同 tick 内翻转，Vue 批处理会让
    // KpiCards 挂载时类名已不存在、动画从未播放（R24 语义保持：轮询更新不重播）
    firstRenderTimer = setTimeout(() => {
      firstRender.value = false
    }, 600)
  } else {
    fetchFailed.value = true
  }
}

let timer: ReturnType<typeof setInterval> | undefined
let firstRenderTimer: ReturnType<typeof setTimeout> | undefined

const stopPolling = () => {
  clearInterval(timer)
  timer = undefined
}
const startPolling = () => {
  stopPolling() // 防重复挂载
  timer = setInterval(() => void fetchStats(), POLL_INTERVAL)
}

onUnmounted(() => {
  stopPolling()
  clearTimeout(firstRenderTimer)
})

// ===== 顶栏时钟 =====
const clock = ref('--:--:--')
const tickClock = () => {
  clock.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
}
let clockTimer: ReturnType<typeof setInterval> | undefined
const stopClock = () => {
  clearInterval(clockTimer)
  clockTimer = undefined
}
const startClock = () => {
  stopClock()
  tickClock()
  clockTimer = setInterval(tickClock, 1000)
}
onUnmounted(stopClock)

// ===== 前台/后台：轮询与时钟共用一套启停 =====
// 依据 Page Visibility API（MDN）—— 看不见的大屏不该继续每 30s 打后端、每秒刷时钟。
// 回来时两者都已过期，所以都是「先补一次再恢复定时」，而不是干等下一个周期。
// （时钟那个 1s 定时器在后台也是实打实的每分钟 60 次唤醒，刷的 DOM 却没人看得见）
const pause = () => {
  stopPolling()
  stopClock()
}
// 首刷与「从后台回来」走同一条路径 —— 挂载时若已在后台（中键新开标签页、
// 或从后台标签直接加载），首刷推迟到可见时，不为没人看的页面花一次请求
const resume = () => {
  startClock()
  void fetchStats()
  startPolling()
}

const onVisibilityChange = () => {
  if (document.hidden) pause()
  else resume()
}

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  if (!document.hidden) resume()
})
onUnmounted(() => document.removeEventListener('visibilitychange', onVisibilityChange))

const router = useRouter()
</script>

<template>
  <div class="screen-viewport">
    <div class="screen-canvas">
      <!-- 顶栏：标题 + 右侧时钟/返回 -->
      <div class="header">
        <div>
          <h1>商品运营数据大屏</h1>
          <div class="sub">COMMODITY OPERATION DASHBOARD · 数据每 30s 自动刷新</div>
        </div>
        <div class="header-right">
          <div class="meta">
            {{ clock }}
            <small>
              数据更新于 {{ updatedAt }}
              <em v-if="fetchFailed" class="fail">· 更新失败</em>
            </small>
          </div>
          <div class="back-btn" @click="router.push('/home')">
            <span class="back-arrow">←</span> 返回后台
          </div>
        </div>
      </div>

      <template v-if="stats">
        <!-- KPI 行：恒为全宽首行、不参与网格列重排，独立于下方面板网格 -->
        <KpiCards
          class="kpi-row"
          :kpi="stats.kpi"
          :stock-value="stats.stockValue"
          :first-render="firstRender"
        />

        <div class="screen-layout">
          <!-- 左列 -->
          <div class="left">
            <div class="panel">
              <div class="panel-title">品牌库存货值 TOP 5</div>
              <BrandTopChart :brand-top="stats.brandTop" :first-render="firstRender" />
            </div>
            <div class="panel">
              <div class="panel-title">SKU 状态分布</div>
              <StatusRing :kpi="stats.kpi" :status="stats.skuStatus" :first-render="firstRender" />
            </div>
          </div>

          <!-- 中央：价格带分布 -->
          <div class="panel center">
            <div class="panel-title">价格带分布（未定价单列）</div>
            <PriceBandChart :bands="stats.priceBands" :first-render="firstRender" />
          </div>

          <!-- 右列：待办清单（占满整列高度 —— 是屏上唯一的「该做什么」入口） -->
          <div class="right">
            <div class="panel todo-panel">
              <div class="panel-title">待办 SKU（共 {{ stats.kpi.pending }} 条）</div>
              <SkuTodoList :todos="stats.todos" :pending-total="stats.kpi.pending" />
            </div>
          </div>

          <!-- 底行：组合理货图 + 品牌货值（原月度趋势/最新动态两面板已按方差判据移除） -->
          <div class="bottom">
            <div class="panel">
              <div class="panel-title">维度组合库存热力图（同款各配置备货情况）</div>
              <DimHeatmap :spus="stats.spus" :skus="stats.skus" />
            </div>
          </div>
        </div>
      </template>

      <el-skeleton v-else class="first-screen-skeleton" :rows="10" animated />
    </div>
  </div>
</template>

<style scoped lang="scss">
/*
  调色板令牌挂在 .screen-viewport —— 页面根容器，是所有消费方（含 6 个子组件）的最近公共祖先，
  跨组件消费只剩一层父子关系，不依赖任何中间元素，最不易失效。
  （曾试过 :global(:root)：能用，但会把大屏专用变量留在全局根上、本页卸载后仍存在；
    挂页面根容器则随页面一起消失，作用域正好。）
  布局类令牌（vw/vh 比例、字号）留在 .screen-canvas —— 只服务本页尺寸，无需更外层。

  ⚠️ 脚本侧（图表 option / 颜色常量）**不要**用这些变量：ECharts 把颜色交给 canvas，
     而 canvas 没有 CSS 级联上下文、不解析 var()，传进去即非法色值并回落黑色。
     脚本侧请 import '@/styles/dash-tokens.mts'（真实色值，脚本侧唯一事实源）。
*/
.screen-viewport {
  // —— 底色 / 表面 ——
  --dash-bg-deep: #{$dash-bg-deep};
  --dash-panel-bg: #{$dash-panel-bg};
  --dash-overlay-bg: #{$dash-overlay-bg};
  --dash-card-gradient: #{$dash-card-gradient};
  --dash-mask-bg: #{$dash-mask-bg};
  --dash-text-fade: #{$dash-text-fade};
  // —— 文字 ——
  --dash-text: #{$dash-text};
  --dash-text-dim: #{$dash-text-dim};
  --dash-text-sub: #{$dash-text-sub};
  --dash-text-hint: #{$dash-text-hint};
  --dash-text-soft: #{$dash-text-soft};
  --dash-text-muted: #{$dash-text-muted};
  --dash-text-faint: #{$dash-text-faint};
  // —— 强调色 ——
  --dash-accent: #{$dash-accent};
  --dash-accent-2: #{$dash-accent-2};
  --dash-brand-gradient: #{$dash-brand-gradient};
  --dash-accent-faint: #{$dash-accent-faint};
  --dash-accent-mid: #{$dash-accent-mid};
  --dash-accent-soft: #{$dash-accent-soft};
  // —— 描边 / 分隔 ——
  --dash-border-strong: #{$dash-border-strong};
  --dash-border-btn: #{$dash-border-btn};
  --dash-border: #{$dash-border};
  --dash-accent-line: #{$dash-accent-line};
  --dash-border-soft: #{$dash-border-soft};
  --dash-accent-glow: #{$dash-accent-glow};
  --dash-accent-border: #{$dash-accent-border};
  --dash-divider: #{$dash-divider};
  --dash-grid-line: #{$dash-grid-line};
  // —— 语义色 ——
  --dash-warn: #{$dash-warn};
  --dash-danger: #{$dash-danger};
  --dash-status-good: #{$dash-status-good};
  --dash-status-idle: #{$dash-status-idle};
  // —— 热力图色阶 ——
  --dash-cell-low: #{$dash-cell-low};
  --dash-cell-empty: #{$dash-cell-empty};
}

.screen-canvas {
  /* ===== 比例类（vw/vh）===== */
  --dash-pad-canvas: clamp(12px, 1.3vw, 26px) clamp(16px, 1.5vw, 30px);
  --dash-gap: clamp(10px, 0.85vw, 18px);
  --dash-col-right: clamp(330px, 24vw, 460px);
  --dash-radius: clamp(8px, 0.65vw, 14px);
  --dash-pad-panel-y: clamp(12px, 1vw, 20px);
  --dash-pad-panel-x: clamp(14px, 1.1vw, 22px);
  --dash-pad-panel: var(--dash-pad-panel-y) var(--dash-pad-panel-x);
  --dash-chart-h: clamp(180px, 26vh, 280px);
  --dash-ring-size: clamp(110px, 14vh, 180px);
  /* 左栏要装下「环 + 图例」这一对：环按视口高定尺寸（14vh），图例按内容定下限（min-content，
     11px 字号下实测 117px，留一位数字余量）。列宽不跟着环走，两者就会在某个视口宽度上打架 ——
     图例换行到环下方，左栏多出一个环高，第 1 行行高被顶起来，右栏「待办 SKU」下方随之空出一块
     （实测 1400×800：左栏 576 vs 不换行的 490）。所以宽度取 max(原来的 19vw, 这一对的实际需要)：
     宽屏本来就装得下，不该白拿中间列（热力图）的宽度；窄屏才按需让位。
     图例自身的 min-content 下限仍是安全网：计数位数再多、字体再变，最坏也只是换行，不会裁切。 */
  --dash-legend-min-w: 124px;
  --dash-col-left: minmax(
    220px,
    max(
      19vw,
      calc(
        var(--dash-ring-size) + var(--dash-gap) + var(--dash-legend-min-w) + 2 *
          var(--dash-pad-panel-x)
      )
    )
  );

  /* 字号类（px 下限 + vw 中段 + px 上限；em 只用于组件内相对倍率） */
  --dash-font-h1: clamp(24px, 1.8vw, 34px);
  --dash-font-sub: clamp(11px, 0.75vw, 14px);
  --dash-font-meta: clamp(18px, 1.3vw, 24px);
  --dash-font-small: clamp(10px, 0.65vw, 12px);
  --dash-font-panel: clamp(12px, 0.8vw, 15px);
  --dash-font-btn: clamp(13px, 0.9vw, 16px);
}

.screen-viewport {
  position: relative;
  width: 100%;
  min-height: 100vh;
  /* 视口底纹 + 双光晕（纯装饰，与内容无关，故不占额外 DOM） */
  background:
    linear-gradient(#{$dash-grid-texture} 1px, transparent 1px) 0 0 / 2.5vw 2.5vw fixed,
    linear-gradient(90deg, #{$dash-grid-texture} 1px, transparent 1px) 0 0 / 2.5vw 2.5vw fixed,
    radial-gradient(60vw 46vh at 15% -10%, #{$dash-glow-blue}, transparent 60%) fixed,
    radial-gradient(55vw 44vh at 88% 110%, #{$dash-glow-cyan}, transparent 60%) fixed,
    var(--dash-bg-deep);
}

.screen-canvas {
  position: relative;
  min-height: 100vh;
  padding: var(--dash-pad-canvas);
  color: var(--dash-text);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

/* ===== 顶栏 ===== */
.header {
  flex: 0 0 auto;
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.4vw clamp(8px, 1.5vh, 16px);

  h1 {
    font-size: var(--dash-font-h1);
    font-weight: 700;
    letter-spacing: 0.3vw;
    background: linear-gradient(90deg, var(--dash-accent-2), var(--dash-accent));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  .sub {
    color: var(--dash-text-sub);
    font-size: var(--dash-font-sub);
    letter-spacing: 0.1vw;
    margin-top: 0.4vh;
  }

  .meta {
    text-align: right;
    font-size: var(--dash-font-meta);
  }
}

/* 以下两条从 .header > .meta 里上提出来的，把嵌套从 4 层降到 2 层。
   安全性：本组件样式已 scoped，且 `.meta` 在 header 内唯一、`small` 是它的唯一子元素、
   `.fail` 全组件仅出现 1 次（改造前实测），故选择器到 `.meta` 一级即无歧义，
   不必再带 `.header` 前缀。样式分组变松是这个改动的已知代价（规则 6 优先）。 */
.meta small {
  display: block;
  font-size: var(--dash-font-small);
  color: var(--dash-text-sub);
  letter-spacing: 0.05vw;
}

.meta .fail {
  color: var(--dash-warn);
  font-style: normal;
}

.header-right {
  display: flex;
  align-items: center;
  gap: clamp(16px, 1.4vw, 28px);
}

.back-btn {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--dash-font-btn);
  font-weight: 500;
  color: var(--dash-text-dim);
  border: 1px solid var(--dash-border-btn);
  border-radius: var(--dash-radius);
  padding: clamp(8px, 1vh, 12px) clamp(14px, 1.2vw, 22px);
  cursor: pointer;
  background: var(--dash-accent-faint);
  transition:
    color 0.2s,
    border-color 0.2s,
    background 0.2s,
    transform 0.2s;

  .back-arrow {
    font-size: 1.1em;
    line-height: 1;
  }

  &:hover {
    color: var(--dash-accent);
    border-color: var(--dash-border-strong);
    background: var(--dash-accent-soft);
    transform: translateX(-2px);
  }
}

/* ===== 布局骨架：grid-template-areas 语义分区 ===== */
.screen-layout {
  display: grid;
  gap: var(--dash-gap);
  grid-template-columns: var(--dash-col-left) minmax(0, 1fr) var(--dash-col-right);
  grid-template-rows: minmax(320px, auto) minmax(200px, auto);
  grid-template-areas:
    'left   center right'
    'bottom bottom bottom';
}

/* KPI 行独立于面板网格：恒为全宽首行，不随网格列数重排（卡片自身的断点在 KpiCards 内部） */
.kpi-row {
  margin-bottom: var(--dash-gap);
}

.left {
  grid-area: left;
}

.center {
  grid-area: center;
}

.right {
  grid-area: right;
}

.bottom {
  grid-area: bottom;
}

/* ===== 面板基础样式 ===== */
.panel {
  background: var(--dash-panel-bg);
  border: 1px solid var(--dash-border-soft);
  border-radius: var(--dash-radius);
  padding: var(--dash-pad-panel);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  /* 顶部细高光：装饰线（绝对定位仅用于装饰，符合「绝对定位只用于装饰」约束） */
  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 20%;
    right: 20%;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--dash-accent-glow), transparent);
  }
}

.panel-title {
  font-size: var(--dash-font-panel);
  color: var(--dash-text-sub);
  letter-spacing: 0.05vw;
  margin-bottom: clamp(8px, 1.2vh, 14px);
  display: flex;
  align-items: center;
  gap: clamp(4px, 0.4vw, 8px);

  /* 标题前的色块：装饰，用伪元素而非额外 DOM */
  &::before {
    content: '';
    width: clamp(3px, 0.22vw, 5px);
    height: clamp(12px, 1.3vh, 16px);
    border-radius: 2px;
    background: linear-gradient(180deg, #{$vivo-blue}, var(--dash-accent));
  }
}

.left,
.right {
  display: flex;
  flex-direction: column;
  gap: var(--dash-gap);
  /* 网格项默认 min-width:auto（min-content 地板）：ECharts canvas 带显式 px 宽，
     会钉住列宽不让收缩 —— 归零后配合轨道 minmax(0,1fr) 才能真正等分 */
  min-width: 0;

  .panel {
    min-height: 240px;
  }
}

/* 右列单面板（待办清单）吃掉整列高度：清单越长越占宽度优势，不需要横向拉伸 */
.right {
  .todo-panel {
    flex: 1;
    min-height: 320px;
  }
}

.center {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 320px;
}

.bottom {
  // 单面板独占整行（原三级分类面板已移除），无需网格列定义
  .panel {
    // 图表 flex:1 填充，面板最小高度保证底行不至于被内容压扁（≤1200 行高 auto 时同样生效）
    min-height: 260px;
  }
}

/* 待办清单行数多 → 列表体内部滚动时标题不随滚动消失。
   注意：滚动发生在 SkuTodoList 内部的 .todo-body（子组件根），panel-title 是它的**兄弟**而非后代，
   所以这里靠「垂直 flex 布局 + 面板 overflow:hidden」实现固定，不需要（也无效）position:sticky。 */
.todo-panel .panel-title {
  flex: 0 0 auto;
}

.first-screen-skeleton {
  width: 100%;
  padding: 2vw;
  /* 喂给 Element Plus skeleton 的令牌：改为引用调色板，避免与其它地方的灰蓝不一致 */
  --el-skeleton-color: #{$dash-skeleton};
  --el-skeleton-to-color: #{$dash-skeleton-to};
}

@media (max-width: 1200px) {
  .screen-layout {
    // minmax(0,1fr)：1fr 默认下限是 min-content（图表 canvas 的显式 px 宽会钉住轨道），
    // 下限归零后两列才真正等分可缩
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-rows: auto;
    grid-template-areas:
      'left   right'
      'center center'
      'bottom bottom';
  }

  .center {
    min-height: 320px;
  }

  .left {
    .panel {
      flex: 1;
    }
  }
}

@media (max-width: 768px) {
  .screen-layout {
    grid-template-columns: 1fr;
    grid-template-areas:
      'left'
      'center'
      'right'
      'bottom';
  }
}
</style>
