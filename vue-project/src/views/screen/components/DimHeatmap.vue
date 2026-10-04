<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import VChart from 'vue-echarts'
import type { SpuDim, SkuSnapshot } from '@/api/dashboard/type'
import { DASH } from '@/styles/dash-tokens.mts'
import { escapeHtml } from '@/utils/html'

const props = defineProps<{ spus: SpuDim[]; skus: SkuSnapshot[] }>()

// ===== 尺寸：ECharts 必须在「容器已有确定尺寸」时初始化 =====
//
// 为什么不能只靠 autoresize（vue-echarts 8 源码 dist/index.js 的 useAutoresize）：
//   const resize = () => {
//     if (hasZeroDimension(observedWidth, observedHeight)
//         || observedWidth === chart.getWidth() && observedHeight === chart.getHeight()) return
//     chart.resize()
//   }
// 图表若以 0×0 初始化，之后 ResizeObserver 报来的尺寸一旦与「图表当前尺寸」相同就直接 return，
// 于是永远停在 0×0 —— autoresize 只能跟随变化，救不回零初始化。
//
// 而 ECharts 的宽度解析链（core 的 EChartsInitOpts）是 opts.width || dom.clientWidth || 0：
// v-if 为真挂载 v-chart 的那一刻，父级还在同一次渲染周期里重排，量到的就是 0。
//
// 双保险：
//   1) 容器有确定像素高度（.heat-plot 的 CSS）
//   2) init-options 显式给宽高 —— 量不到时用兜底值先画出来，再用 autoresize 校正
// 高度只做「初始化兜底」：真实高度由 CSS 的 `height: clamp(...)` 决定（随视口响应），
// 这里给一个非 0 的启动值，ECharts 一 init 就不会落到 0×0。300 取的是 CSS clamp 的上限，
// 宁可比实际略大（autoresize 随后校小），也不要给过小值让首帧被压扁。
const FALLBACK_PLOT_HEIGHT = 300
const measureRef = ref<HTMLElement | null>(null)
const initWidth = ref(0)
const initHeight = ref(FALLBACK_PLOT_HEIGHT)

// 只量「当前可见」的绘图区。绝不能用 querySelector 去猜别的元素：
// v-if 未选中时页面上还留着 <v-chart> 的注释占位节点，量到它必是 0×0
const measure = () => {
  const el = measureRef.value
  if (!el) return
  const w = el.clientWidth
  const h = el.clientHeight
  if (w > 0) initWidth.value = w
  if (h > 0) initHeight.value = h
}

// ===== 尺寸策略（v3.11）：cqw 定「一格」的长度，宽高都从它长出来 =====
//
// 弯路全记录（每一版都只修好一段、又把另一段弄平）：
//   · v3.2 裸 flex + height:100%          → 解析成 0，图根本不显示
//   · v3.2 height:300px                   → 不随视口变
//   · v3.8 maxWidth: cols*92+150（426px）  → 2483 视口下像缩略图
//   · v3.9.0 单元格 184×92（常量）          → 上限锁死 672px，718px 以上宽度恒定
//   · v3.9.1 clamp(132px, 6.4vw, 232px)   → 仍从 px 出发，下限把 2000px 以下全夹平
//   · v3.9.2 宽度百分比 + 固定上限          → 上限一到就平；高度被夹后又把格子拉成 4:1
//   · v3.9.3 高度驱动 + 9vw 格子           → 9vw 恒大于面板宽，宽度被面板吃满 → 7:1 长条
//   · v3.10  cqw 定宽 + aspect-ratio 反推高 → 高度整条失效（原因见下）
//   · v3.11  修好比例、宽高同源             → 高度只跟行数走，4×2 的 SPU 图高 695px，整屏被顶出滚动条
//
// 根本教训：**用 vw 猜格子尺寸，既不知道面板多宽、又要同时满足高度上限，必然两头不讨好。**
// 正解是找一个「长度」把两个方向都长出来 —— cqw（容器内联宽度的 1%）就是那个长度。
//
// v3.10 为什么没成（两处独立原因，任一都足以让高度失效）：
//   ① aspect-ratio 的 <ratio> 只吃无量纲 <number>；`calc(3 * 28cqw + 120px)` 是长度表达式，
//      计算值阶段即判无效、声明被丢弃；
//   ② 即便写对了也没用 —— .heat-plot 的 CSS 里还挂着确定的 height，
//      而宽高都为确定值时 aspect-ratio 本就不参与求解。
// 现在：cell 是一个 min() 长度（见下），宽度与高度都由它算，比例恒为 CELL_RATIO_W:1，
// 宽度上限同时作用在高度上；高度再单独受 PLOT_MAX_H 封顶 —— 底行是 100vh 内的最后一行，
// 不能由内容无限撑高（行数多且列数少时，比例算出来的高度会远超可用空间）。
//
// 前提：组件根 `.dim-heat` 上声明了 container-type: inline-size（见样式区）。
const GRID_WIDTH_PCT = 85 // 图占容器宽度的百分比（留 15% 让画面透气）
const MAX_PLOT_W = 1152 // 绝对上限：防超宽屏把格子拉成横条（作用在格子上，宽高同步收紧，比例不崩）
// 单元格宽高比：取 3.2:1 而非 2:1 —— 同样宽度下 2:1 的格子高一截，整图更容易触到高度预算。
// 比例只在预算内成立，超预算时只压高度（见 plotStyle）
const CELL_RATIO_W = 3.2
const AXIS_W = 120 // 左侧行标签预留（yAxis 轴标签区）
const GRID_PAD_Y = 50 // 顶部列标签 + 底部留白，须与 option 的 grid.top/bottom 同步
// 图高预算：1 维条形图的定高与 2 维+ 热力图的高度上限共用这一份（改这里一处即可）。
// 取 vh 是因为它就是「屏幕还剩多少竖向空间」的度量；上下限防止极端视口下过扁或过高。
const PLOT_MAX_H = 'clamp(180px, 26vh, 340px)'

// 列/行数：由选中 SPU 的销售属性维度决定（前两维作行列，其余聚合进格）
const gridCols = computed(() => Math.max(2, sortedDims.value[1]?.saleAttrValueList.length ?? 2))
const gridRows = computed(() => Math.max(1, sortedDims.value[0]?.saleAttrValueList.length ?? 1))

// 单元格宽度：一次 min() 收齐三条约束 —— 容器 85% / 绝对上限 / 不超出容器。
// 三条全部作用在**同一个长度**上，哪条收紧都是等比缩小，不会被某段夹平（这就是用 cqw 的理由）。
// 高度由同一个长度算出后再受 PLOT_MAX_H 封顶：顶到预算时只压高度、不压宽度 ——
// 格子会变扁（宽 ≥ 3.2:1），但不会退化成窄高条，也不会把底行撑出滚动条。
const cellSize = computed(() => {
  const cols = gridCols.value
  return `min(calc(${GRID_WIDTH_PCT}cqw / ${cols}), calc((${MAX_PLOT_W}px - ${AXIS_W}px) / ${cols}), calc((100cqw - ${AXIS_W}px) / ${cols}))`
})

const plotStyle = computed(() => {
  const dims = sortedDims.value
  // 1 维条形图（含空态）：高度取预算，宽度交给 CSS 的 100%
  if (dims.length < 2) return { height: PLOT_MAX_H }
  // --heat-cell 在本元素上转存「一格」，宽高各用一次，避免同一个长表达式写两遍
  return {
    '--heat-cell': cellSize.value,
    width: `calc(var(--heat-cell) * ${gridCols.value} + ${AXIS_W}px)`,
    height: `min(calc(var(--heat-cell) * ${gridRows.value} / ${CELL_RATIO_W} + ${GRID_PAD_Y}px), ${PLOT_MAX_H})`,
  }
})

const selectedSpuId = ref('')
const userPicked = ref(false)

// 默认选中一个「能看出色阶」的 SPU：按各 SPU 的库存合计降序。
// 后端 Spu.find() 无排序，props.spus[0] 实测是 iPhone 16 Pro（组合库存全 0），
// 首屏会渲染成一片零库存灰，观感上等同「图表坏了」。
const defaultSpuId = computed(() => {
  let bestId = props.spus[0]?.spuId ?? ''
  let bestStock = -1
  for (const spu of props.spus) {
    const total = props.skus
      .filter((s) => s.spuId === spu.spuId)
      .reduce((sum, s) => sum + s.stock, 0)
    if (total > bestStock) {
      bestStock = total
      bestId = spu.spuId
    }
  }
  return bestId
})

// 选中项必须始终存在于当前数据里：轮询换数据集 / HMR 时 props 会变，
// 按 mount 时的快照取值会解析成 undefined → 静默落到「暂无数据」空态
const currentSpuId = computed(() => {
  if (props.spus.some((s) => s.spuId === selectedSpuId.value)) return selectedSpuId.value
  return props.spus[0]?.spuId ?? ''
})

const spu = computed(() => props.spus.find((s) => s.spuId === currentSpuId.value))
const spuSkus = computed(() => props.skus.filter((s) => s.spuId === currentSpuId.value))

// 维度排序（按维度值数量降序，平局保持 SPU 定义顺序）：取前两维作行列，其余聚合进格
const sortedDims = computed(() =>
  spu.value
    ? [...spu.value.saleAttrList].sort(
        (a, b) => b.saleAttrValueList.length - a.saleAttrValueList.length,
      )
    : [],
)
const extraDimCount = computed(() => Math.max(0, sortedDims.value.length - 2))

// ===== SPU 选择器：可搜索 + 按一级分类分组 =====
//
// 为什么不用 Element Plus 的默认过滤：源码 useOption.mjs 里是
//   states.visible = new RegExp(query, 'i').test(String(currentLabel))
// 它**只匹配 option 自己的 label，不匹配分组 label** —— 直接分组的话，输入分类名
// 「手机数码」一个商品都搜不到。所以这里用 filter-method 自己过滤，把分类路径一起纳入匹配。
//
// filterMethod 的签名是 (query: string) => void，它只负责「把查询值同步进状态」，
// 真正的过滤由下面 spuGroups 完成（这是官方文档给的用法）。
const filterQuery = ref('')
function onFilterSpu(query: string) {
  filterQuery.value = query
}
function clearFilterSpu() {
  filterQuery.value = ''
}

interface SpuOption {
  spuId: string
  name: string
  /** 完整分类路径文案，作为副标题展示 */
  pathText: string
  /** 参与关键字匹配的文本（SPU 名 + 分类路径），预拼一次避免每次输入重复 join */
  searchText: string
}

const spuGroups = computed(() => {
  const q = filterQuery.value.trim().toLowerCase()
  // 分组：一级分类名；分类链缺失的归入「未分类」（脏数据兜底，不隐藏）
  const groups = new Map<string, SpuOption[]>()
  for (const spu of props.spus) {
    const pathNames = spu.categoryPath.map((c) => c.name)
    const groupLabel = pathNames[0] ?? '未分类'
    const option: SpuOption = {
      spuId: spu.spuId,
      name: spu.name,
      pathText: pathNames.join(' / '),
      // 路径用 '/' 分隔（与展示一致），SPU 名与路径之间用空格分隔。
      // 不要用空格拼路径：查询串自己也可能含空格（如「手机 数码」），
      // 那样会跨层级误匹配（手机数码/手机配件 也能被「手机 数码」命中）
      searchText: `${spu.name} ${pathNames.join('/')}`.toLowerCase(),
    }
    if (q && !option.searchText.includes(q)) continue
    const list = groups.get(groupLabel)
    if (list) list.push(option)
    else groups.set(groupLabel, [option])
  }
  return [...groups.entries()].map(([label, items]) => ({ label, items }))
})

// 选中项的分类路径文案（显示在下拉框下方，避免只靠悬停才知道选的是哪个分类）
const selectedPathText = computed(() =>
  (spu.value?.categoryPath ?? []).map((c) => c.name).join(' / '),
)

const skuValueOf = (sku: SkuSnapshot, dimName: string) =>
  sku.saleAttrValueList.find((v) => v.saleAttrName === dimName)?.saleAttrValue ?? ''

// 单元格：value = [列序号, 行序号, 库存合计]
interface HeatCell {
  value: [number, number, number]
  items: SkuSnapshot[]
}

const grid = computed(() => {
  const dims = sortedDims.value
  if (dims.length < 2) return null
  const rowDim = dims[0]!
  const colDim = dims[1]!
  const cells = new Map<string, HeatCell>()
  for (const sku of spuSkus.value) {
    const rowIdx = rowDim.saleAttrValueList.indexOf(skuValueOf(sku, rowDim.saleAttrName))
    const colIdx = colDim.saleAttrValueList.indexOf(skuValueOf(sku, colDim.saleAttrName))
    if (rowIdx < 0 || colIdx < 0) continue // 快照与定义不一致的脏数据跳过
    const key = `${rowIdx}:${colIdx}`
    const cell = cells.get(key)
    if (cell) {
      cell.value[2] += sku.stock
      cell.items.push(sku)
    } else {
      cells.set(key, { value: [colIdx, rowIdx, sku.stock], items: [sku] })
    }
  }
  const list = [...cells.values()]
  // maxStock 作色阶上锚：至少为 1，避免全零库存时除零
  return { rowDim, colDim, cells: list, maxStock: Math.max(1, ...list.map((c) => c.value[2])) }
})

// ===== 配色：库存量决定明度，零库存单列灰色 =====
// 旧实现按「格内 SKU 数」上色 —— 而 SKU 数是完整笛卡尔积，恒等于 1，整图同一颜色（无效图形）。
// 改按库存上色后，同一张图讲的是「哪个组合备了多少货、哪个组合断了货」。
/* 热力图色阶全部取自 dash-tokens（脚本侧唯一事实源）。
   CELL_LOW / CELL_HIGH 必须是**数值 RGB 数组** —— 它们参与 JS 侧插值计算（Math.round 混合），
   不能用色值字符串。这是脚本侧不能使用 var(--dash-*) 的第二个原因（第一个是 canvas 不解析 var）。 */
const CELL_EMPTY = DASH.cellEmpty // 零库存：低饱和灰，与有色格一眼区分
const CELL_LOW = [...DASH.cellLowRgb]
const CELL_HIGH = [...DASH.cellHighRgb]
const CELL_HIGH_RGB = `rgb(${DASH.cellHighRgb.join(', ')})` // 同 CELL_HIGH，供 ECharts 色阶字符串使用

const cellColor = (stock: number, maxStock: number) => {
  if (stock <= 0) return CELL_EMPTY
  // 0.25 下限：刚有货的格子也要能读出蓝色，不至于黑到看不见
  const t = 0.25 + 0.75 * (stock / maxStock)
  const rgb = CELL_LOW.map((v, i) => Math.round(v + (CELL_HIGH[i]! - v) * t))
  return `rgb(${rgb.join(',')})`
}

const tooltipBase = {
  backgroundColor: DASH.bgDeep,
  borderColor: DASH.border,
  textStyle: { color: DASH.text },
  // 落点规则与 BrandTop/PriceBand 一致（数据依据见 BrandTopChart 的注释）：面板 overflow:hidden 会裁掉
  // 越界的浮窗，所以挂 body 脱离裁剪上下文，再用 confine 把它锚在图内、别翻出视口。
  // 热力图这份尤其需要 appendTo：文案是内容驱动的，一格里的 SKU 越多浮窗越高，能长到比图表本身还大，
  // 那种尺寸 confine 压不住（只能钉在左上角），全靠挂 body 让溢出的部分照常显示而不是被切掉。
  confine: true,
  appendTo: 'body',
  // 隐藏态必须是 display:none（依据见 BrandTopChart 注释）：挂在 body 的浮窗盒子若只置 visibility:hidden，
  // 会一直留在文档流外的老坐标上，缩小视口时撑出横向滚动条 + 右侧白条
  displayTransition: false,
}

// 2+ 维：热力图（其余维度聚合进格）
const heatOption = computed(() => {
  const g = grid.value
  if (!g) return {}
  return {
    animation: true, // 切 SPU 属交互重算，允许过渡
    // ECharts 6 弃用了 grid.containLabel（会打 deprecation 提示），官方等价写法是
    // outerBoundsMode:'same' + outerBoundsContain:'axisLabel' —— 与 BrandTop/PriceBand 同惯例。
    // top 留 32 给 position:'top' 的列标签
    grid: {
      left: 8,
      right: 12,
      top: 32,
      bottom: 8,
      outerBoundsMode: 'same',
      outerBoundsContain: 'axisLabel',
    },
    // ECharts 6 热力图硬性要求配置 visualMap 组件（缺失直接抛错）。格子颜色由 itemStyle 手动插值，
    // visualMap 只满足组件依赖（show:false 不渲染图例条）—— 但 min/max 必须真实，否则 ECharts 会
    // 拿它当默认色阶参与计算，出现「满格同色」的观感
    visualMap: {
      show: false,
      min: 0,
      max: g.maxStock,
      inRange: { color: [CELL_EMPTY, CELL_HIGH_RGB] },
    },
    xAxis: {
      type: 'category',
      data: g.colDim.saleAttrValueList,
      position: 'top',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: DASH.textSub, fontSize: 11 },
    },
    yAxis: {
      type: 'category',
      data: g.rowDim.saleAttrValueList,
      inverse: true, // 行 0 在顶部
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: DASH.textSub, fontSize: 11 },
    },
    tooltip: {
      ...tooltipBase,
      formatter: (p: { dataIndex: number }) => {
        const cell = g.cells[p.dataIndex]
        if (!cell) return ''
        // 属性名与属性值都是库里的人工录入内容，下面这些字符串会进 innerHTML
        // （tooltip 默认 html 模式），拼之前一律转义
        const { rowDim, colDim } = g
        const head =
          `${escapeHtml(rowDim.saleAttrName)} ${escapeHtml(rowDim.saleAttrValueList[cell.value[1]])}` +
          ` · ${escapeHtml(colDim.saleAttrName)} ${escapeHtml(colDim.saleAttrValueList[cell.value[0]])}`
        // 逐条列出库存/价格/状态：聚合格（3+ 维）与零库存格都能定位到具体 SKU
        const lines = cell.items.map((s) => {
          const extra = sortedDims.value
            .slice(2)
            .map((d) => skuValueOf(s, d.saleAttrName))
            .filter(Boolean)
            .join('/')
          const tag = extra ? `${escapeHtml(extra)} ` : ''
          const price = s.price > 0 ? `¥${(s.price / 100).toLocaleString('zh-CN')}` : '未定价'
          return `${tag}库存 ${s.stock} · ${price} · ${s.isSale ? '在架' : '下架'}`
        })
        return `<b>${head}</b><br/>库存合计 ${cell.value[2]}<br/>${lines.join('<br/>')}`
      },
    },
    series: [
      {
        type: 'heatmap',
        // 格内直接标库存数：不回头悬停也能读出量级
        label: {
          show: true,
          color: DASH.text,
          fontSize: 11,
          formatter: (p: { value: number[] }) => String(p.value[2]),
        },
        emphasis: { itemStyle: { borderColor: DASH.accent, borderWidth: 1 } },
        data: g.cells.map((c) => ({
          value: c.value,
          itemStyle: {
            color: cellColor(c.value[2], g.maxStock),
            borderColor: DASH.bgDeep,
            borderWidth: 2,
            borderRadius: 3,
          },
        })),
      },
    ],
  }
})

// 1 维：降级条形图（同样按库存合计上色，口径与热力图一致）
const barOption = computed(() => {
  const dim = sortedDims.value[0]
  if (!dim) return {}
  const totals = dim.saleAttrValueList.map((v) =>
    spuSkus.value
      .filter((s) => skuValueOf(s, dim.saleAttrName) === v)
      .reduce((sum, s) => sum + s.stock, 0),
  )
  const maxStock = Math.max(1, ...totals)
  return {
    animation: true,
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
      splitLine: { lineStyle: { color: DASH.gridLine } },
      axisLabel: { color: DASH.textSub },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: dim.saleAttrValueList,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: DASH.text, fontSize: 12 },
    },
    tooltip: { ...tooltipBase, formatter: '{b}：库存合计 {c}' },
    series: [
      {
        type: 'bar',
        barWidth: 14,
        label: { show: true, position: 'right', color: DASH.text },
        data: totals.map((v) => ({
          value: v,
          itemStyle: { color: cellColor(v, maxStock), borderRadius: 4 },
        })),
      },
    ],
  }
})

// 当前渲染的分支决定用哪个 option（与模板 v-if 严格一致，避免「渲染了 A 却喂了 B 的 option」）
const chartOption = computed(() =>
  sortedDims.value.length === 1 ? barOption.value : heatOption.value,
)

// 只有真的有东西可画才渲染 v-chart：否则图区是空的，ECharts 仍会以 0 尺寸初始化并告警
const canRenderChart = computed(
  () => !!spu.value && spuSkus.value.length > 0 && sortedDims.value.length > 0,
)

const stockSummary = computed(() => {
  const g = grid.value
  const total = spuSkus.value.reduce((sum, s) => sum + s.stock, 0)
  if (!g) return { total, emptyCells: 0, cellCount: 0 }
  return {
    total,
    emptyCells: g.cells.filter((c) => c.value[2] <= 0).length,
    cellCount: g.cells.length,
  }
})

onMounted(async () => {
  await nextTick()
  selectedSpuId.value = defaultSpuId.value
  userPicked.value = false
  measure()
  observeSize()
})

// 容器尺寸变化时同步「初始化兜底尺寸」。
// 注意这不负责重绘：真正的 resize 由 v-chart 的 autoresize（自带 ResizeObserver）完成，
// v-if 常真、组件不重挂载，所以 init-options 不会重新生效 —— 这里只是让兜底值不落伍，
// 万一图表被重新创建（切 SPU 走 1 维/2 维不同分支等）时能拿到当前真实尺寸。
let sizeObserver: ResizeObserver | undefined
let resizeFrame = 0

function observeSize() {
  const el = measureRef.value
  if (!el || typeof ResizeObserver === 'undefined') return
  sizeObserver = new ResizeObserver(() => {
    // 视口连续缩放会高频触发，合并到下一帧，避免每像素都写响应式状态
    cancelAnimationFrame(resizeFrame)
    resizeFrame = requestAnimationFrame(() => measure())
  })
  sizeObserver.observe(el)
}

onBeforeUnmount(() => {
  sizeObserver?.disconnect()
  cancelAnimationFrame(resizeFrame)
})

// 渲染分支出现/切换时也要重新量一次
watch(canRenderChart, async (ok) => {
  if (!ok) return
  await nextTick()
  measure()
})

watch(defaultSpuId, (id) => {
  if (!userPicked.value && id) selectedSpuId.value = id
})

function onPickSpu() {
  userPicked.value = true
}
</script>

<template>
  <div class="dim-heat">
    <!-- 工具条：左侧当前分类路径 + 右侧 SPU 选择（可搜索，按一级分类分组） -->
    <div class="heat-bar">
      <span class="path-note" :title="selectedPathText">
        <template v-if="selectedPathText">{{ selectedPathText }}</template>
        <template v-else-if="extraDimCount > 0">其余 {{ extraDimCount }} 维已聚合进格</template>
      </span>
      <!-- placement 首选上方：热力图是整页最后一行，而 .screen-canvas 有 min-height:100vh，
           选择框下方只剩画布内边距 —— 放不下浮层，默认的 bottom-start 每次都要靠 flip 翻上去。
           写成 top-start 是让它第一步就落在正确方向：省掉一次「先按下方算、再翻面」的摆位，
           入场动画的方向也才和实际展开方向一致（EP 的缩放动画是从 placement 侧长出来的）。
           注意这只是**首选**：popper 的 flip 仍在，上方空间不足时它照样会翻到下方。
           （top-start 是 Element Plus placement 的合法取值，取自 popper 的 placements 枚举） -->
      <el-select
        v-model="selectedSpuId"
        class="heat-select"
        size="small"
        popper-class="dash-select-popper"
        placement="top-start"
        placeholder="搜索商品名或分类"
        filterable
        clearable
        :filter-method="onFilterSpu"
        @change="onPickSpu"
        @clear="clearFilterSpu"
      >
        <el-option-group v-for="g in spuGroups" :key="g.label" :label="g.label">
          <el-option v-for="s in g.items" :key="s.spuId" :label="s.name" :value="s.spuId">
            <!-- 副标题给完整分类路径：同名商品可分（也是「按分类搜索」的可视回报） -->
            <span class="opt-name">{{ s.name }}</span>
            <span v-if="s.pathText" class="opt-path">{{ s.pathText }}</span>
          </el-option>
        </el-option-group>
      </el-select>
    </div>

    <!-- 绘图区：高度由 CSS clamp 响应式决定，宽度上限由 plotStyle 按列数给出。
         ref 直接挂在这个 div 上（它才是 v-chart 的真实父级，也是尺寸测量对象） -->
    <div ref="measureRef" class="heat-plot" :style="plotStyle">
      <VChart
        v-if="canRenderChart"
        class="heat-chart"
        :option="chartOption"
        :init-options="{ width: initWidth, height: initHeight }"
        autoresize
      />
      <div v-else class="heat-empty">
        <template v-if="!spu">暂无数据</template>
        <template v-else-if="spuSkus.length === 0">该 SPU 暂无 SKU</template>
        <template v-else>该 SPU 无销售属性，无组合视图</template>
      </div>
    </div>

    <!-- 图例：色阶语义显式写出（大屏不靠悬停解释自己） -->
    <div v-if="canRenderChart && sortedDims.length >= 2" class="heat-footnote">
      <span class="lg"><i class="sw" :style="{ background: CELL_EMPTY }"></i>零库存</span>
      <span class="lg"><i class="sw grad"></i>库存越多越亮</span>
      <span class="sum">
        库存合计 {{ stockSummary.total }} · {{ stockSummary.emptyCells }}/{{
          stockSummary.cellCount
        }}
        格零库存
      </span>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 容器查询上下文：**必须声明，否则内联的 cqw 单位无效**（会退化成 0 → 图又变 0 尺寸）。
   inline-size 只建立内联方向的查询容器，不影响高度解析。
   浏览器基线：项目未设 browserslist，按现代浏览器处理（容器查询 Chrome105+/Safari16+/FF110+）。 */
.dim-heat {
  container-type: inline-size;
  /* 自包含网格：不依赖祖先的 flex 链传递高度（那正是 0×0 的来源） */
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 6px;
  align-content: start;
  /* 局部暗色令牌：只作用于本面板内的 el-select 输入框。
     为什么这几个必须留在 .dim-heat 而不能搬去 popper 块 —— 它们服务的是**输入框本身**
     （EP 的 .el-select__wrapper 读 --el-border-color / --el-fill-color / --el-text-color-* 等），
     而输入框在面板内、不在 Teleport 出去的浮层里。
     浮层另有自己的一套（见文件末尾非 scoped 块里的 .dash-select-popper），两者用途不同、值也不同，
     不是重复声明。经核对 Element Plus 的 select/skeleton 规则，下列 6 个确实是 EP 会读取的，
     其余曾在此处的 7 个已删除（2 个 EP 从不读取、5 个与 popper 块重复）。 */
  --el-fill-color-blank: var(--dash-bg-deep);
  --el-fill-color: var(--dash-text-fade);
  --el-text-color-placeholder: var(--dash-text-sub);
  --el-border-color: var(--dash-border);
  --el-border-color-hover: rgba(0, 229, 255, 0.6);
  --el-color-primary: var(--dash-accent);
}

.heat-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

/* 左侧当前分类路径（替代原来的聚合提示：路径信息量更高，聚合提示已并入脚注语境） */
.path-note {
  font-size: clamp(10px, 0.65vw, 12px);
  color: var(--dash-text-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.heat-select {
  width: min(240px, 48%);
  flex: 0 0 auto;
}

/* 绘图区：**高度必须可计算**（ECharts 要 clientHeight 才能 init，这是本规则存在的唯一理由）。
   高度一律由内联样式给出（两个分支都有，见 plotStyle），不落在 CSS 里 ——
   它是 PLOT_MAX_H 单一事实源，写两份必然漂移；宽度 2 维+ 也是内联，1 维用这里的 100%。 */
.heat-plot {
  position: relative;
  width: 100%;
  min-width: 0;
  margin-inline: auto; /* 配合内联宽度：窄于面板时居中 */
}

.heat-chart {
  width: 100%;
  height: 100%;
}

.heat-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dash-text-faint);
  font-size: clamp(11px, 0.75vw, 13px);
}

.heat-footnote {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: clamp(10px, 1vw, 18px);
  font-size: clamp(10px, 0.65vw, 12px);
  color: var(--dash-text-hint);

  .lg {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
  }

  .sw {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    display: inline-block;
  }

  .sw.grad {
    background: linear-gradient(90deg, var(--dash-cell-low), var(--dash-accent));
  }

  .sum {
    margin-left: auto;
    white-space: nowrap;
  }
}

/* 选项内两行内容（名称 + 分类路径），是插槽内容 —— VNode 在**本组件**的 render 里创建，
   所以能带上 scope id，本块能选中它（这也正是它没跟着浮层规则一起搬走的原因）。
   ⚠️ 但值不能用 var(--dash-*)：这两行 DOM 生在 Teleport 出去的浮层里，自定义属性只沿祖先链继承，
   而浮层与 .screen-viewport 是 body 下两条并列分支 —— 取不到，必须编译期落成真实色值。
   浮层本身的规则见文件末尾那个非 scoped 的 style 块。 */
.opt-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #{$dash-text};
}

.opt-path {
  display: block;
  font-size: 10px;
  color: #{$dash-text-hint};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

<!-- 浮层样式：**必须是第二个、且不 scoped 的 style 块**（Vue SFC 支持多块，只有 scoped 的那块会加 scope id）。 -->
<style lang="scss">
/*
  作用对象是 el-select 的下拉浮层（popper-class="dash-select-popper"）。

  为什么不能写在上面那个 scoped 块里：
    1) 浮层被 Element Plus Teleport 到 body（es/components/tooltip/src/content.mjs 里 teleported 默认 true），
       不在本组件的 DOM 子树里 —— scoped 规则会带上 [data-v-xxx]，永远选不中。
    2) 也不能用 :global(.dash-select-popper) .el-select-dropdown__item 这种写法：
       实测 Vue 3.5.41 的 scoped 插件在「:global() 后面还有后代选择器」时，会把后代部分丢掉，
       编译产物只剩 .dash-select-popper{...}，于是选项、分组、箭头的样式全被套到了浮层本身上。
       （见 @vue/compiler-sfc/dist/compiler-sfc.cjs.js:8583 的 :global 分支：它 replaceWith 后直接 return，
        且 :global 不参与下面 extractAndWrapNodes 的嵌套重写。修起来比重开一个全局块复杂，不如绕开。）
   独立成块后本块完全不过 scoped 插件，Sass 展开的嵌套规则原样输出。

  ⚠️ 变量一律用 SCSS 插值编译期落值，不能写 var(--dash-*)：
     --dash-* 定义在 .screen-viewport 上，而浮层是 body 的直系子节点 —— 两者是 body 下的并列分支，
     自定义属性只沿祖先链继承，这里取不到 → 整条声明在计算值阶段作废，
     最终由 .el-popper.is-light 回落成透明底（下拉「没有背景色」的直接原因）。
     （注释里也别写出插值符号本身：Sass 对块注释同样求值，空插值直接编译报错。）
     这么做还顺带把浮层的暗色钉死了 —— 否则亮色主题下 --el-fill-color-light = #f5f7fa（近白），
     配组件写死的青色文字，hover 时对比度只有 1.43:1，字几乎看不见。

  对比：输入框那套 --el-* 覆盖在 .dim-heat 块里、沿用 var(--dash-*)，那是对的 ——
  输入框在面板内部，确在 .screen-viewport 的子树里。两者用途不同、值也不同，别互相复制。
*/
.dash-select-popper {
  /* 暗色令牌：大屏恒深色，下拉也不跟随全局主题 */
  --el-bg-color-overlay: #{$dash-overlay-bg};
  --el-fill-color-light: #{$dash-border-soft};
  --el-text-color-regular: #{$dash-text};
  --el-text-color-secondary: #{$dash-text-sub};
  --el-border-color-light: #{$dash-accent-line};
  --el-color-info: #{$dash-text-sub};

  background: #{$dash-overlay-bg} !important;
  border: 1px solid #{$dash-border} !important;

  .el-select-dropdown__item {
    color: #{$dash-text};
    /* 两行式选项（名称 + 分类路径）：放开固定高度，不再挤成一行省略号。
       EP 默认 height/line-height = 34px，两行内容必须一起覆盖 */
    height: auto;
    min-height: 36px;
    line-height: 1.5;
    padding-top: 6px;
    padding-bottom: 6px;

    /* hover 高亮：比面板底色亮一档的青，保证「底色与文字」都有对比 */
    &.is-hovering {
      background: #{$dash-border-soft};
    }

    &.is-selected {
      background: #{$dash-accent-mid};
      color: #{$dash-accent};
      font-weight: 600;
    }

    /* EP 的 is-disabled 用 background-color: unset —— 语义色改由透明度表达 */
    &.is-disabled {
      color: #{$dash-text-faint};
    }
  }

  /* 分组标题（一级分类名）：作为「分类收窄」的可视骨架 */
  .el-select-group__title {
    color: #{$dash-text-sub} !important;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    line-height: 22px;
    padding-left: 12px;
  }

  .el-select-group {
    border-bottom: 1px solid #{$dash-divider};
    margin: 0;
    padding: 0;
    list-style: none;

    &:last-child {
      border-bottom: none;
    }
  }

  .el-popper__arrow::before {
    background: #{$dash-overlay-bg} !important;
    border-color: #{$dash-border} !important;
  }
}
</style>
