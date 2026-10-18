# 商品运营数据大屏设计方案

> 状态：方案定稿 **v3.1（已实施）**。v3.0 按「可运营 / 有方差 / 不冗余」三条判据重做面板取舍（详见 §3.0 与变更记录）；v3.1 完成文档与实现对齐。本文自包含。

## 1. 目标与定位

面向简历演示的**供应侧商品运营大屏**：所有数据来自项目真实数据实时聚合（品牌/SPU/SKU 三表），不造假销售数据。定位一句话：**「大屏不是装饰画，是把运营后台的存量数据聚合成可运营的指标」**。

技术展示点：ECharts 按需注册、单次并行查询 + 内存聚合、vw 响应式大屏布局、30s 轮询防竞态、SKU 组合库存热力图（本项目数据模型独有）、**面板取舍方法论（见 §3.0）**。

## 2. 现状盘点（已核实）

| 项 | 现状 |
|---|---|
| 页面 | `views/screen/index.vue`；路由 `/screen` 顶级独立路由（constantRoutes）；**静态页放开判权（2026-10-18 定案）：人人可见，无权限门**（守卫无检查、首页入口卡无 v-permission、后端接口仅 auth） |
| 数据 | 实测：SPU 13 / SKU 100 / 在架 47 / 下架 53 / 未定价 15 / 品牌 21（有 SPU 的仅 9） / 三级分类 12 / 库存总价值约 ¥2057 万 |
| 分类接口 | `GET /category` 是**逐级下钻**接口（无参数返回一级，?parentId= 返回子级）——不能直接给大屏组树 |
| 树工具 | 前端 `utils/listToTree.ts`（平铺 → 树，含孤儿/环防御）——**当前大屏已无消费方**（旭日图面板按判据移除） |
| 竞态工具 | `composables/useLatestRequest.ts` 可复用（30s 轮询防竞态） |
| 色板 | mockup 已定案并通过校验器（暗色类别 5 色 + 状态 4 色，品牌蓝青仅外壳） |
| mockup | `docs/design/dashboard-mockup.html`（旧 6 面板版，**尚未按 v3 刷新**） |

## 3. 内容设计（5 面板）

### 3.0 面板取舍判据（v3 核心方法，面试主菜）

一个面板值得占屏，必须**同时**满足三条，缺一即砍：

| 判据 | 含义 | 反例（本项目实测） |
|---|---|---|
| **可运营** | 回答「该补什么、该改什么价、该清什么」 | 「SPU 总数」只是表行数，不产生任何动作 |
| **有方差** | 数值随操作变化，图形有形状 | 「最新动态」10 行 `updatedAt` 毫秒级全同 → 排序未定义、内容随机 |
| **不冗余** | 不与其他面板算同一件事 | 「待定价」与「零库存」在实测数据里是同一批 SKU（15 个未定价全部零库存且下架） |

按此判据砍掉的三个面板，理由是**结构性**的而非「数据不够」：

1. **月度趋势** —— 用 `createdAt` 按自然月分组，而 `createdAt` 是「入库时刻」不是业务事件时间。当年数据只跨 16 天（2026-09 的 8 条 + 2026-10 的 92 条），6 个月窗口 4 根空柱。要讲「上新节奏」需先给 SPU/SKU 加 `publishedAt`。
2. **最新动态滚动表** —— 按 `updatedAt` 倒序取 10 条，但整表同批写入（示例 10 行时间戳完全相同），等值排序结果由存储引擎决定，不构成事件流。商品域没有真实增删改事件流时，这个面板只能是装饰。
3. **三级分类旭日图 + `categoryNodes`** —— 分类树 SPU 数对「商品运营」无叙事，且前端零消费；后端白算白传（每 30s 一次）。

被**改造保留**的两个：

- **KPI 行**：6 个里 4 个是表行数（SPU/SKU/品牌/分类），换成「可售率 / 库存总价值 / 待办数 / 在架数 / 品牌覆盖」。
- **维度热力图**：旧实现按「格内 SKU 数」上色，但**每格 SKU 数恒等于 1** —— 13 个 SPU 的 SKU 数全部严格等于维度值数量的几何乘积（完整笛卡尔积），`maxCount` 永远为 1，整图同一颜色。**这是统计量选错，不是数据量不足**。改按 **stock 上色**后，同一张图讲「哪个组合备了多少货、哪个组合断了货」。

### 3.1 五个面板

| # | 面板 | 业务含义 | 数据来源 |
|---|---|---|---|
| 1 | KPI×5：**可售率**（hero）/ 库存总价值 / **待办 SKU** / 在架 SKU / 品牌覆盖 | 全部可运营；`sellableRate` 后端算好，卡片带「分子/分母」辅助文案 | 单次遍历累积 |
| 2 | **价格带分布（中央大图）** | 定价健康度：**「未定价」单列 0 档**，与真实价格带并列 | SKU 分桶（纯函数 `bucketPrice`） |
| 3 | **品牌库存货值 TOP 5** | 品牌集中度（**货值口径**，非建档数） | spuId→brandId 映射 + 内存聚合 |
| 4 | SKU 状态环（**三段**）+ 可售率芯片 | 上下架结构；旧「在架 · 未定价」段由 I11 保证恒为 0，已删 | 状态分组 |
| 5 | **维度组合库存热力图**（SPU 切换下拉） | 同款各配置的备货分布——`skuSaleAttrValueList` 快照独有 | SKU 快照，前端按选中 SPU 重算 |
| 6 | **待办 SKU 清单**（右列整高） | 屏上唯一「该做什么」入口：待定价 / 待备货 / 待上架 | 单次遍历三分类（互斥） |

**布局**（vw/vh 响应式填充视口）：

```
┌──────────────────────────────────────────────────────────┐
│ 顶栏标题 + 实时时钟                                          │
├──────────────────────────────────────────────────────────┤
│ KPI×5                                                      │
├───────────┬──────────────────────┬───────────────────────┤
│ 品牌货值    │                      │                       │
│  TOP5     │    价格带分布          │   待办 SKU 清单         │
├───────────┤    （中央大图）        │   （占满整列高度）       │
│ SKU 状态环 │                      │                       │
├───────────┴──────────────────────┴───────────────────────┤
│ 维度组合库存热力图（SPU 切换 · 按 stock 上色）                │
└──────────────────────────────────────────────────────────┘
```

布局与 CSS 实现一一对应：`.screen-layout` 的 `grid-template-areas` 为 `'left center right' / 'bottom bottom bottom'`；右列 `.todo-panel` 单面板 `flex:1` 吃掉整列高度，列表体内部滚动（子组件 `SkuTodoList` 的 `.todo-body` 设 `overflow-y:auto`）——面板标题是滚动区的**兄弟节点**，靠垂直 flex + 面板 `overflow:hidden` 天然固定，**不需要 `position:sticky`**（用它会失效且误导）。≤1200px 重排为 `left|right`、`center center`、`bottom bottom`；≤768px 单列。

## 4. 后端设计

### 4.1 聚合接口：`GET /api/dashboard/stats`

- 路由 `routes/dashboard.ts`：仅 `auth`（**放开判权定案**：静态页人人可见，登录即可访问；原 `requirePermission('/screen')` 已移除）
- 服务 `services/dashboard.ts`：单请求内 `Promise.all` 并行全量查询，**单次遍历**内完成 KPI 累积 + 分带计数 + 待办三分类（关注点合并，避免多次全表扫描）：

| 字段 | 聚合方式 |
|---|---|
| `kpi` | 单次遍历累积：`skuCount` / `sellable`（已定价∧在架）/ `sellableRate`（后端四舍五入）/ `onSale` / `pending`（待办去重计数）/ `brandCovered`（**有 SPU 的品牌数**，非 Brand 表行数）/ `brandTotal` |
| `stockValue` | 遍历内 `Σ price × stock`（分） |
| `priceBands` | 分桶计数 **Map**（`label → count`，O(1) 查表；旧实现每 SKU 扫 7 档数组）；输出顺序固定为 `PRICE_BAND_LABELS` |
| `brandTop` | SKU 按 `spuId → brandId` 归并到品牌，**按库存货值倒序**取 5（附 `skuCount`/`onSale` 供 tooltip 讲结构） |
| `skuStatus` | 三段互斥完备：`onSale` / `offPriced` / `offUnpriced`（合计 = `skuCount`） |
| `todos` | 待办三分类**互斥**（`if/else` 链，未定价优先于零库存）：`unpriced` \| `zeroStock` \| `notPublished`；排序按「类别优先级 → 类内货值降序」，截断 12 条 |
| `skus` | 精简快照（spuId + saleAttrValueList + price + stock + isSale）：热力图与待办清单数据源，**换 SPU 重算无需二次请求** |
| `spus` | SPU 元数据（spuId/name/saleAttrList）：热力图下拉来源 |

**已移除字段**：`monthlyTrend`、`categoryNodes`（理由见 §3.0）；`skus[].updatedAt`（旧滚动表专用，已无消费方）。

**空集合兜底**：全量查询 + 内存聚合天然对空库安全（空数组 → 各计数 0、比率 0、`priceBands` 仍返回 7 个 0 档）。`sellableRate` 分母为 0 时取 0，不做除法。

**分桶定案（v3 修正语义）**：边界写**分值**（cents），**判定用严格小于（下闭上开）**：

| 档位 | 范围（分） | 范围（元） |
|---|---|---|
| 未定价 | `p ≤ 0`（含负数脏数据） | —（单列，status-warning 语义） |
| 低端 | `0 < p < 10000` | 0-100 |
| 入门 | `10000 ≤ p < 50000` | 100-500 |
| 中端 | `50000 ≤ p < 200000` | 500-2000 |
| 高端 | `200000 ≤ p < 500000` | 2000-5000 |
| 旗舰 | `500000 ≤ p < 1000000` | 5000-10000 |
| 超旗舰 | `p ≥ 1000000` | 10000+ |

> **历史 bug（已修）**：旧实现判定用 `p <= 上界`，导致 ¥100 / ¥500 / ¥2000 / ¥5000 / ¥10000 这些整点价**整体错开一档**、与标签字面不符（¥100 落进「0-100元」）。现改为严格小于，整点价归属下一档，与标签一致。边界测试锁死该语义（改回 `<=` 会红）。

### 4.2 聚合分工原则

**静态聚合归后端，交互重算归前端（内存内重算）**——aggregate 管道在数据库侧做重活，前端只做「换 SPU 看热力图」这类即时交互。

**规模闸门**：当前实现是「一次全量查询 + 内存聚合」（SKU 百级、KB 级负载、单次往返）。**SKU > 2000 时**切换为 `aggregate` 管道 + 服务端聚合 + `skus` 分页，触发条件由本节约束（判据：单次响应体 > 500KB 或聚合耗时 > 100ms）。

### 4.3 边界测试（大屏段，含 v3 重写）

1. **200 形状**：断言含 `kpi/priceBands/brandTop/skuStatus/todos/skus/spus`，并**反向断言**不含 `monthlyTrend/categoryNodes`（防字段回潮）；`priceBands` 恰为 7 档
2. **数值一致性**：`kpi` 各计数与直连库对照、`stockValue` 与直连库求和对照；`brandCovered` 与「SPU 引用到的品牌集合大小」对照
3. **状态三不变式**：`onSale + offPriced + offUnpriced === skuCount`（互斥完备）+ `offUnpriced === 未定价且未上架数` + `sellable ≤ onSale`（I11：在架必有价）
4. **待办契约**：`todos.length ≤ pending`（服务端截断）、`category` 只能是三类之一、且 `unpriced`/`zeroStock` 条目必须真的缺价或缺货
5. **无权限角色 403**：造空角色用户（user 角色含 `/screen`，测不了普通用户，需专门造）
6. **分桶纯函数断言**：`bucketPrice` 在 `backend/src/utils/priceBand.ts`（与 pagination/mongoError 同级，tsx 可 import），**逐档断言整点价归属**（10000/50000/200000/500000/1000000 分）+ 负数与极大值兜底

## 5. 前端设计

### 5.1 依赖与按需注册

`echarts@6.1.0` + `vue-echarts@8.3.1`（2026-10-01 查询的最新稳定版；安装时以实际解析为准并验证 API）。`use([...])` 只注册**用到的**，集中在 `src/utils/echarts.ts`（单一注册入口，组件不各自 `use`）：

**实际注册清单（v3，已对齐实现）**：`CanvasRenderer` + `BarChart` / `PieChart` / `HeatmapChart` + `GridComponent` / `TooltipComponent` / `VisualMapComponent`。

**v3 移除 `LineChart`**：月度趋势面板已按判据砍掉，全屏再无折线图，故不再注册（tree-shaking 的直接收益）。
**v3 移除 `LegendComponent`**：全部图表都不声明 ECharts `legend` —— 状态环的图例是手写 DOM（`.ring-legend`），不依赖该组件。
**`VisualMapComponent` 必须保留**：它是 ECharts 6 热力图的硬性依赖，缺失时 `heatmap` 直接抛错——与「颜色由 `itemStyle` 手动控制」无关（`show: false` 只隐藏图例条）。这条容易在「清理无用注册」时被误删。

### 5.2 页面骨架（screen/index.vue）

1. **路由归属（R12/R19/R21/R28/R29 修订，后被 v3.14 放开判权简化）**：`/screen` 是**顶级独立路由**（不在动态路由内、不经 layout 外壳渲染），当前窗口整页打开——从根上避开 layout 内 keep-alive/transition 嵌套产生的视图冻结问题。**放开判权（2026-10-18）**：人人可见——无 meta.code、守卫无检查、首页入口卡无 v-permission；「只勾大屏」的落地死局问题（R12→R29→R33）随权限门一并退役
2. **vw/vh 响应式适配（R32 定案，替代 scale）**：
   - `/screen` 是**独立 URL 的页面**（`127.0.0.1:5173/screen`），性质上就是响应式页面——vw/vh 单位等比铺满视口，**无 transform 缩放、无守卫页、无留白**
   - **为什么推翻 scale（R32 证据链）**：scale 方案在 M2 实现阶段连续踩坑（grid 居中轨道溢出 R31、面板内百分比高度无视标题导致重合），根源是「固定 1920 画布 + transform」的非自然布局模型——每个非 1920 视口都要付摩擦成本；而 vw 布局是真等比（无发虚、canvas 原生分辨率、ECharts `autoresize` 原生适配）
   - **布局规格（v3.7，已对齐实现）**：全部尺寸走 `.screen-canvas` 上的 CSS 变量（`--dash-pad-canvas` / `--dash-gap` / `--dash-col-left: minmax(220px, 19vw)` / `--dash-col-right: clamp(330px, 24vw, 460px)` / `--dash-radius` / `--dash-pad-panel` / `--dash-chart-h` / `--dash-ring-size` 与一组 `--dash-font-*`），值用 `clamp(px下限, vw中段, px上限)`——既等比又保住极小窗口的可读下限。**右列比左列宽是有意的**：它是「待办 SKU」工作队列，表头 4 列 + 商品/组合文本需要空间（v3.7 由 18vw 提到 24vw，实测 1700 视口下原宽度把商品名挤到几乎不可读）；上限 460px 是因为再宽只增长留白（商品名走省略号）反而挤压中央大图
   - **图表**：`v-chart` 加 `autoresize`；底纹 `2.5vw` 网格随视口等比
   - **深色底**：viewport 层显式深色（不跟主题变量）+ 底纹 + 光晕
3. **数据流**：onMounted 拉取 → 30s `setInterval` 轮询 → 复用 `useLatestRequest` 防竞态 → onUnmounted 清理定时器与 `firstRender` 延时器
4. **数据新鲜度与失败语义（R11）**：顶栏时钟旁显示「数据更新于 HH:mm:ss」（成功时更新）；**轮询失败保留旧数据**（useLatestRequest 把失败与「被新响应顶掉」压成同一个 undefined——对大屏是可接受的有意行为，文档明确）+ 时间戳旁「更新失败」细微提示
5. **恒深色**：大屏不参与全局暗黑切换（与侧边栏同哲学）；色板用 mockup 定案的角色变量（`--series-1..5` 类别色、`--status-*` 状态色、品牌蓝青仅外壳——**已通过校验器**）
6. **面板组件拆分（v3，6 个）**：`views/screen/components/` 下 `KpiCards` / `PriceBandChart` / `BrandTopChart` / `DimHeatmap` / `StatusRing` / `SkuTodoList`——screen 页只做布局与数据分发。**已删除** `TrendChart` / `ScrollTable`（面板砍掉后无消费方）；未落地的 `SunburstChart` / `HeroNumber` 不再规划（HeroNumber 的库存总价值已并入 KPI 卡）

**术语约定（R27，防同名混用）**：

| 术语 | 指什么 | DOM / 代码里的名字 |
|---|---|---|
| **底纹** | 铺在 viewport 层的背景方格纹理（两道 `linear-gradient` + `background-size: 2.5vw`） | `.screen-viewport` 的 `background` |
| **布局栅格** | 三列容器（`--dash-col-left` / `1fr` / `--dash-col-right`） | `.screen-layout`（mockup 里叫 `.grid`，实现改用此名） |
| **栅格线** | ECharts 折线/柱状图上的参考线 | ECharts `splitLine` |

> 这三样此前都被叫作「网格」——实现前必须按上表统一，尤其 `.screen-grid` 这种命名会被误读成底纹层。

**四态定义（R7/R13 修订）**：

| 态 | 表现 |
|---|---|
| 加载态 | **仅首屏无数据时**面板级骨架屏（el-skeleton，暗色）——30s 轮询的 loading 不得驱动骨架屏，否则整屏每 30s 闪一次 |
| 空态 | 「暂无数据」暗色空态文案（热力图：无 SPU / 该 SPU 无 SKU / 无销售属性三种分别给文案） |
| 错误态 | 保留旧数据 + 顶栏「更新失败」提示；首屏失败才显示整屏错误 + 重试按钮 |
| 403 | 拦截器统一文案（后端 message）；大屏页不做特殊处理 |

### 5.2.1 令牌挂载点与「脚本侧色值」规范（v3.12 定案，两处硬约束）

调色板在 `src/styles/variables.scss` 定义（**风格侧**），并由 index.vue 暴露为 CSS 自定义属性供子组件消费。这里有两条**踩过并已修正**的硬约束：

**① 跨组件消费的令牌必须挂「页面根容器」，不要挂组件根类、也不必用 `:global(:root)`**

- 起因：调色板原挂在 `.screen-canvas`，期望子组件靠自定义属性继承消费，实测**未生效**（面板底色、图表轴文字色全部落空，表现为「颜色没应用」）。
- 现状（v3.13 定案）：调色板挂 **`.screen-viewport`** —— 它是模板最外层容器（`.screen-viewport > .screen-canvas > 面板/图表`），是所有消费方的**最近公共祖先**，跨组件消费只剩一层父子关系、不依赖任何中间元素。
- **为什么不用 `:global(:root)`**（v3.12 曾用，可用但更差）：`:root` 会把大屏专用变量挂到全局根上，本页卸载后变量仍留在 `documentElement` 上；挂页面根容器则**随页面一起销毁**，作用域正好。`:root` 方案还需 `:global()` 转义来绕开 scoped 附加的属性选择器，属额外复杂度。
- **布局令牌仍留 `.screen-canvas`**：它们是 `vw/vh` 比例量与字号，只服务本页元素，无需挂到更外层。
- **判据**：令牌要被**跨组件**消费 → 挂**页面根容器**；只被**本页/本组件**消费 → 挂组件根类。

**② 脚本侧（图表 option / 颜色常量）必须用真实色值，禁用 `var(--dash-*)`**

- 起因：ECharts 把颜色交给 **canvas API**（`fillStyle` / `addColorStop`），而 canvas 没有 CSS 级联上下文、`getComputedStyle` 也帮不上，传 `var(...)` 进去即非法色值。实测控制台报
  `'var(--dash-cell-empty)' is an illegal color, fallback to '#000000'`，
  且 `'#{$vivo-blue}'` 这类**被写进 JS 字符串的 SCSS 插值**会抛
  `addColorStop ... could not be parsed as a color` —— 该异常每帧重绘都触发，错误数持续增长。
- 修正：新增 `src/styles/dash-tokens.mts` 作为**脚本侧唯一事实源**，导出 `DASH`（真实色值常量），脚本一律 `import { DASH } from '@/styles/dash-tokens.mts'`。
- 附带约束：热力图色阶的 `CELL_LOW` / `CELL_HIGH` 必须是**数值 RGB 数组**（参与 `Math.round` 插值混合），不能用色值字符串——这是脚本侧不能用字符串的第二个原因。
- **两侧分工口诀**：样式用 `var(--dash-*)`（浏览器解析）｜脚本用 `DASH.*`（真实色值）。改色时 `variables.scss` 与 `dash-tokens.mts` **必须同步**。

### 5.3 面板实现要点

| 面板 | 要点 |
|---|---|
| KpiCards | 5 张卡：**可售率**（hero 渐变数字）/ 库存总价值 / **待办 SKU**（warn 色）/ 在架 SKU / 品牌覆盖。每张卡带一行 `hint` 辅助文案（可售率给「47 / 100」分子分母、品牌覆盖给「共 21 个」）——**避免百分比失去参照**；**仅首屏入场动画**（30s 轮询不重播） |
| PriceBandChart | 横向柱状；「未定价」档用 status-warning 色 + 直标数值（一档一色是语义色，非类别色）；轴坐标文案必须与 `bucketPrice` 的**下闭上开**语义一致（整点价归下一档） |
| BrandTopChart | 横向柱状；**口径是库存货值**（分 → 元，坐标轴与标签压缩为「万」）；tooltip 追加该品牌的 `SKU 数 / 在架数`——讲出「货值高但 SKU 少 = 单件贵重」这类结构信号 |
| DimHeatmap | SPU 选择器（**可搜索 + 按一级分类分组**，v3.4）：`el-select` 加 `filterable`，用 `el-option-group` 按分类路径首段分组，选项两行式（商品名 + 完整分类路径）。**必须用自定义 `filter-method`**——Element Plus 的默认过滤（源码 `useOption.mjs`：`new RegExp(query,'i').test(String(currentLabel))`）**只匹配 option 自己的 label，不匹配分组 label**，直接分组会导致「输入分类名搜不到商品」；`filterMethod: (query: string) => void` 只负责把查询值同步进组件状态，真正的过滤在 `spuGroups` computed 里做（匹配「SPU 名 + 分类路径」，路径用 `/` 拼接 —— 用空格拼会让含空格的查询串跨层级误匹配）。分组数据来自后端 `spus[].categoryPath`（一级→三级正序，后端上溯时带 `visited` 防环 + 深度封顶），脏数据路径为空时归入「未分类」兜底，不隐藏。<br>绘图区：行=维度1值、列=维度2值、**格值 = 库存合计（stock）**。**颜色语义**：`stock ≤ 0` → 低饱和灰 `#2a3346`（一眼看出「哪个配置断了货」）；`stock > 0` → 深蓝→品牌青按 `stock/maxStock` 插值，**下限 0.25 防止刚有货的格子黑到看不见**。旧实现按「格内 SKU 数」上色是无效图形（完整笛卡尔积下恒为 1，整图同色），详见 §3.0。格内直标库存数 + 面板脚注给图例与「N/M 格零库存」；**维度数场景（R8）**：0 维 →「该 SPU 无销售属性，无组合视图」；1 维降级条形（同样按库存合计上色，口径一致）；2 维正常热力；3+ 维取维度值最多的前两维为行/列，其余聚合进格求和，tooltip 逐条列出完整组合 |
| StatusRing | **三段互斥完备**（由后端 `skuStatus` 直接给出，前端不再做减法推导）：在架=status-good / 下架已定价=中性灰 / 下架未定价=status-warning。中心显示 SKU 总数，图例下方给「可售率 N%」芯片。**旧「在架 · 未定价」段已删**——I11 上架闸门保证在架必有价，该扇区恒为 0，白占图例位 |
| SkuTodoList | 屏上唯一「该做什么」入口。三分类互斥（待定价 / 待备货 / 待上架）带语义色标签 + 商品·组合 + 价格 + 库存；后端已按「类别优先级 → 类内货值降序」排序并截断 12 条，**超出时脚注明示「另有 N 条未展示」**（提示板不藏总量）；`.todo-body` 内部滚动，面板标题是滚动区的兄弟节点、靠垂直 flex 天然固定（不需要 `position:sticky`）。<br>**对齐契约（v3.7 定案，踩过坑）**：表头与数据行**共用同一套 flex 列定义**（写在一处，杜绝两边各写一个 `grid-template` 而漂移）：类别 `width:58px` / 商品·组合 `flex:0 1 auto; min-width:0` / 价格 `min-width:56px` / 库存 `min-width:30px`，价格列 `margin-left:auto` 把两个数值列整体推向右缘。两条硬约束：① **数值列表头必须与数值同为 `text-align:right`** —— 否则表头贴列左缘、数值贴列右缘，列越窄偏得越明显（表现为「不同视口下对齐不一致」）；② **`.todo-body` 必须 `scrollbar-gutter:stable`，表头右侧补等宽 padding** —— 滚动条会吃掉行的内容宽度使行比表头窄，右侧两列整体错位，且视口决定滚动条是否出现（所以失配量随视口变化）。**用 flex 而非固定 px 的 grid**：固定列宽在窄视口下会溢出面板（实测固定列需求 698px 而内容宽仅 579px），flex-basis 可自动收缩 |

**图表更新与渲染规范（R24）**：

- **轮询不得重播入场动画**：首屏 `animation: true`，30s 轮询更新一律 `animation: false`（用一个 `firstRender` 标志切换）——否则每次 `setOption` 全量替换都会让每张图重跑入场动画（柱子从 0 长出、折线扫入），整屏每 30s 抖一次；与 KpiCards「仅入场动画」同源
- **init 分辨率**：`echarts.init(el, null, { devicePixelRatio: Math.max(window.devicePixelRatio, 2) })`——高分屏高清渲染
- **autoresize 必开（R32）**：vw 响应式布局下容器尺寸随视口变化，`v-chart` 必须加 `autoresize`（vue-echarts 内置 ResizeObserver 适配）——这是响应式相对 scale 方案的「零成本换来的原生适配」
- **图表容器必须有「确定尺寸」，且不能依赖 `autoresize` 救场（v3.2 定案，两层失效机制）**：

  **第 1 层 —— 以 0×0 初始化**：ECharts 的尺寸解析链是 `initOptions.width || dom.clientWidth || 0`（core 的 `EChartsInitOpts`）。Vue 在 `v-if` 为真时挂载 `v-chart` 的那一刻，父级还在**同一次渲染周期**里重排，`clientWidth/clientHeight` 量到 0，画布即 0×0，控制台报 `[ECharts] Can't get DOM width or height`。

  **第 2 层 —— `autoresize` 救不回来**（这是关键，别指望它兜底）：vue-echarts 8 `dist/index.js` 的 `useAutoresize` 里，resize 函数首行是
  ```js
  if (hasZeroDimension(observedWidth, observedHeight)
      || observedWidth === chart.getWidth() && observedHeight === chart.getHeight()) return
  ```
  图表一旦停在 0×0，ResizeObserver 报来的尺寸只要与「图表当前尺寸」相同就直接 return —— `autoresize` 只跟随**变化**，不做零初始化恢复。

  **规范（两条一起做，缺一不可）**：
  1. **容器给确定高度**，且**不要**把它挂在 `flex: 1` / 百分比高度链上 —— 那条链在祖先高度为 `auto` 时会解析成 0（`flex-basis: 0%` + 祖先 `min-height: 0` 让 `max-content` 贡献同样塌成 0）。采用**自包含网格**：组件根 `display: grid; grid-template-rows: auto 1fr auto`，绘图区高度用 `height: clamp(180px, 26vh, 300px)` —— **是 clamp 而不是固定 px**（v3.8 修正：初版写死 300px 导致高度不随视口响应，与其余图表用 `--dash-chart-h` 的口径也不一致）。clamp 同样满足「确定高度」，只是下限保极小窗口可读、上限防超高视口把图拉成竖条。
  2. **`init-options` 显式给宽高**（`{ width, height }`）作为兜底：量得到就用真实值，量不到就用常量先在正确尺寸下画出来，再由 `autoresize` 校正。`width`/`height` 为 0 时 ECharts 会按「未指定」回落 DOM（不会因为 0 而画成 0）。
  3. **尺寸用容器查询单位 `cqw` 换算，不要用 `vw` 猜（v3.10 定案，踩了 6 版才走对）**：
     ```ts
     // .dim-heat { container-type: inline-size }  ← 前提，缺了 cqw 会退化成 0
     const GRID_WIDTH_PCT = 85, MAX_PLOT_W = 1152, CELL_RATIO_W = 3.2
     cellW = `${85 / cols}cqw`，cellH = `${85 / cols / 3.2}cqw`
     maxWidth: `min(cols*cellW + AXIS_W, ${MAX_PLOT_W}px, 100%)`
     aspectRatio: `(cols*cellW + AXIS_W) / (rows*cellH + GRID_PAD_Y)`
     ```
     **为什么必须换掉 `vw`**：`vw` 是视口量，而图表要填的是**面板**宽度 —— 两者没有固定比例，于是每一版都只能靠猜系数，且必然在某段被夹平。`cqw` 直接是容器内联尺寸的 1%，「面板多宽 → 图多宽」变成直接换算。
     **两条硬约束（缺一必崩）**：① **宽度必须有绝对上限**（`MAX_PLOT_W`），否则超宽屏把格子拉成横条；② **绝不给高度单独设 `max-height`** —— 高度一被封顶而宽度仍继续涨，宽高比立刻崩（实测退化成 9.6:1）。宽高比优先，让高度跟着宽度走。
     实测（3 列 3 行）：768→1440 连续增长（格 161×49 → 344×107），1440 以上宽度封顶 1152px、格子稳定在 344×107（≈3.2:1），图高恒约 367px，落在 1080p 底行可用高（~536px）之内。
     `CELL_RATIO_W` 取 **3.2 而非 2**：2:1 时 1152px 宽的图高约 571px，会把底行撑出视口；3.2:1 下约 366px 刚好放得下。
     `.heat-plot` 上保留 `height: clamp(180px, 26vh, 340px)` 仅作 **1 维条形图**的兜底（2 维+ 由内联 `aspectRatio` 决定高度）。
  4. **`autoresize` 负责真正的 resize，组件自己只维护「初始化兜底值」**：`v-if` 常真、组件不重挂载，`init-options` 不会重新生效，所以窗口/容器变化由 `autoresize` 的 ResizeObserver 驱动重绘；组件侧的 ResizeObserver 只用来更新兜底值（万一图表因切分支被重建时能拿到当前真实尺寸），并用 `requestAnimationFrame` 合并高频触发、`onBeforeUnmount` 断开。

  **另一个陷阱**：`v-if` 为假时页面上仍会留下 `<v-chart>` 的**注释占位节点**。若用 `querySelector` 去量容器，会量到注释节点，必得 0×0 —— 所以度量必须用**模板 ref 直接挂在当前可见的绘图区 div 上**，绝不用选择器去猜。

  **识别特征**：面板标题/下拉/图例/脚注全部正常渲染，唯独图区空白 + 控制台该警告。**此时先怀疑尺寸，不要怀疑数据**（v3.2 实测：数据、图例、脚注全对，只有 canvas 是空的）。

- **用 `grid.outerBounds*`，不要用 `grid.containLabel`（v3.6）**：ECharts 6 弃用了 `containLabel`，用它会打 `[ECharts] Specified grid.containLabel but no use(LegacyGridContainLabel); use grid.outerBounds instead.`（不是错误，但说明踩了 legacy 写法）。官方等价关系写在 `GridModel.d.ts` 的注释里：
  ```
  containLabel: true  ≡  { outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' }
  ```
  全屏四张图统一用后者。**为什么这条特别值得记**：`containLabel` 在类型里只是标了 `@deprecated`、并没有移除，所以 `vue-tsc` **不会报错** —— `pnpm check` 全绿、控制台照样提示。这类「类型能过但 API 已过时」的坑只能靠跑起来看控制台，本项目的静态门禁覆盖不到。v3.2 重写 `DimHeatmap` 时就因此把原来的 `outerBounds*` 写法退回成了 `containLabel`（`BrandTopChart` / `PriceBandChart` 一直是对的，可对比）。

### 5.4 交互规范

- 全部图表 hover tooltip（ECharts 默认开启）；热力图 SPU 下拉是「维度过滤」交互（交互规范：过滤控件一行放图表上方）
- 大屏无写操作，纯读

**浮层（Teleport）配色规范 —— 必须钉死 Element Plus 令牌，不能只写 background（v3.5 定案）**

大屏恒深色，但 `el-select` 的**下拉面板被 Teleport 到 `body`**，这带来一条隐蔽的失败模式：

- 浮层被 Teleport 后是 `body` 的后代，而 `.dim-heat` 也在 `body` 子树里 —— 按 CSS 自定义属性的解析规则，浮层**确实能继承到**面板上声明的变量。**但它是浮层、落在面板之外**，所以面板内那套值（偏暗、偏弱）本就不适合它
- 更要紧的是**脆弱性**：浮层里 option 的 `hover` 底色来自 Element Plus 自己的 `--el-fill-color-light`（`option.scss` 的 `when(hovering)`）。一旦面板不再声明该变量，浮层会**静默回落到页面主题的值** —— 亮色主题 = `#f5f7fa`（近白）
- 而文字色由我们写在全局块里（`#00e5ff` 青）→ **青字压近白底，对比度约 1.43:1，hover 时文字几乎消失**

根因是「**底色来自主题、字色来自组件**」两套来源打架 —— 只覆盖 `color` 或只覆盖 `background` 都治不好。**规范**：`popper-class` 的全局块**不依赖继承**，显式钉死浮层自己要用的每一个 token（背景、文字色，以及 EP 会自行取用的那几个变量）：

```scss
:global(.dash-select-popper) {
  --el-bg-color-overlay: #12233f;
  --el-fill-color-light: rgba(0, 229, 255, 0.16);  /* EP 的 hover 底 */
  --el-text-color-regular: #e6f1ff;
  /* …其余同步 */
  background: #12233f !important;
  .el-select-dropdown__item {
    color: #e6f1ff;
    height: auto; min-height: 36px; line-height: 1.5;  /* EP 固定 34px 行高，两行内容必须一起覆盖 */
    &.is-hovering { background: rgba(0, 229, 255, 0.16); }
    &.is-selected { background: rgba(0, 229, 255, 0.08); color: #00e5ff; font-weight: 600; }
  }
}
```

对比度校核（相对面板底色 `#12233f`，WCAG AA 正文要求 4.5:1，实测值）：

| 元素 | 前景 / 背景 | 对比度 |
|---|---|---|
| 普通选项文字 | `#e6f1ff` / `#12233f` | **13.75 : 1** |
| hover 选项文字 | `#e6f1ff` / `#0f425e`（16% 青叠底） | **9.38 : 1** |
| 选中项文字 | `#00e5ff` / `#12233f` | **10.2 : 1** |
| 分组标题 | `#8aa3c0` / `#12233f` | **6.04 : 1** |
| 选项副标题（分类路径） | `#8aa3c0`×0.75 / `#12233f` | **4.89 : 1** |
| ~~旧方案：青字压亮色主题~~ | `#00e5ff` / `#f5f7fa` | ~~1.43 : 1~~ ← 问题所在 |

另外**选项内容由本组件插槽渲染（带 scope id），而 `.el-select-dropdown__item` / `.el-select-group__title` 由 Element Plus 创建** —— 前者可放 scoped 区块，后者必须写在 `:global()` 内，混了就会「样式写了不生效」。

## 6. 里程碑

| 阶段 | 内容 | 验证 |
|---|---|---|
| M1 后端聚合 | dashboard 路由/服务/DTO + 边界测试 | tsc + 全量回归全绿 + curl 实测数字与直连库一致 |
| M2 视觉基线与前端骨架 | 依赖安装（含 peer 核实）；**vw 响应式适配（R32）**、轮询数据流、KPI×5；**home 页升级（数据大屏入口卡 + 欢迎区，R28）** | 浏览器：**1920×1080 全屏铺满、面板无重合** 为验收基准，再抽验 1440 / 2560 / 笔记本 150% 缩放三档；**用「只勾数据大屏」的角色登录应落在大屏而非 404（验证 R29）**；30s 自动刷新；全屏无侧栏；**无 `/screen` 权限的用户在首页看不到入口卡**（`v-permission` 负向） |
| M3 全面板（v3） | 价格带大图、品牌货值 TOP5、状态环、**库存热力图（SPU 切换）**、**待办清单** | 各图数据与 SKU 页对照；换 SPU 热力图即时重算；**零库存格必须显示为灰色**（对照 `/product/spu/sku` 的库存数） |
| M4 验收 | 手动走查清单、README 功能清单补「数据大屏」、设计文档收尾 | pnpm check + 全量回归 + 手动走查清单 |
| **M5 v3 重做（已完成）** | 按「可运营 / 有方差 / 不冗余」砍 3 面板（月度趋势 / 最新动态 / 旭日图 + `categoryNodes`）、KPI 重做、品牌改货值口径、状态环去死扇区、热力图改 stock 上色、新增待办清单、修 `bucketPrice` 边界 off-by-one | 双端类型检查 + 边界测试（含分桶整点价断言）+ `audit:data` |

**手动走查清单（M4，R30）**——原里程碑只「引用」未定义，此处补齐（加粗项是此前任何验收项都没覆盖到的）：

| # | 检查项 | 对应决策 |
|---|---|---|
| 1 | 1920×1080 全屏：面板满幅、无重合、无发虚 | R32 |
| 2 | 1440 / 2560 / 笔记本 150% 缩放：**铺满视口、面板无重合、图表随容器自适应** | R32 |
| 4 | **「只勾数据大屏」的角色：登录落在大屏、404 返回键不死循环** | R29 |
| 5 | **无 `/screen` 权限：首页无入口卡；手输 `/screen` → 404** | R12/R28 |
| 6 | 首页卡片 → 大屏 → 「返回后台」进出闭环 | R28 |
| 7 | 30s 自动刷新 +「数据更新于」时间戳随之更新 | R11 |
| 8 | **停掉后端：保留旧数据 + 「更新失败」提示，不白屏** | R11 错误态 |
| 9 | **空库/清库后：各面板显示空态、接口不 500** | R7 空态 + 空集合兜底 |
| 10 | **亮色主题下大屏无白底**（留白铺满生效） | R26 |
| 11 | 各图数据与 SKU 页对照一致 | §4.3 |
| 12 | **轮询到点不重播入场动画** | R24 |
| 13 | **每张图的 canvas 都真正画出来了**（不能只看标题/图例/脚注在不在）；浏览器控制台**不得出现** `[ECharts] Can't get DOM width or height` | v3.2 高度塌陷 |
| 14 | 首屏热力图默认选中的 SPU **能看出色阶**（不是一片零库存灰） | v3.2 默认选中 |

## 7. 权衡记录（面试可讲）

1. **单接口全量 vs 按面板多接口**：选单接口——首屏一次到位、数据量 KB 级；热力图交互数据随包下发，避免切 SPU 二次请求。**上限与触发条件（R25）**：当前 100 SKU ≈ 30KB、单请求 < 100ms；**SKU > 2000 时**改为「热力图服务端聚合 + 明细分页」，并把 `skus` 全量快照移出响应
2. **聚合归后端、交互重算归前端**：aggregate 管道在 DB 侧做重活；前端内存重算只服务即时交互
3. **补零在后端** —— **v3.0 作废**：补零服务于「连续时间序列」面板（月度趋势），该面板已按「有方差」判据删除（`createdAt` 是入库时刻，不是业务事件时间）。要恢复时间序列，须先引入 `publishedAt` 这类真实事件字段
4. **平铺 + listToTree** —— **v3.0 作废**：该哲学原服务于旭日图组树；旭日图与后端 `categoryNodes` 已删除。平铺返回的哲学在权限模块仍然是现行惯例，只是本大屏不再有树形消费方
5. **价格带「未定价」单列**：把业务闸门（I11）变成可视化叙事的一部分。**v3.0 补充实测口径**：未定价 SKU 实测**同时也是零库存、未上架**（15/15），即「未定价」与「未铺货」高度同一，不是独立的定价待办队列——因此文案措辞与待办分类都按此调整（不再把「待定价」当独立 KPI 卡）
6. **恒深色 + 校验色板**：大屏独立于全局主题；数据色与品牌色分离（蓝青相邻色对全色觉分离度不达标，只能当外壳）
7. **轮询 30s**：大屏场景的标准刷新节奏；useLatestRequest 保证慢响应不覆盖新数据
8. **scale vs vw 响应式的最终选择（R32 修订）**：v1.3 曾定案 scale（构图一致性/1920 全屏零代价），但 M2 实现连续两次踩在「固定 1920 画布 + transform」的非自然布局模型上（R31 居中溢出、面板百分比高度重合）——scale 的代价在非 1920 视口处处要付。**最终转 vw/vh 响应式**：`/screen` 是独立 URL 页面，vw 布局是真等比（随视口缩放、无留白、无发虚、canvas 原生分辨率、ECharts autoresize 原生适配），守卫页/translate 居中/留白处理全部删除。已知边界：极小窗口下 clamp 字体下限保证可读性，但不再做小屏专项优化（投屏/演示场景够用）。mockup 保持 1920 构图作为**视觉基线**（验收时浏览器拉到 1920 对照即可），不再是像素级 1:1 基准
9. **失败语义（R11）**：useLatestRequest 把「请求失败」与「被新响应顶掉」压成同一个 undefined——大屏轮询失败=保留旧数据是有意行为，靠「数据更新于」时间戳 + 失败微提示让用户感知新鲜度

---

## 变更记录

| 版本 | 日期 | 内容 |
|---|---|---|
| v1.0 | 2026-10-01 | 初稿：9 面板布局、聚合接口设计、聚合分工原则、前端骨架与面板要点、四里程碑 |
| v1.1 | 2026-10-01 | 吸收评审 R6~R11：/screen 移顶层全屏路由；四态定义表；$group 空集合兜 0 规范 + 分桶纯函数化测试；分桶边界直接写分值；热力图 3+ 维方案；scale 位图发虚权衡与 devicePixelRatio 缓解；轮询失败语义 + 数据新鲜度；依赖版本核实（echarts 6.1.0 / vue-echarts 8.3.1） |
| v1.2 | 2026-10-01 | 吸收评审 R12~R18：/screen 改「留在 menuRoutes + hidden + meta.fullscreen」（消除移出的三处连带）；骨架屏仅首屏、KPI 仅入场动画；peer 不兼容回退原生 composable；bucketPrice 落位 utils/priceBand.ts；测试数统一 +4（159→163）；mockup 刷新提到 M2；kpi 三独立计数口径 + StatusRing 推导式 |
| v1.3 | 2026-10-01 | **定案保留 scale 等比方案（有意不做响应式，理由见 §7.8）并补齐实现规格**：RouteMeta 补 `fullscreen` 声明；layout fullscreen 分支样式归零 + 显式深色底；外层 viewport 铺满深色背景（解决 scale 留白区在亮色主题下露白）+ 底纹外移；`transform-origin` 改 center + scale 下限 0.6 + DOM 三层结构；`findFirstAccessiblePath` 跳过 fullscreen 叶子（**后被 v1.6/R29 修订为「优先级降级」**）；新增 §5.3「图表更新与渲染规范」（轮询不重播动画 / devicePixelRatio / 不注册 resize / tooltip 放大）；brandTop 明确内存映射；状态计数双不变式断言；热力图补 0 维；单接口补上限触发条件；M2 验收改为 1920 基准 + 1440/2560 抽验 |
| v1.4 | 2026-10-01 | 吸收评审 R26~R27：**修掉「scale 下限 vs overflow:hidden」的裁切冲突**——下限生效即裁边（信息丢失，非留白），补「小窗口守卫页」并把阈值改为由 `MIN_SCALE` 派生，同时明确裁切职责归属；**统一三组术语**（底纹 / 布局栅格 / 栅格线，DOM 类名 `.screen-grid` → `.screen-layout`，§7.8 与 v1.3 记录同步更正）；R6 处置行补注「后被 R12 修订」；**订正 10 处错位的正文交叉引用**（正文沿用了早期编号 R2/R3/R4/R5/R6/R17/R20，与台账现行编号不符，已逐一改为 R7/R8/R9/R10/R11/R18/R25）。R28（大屏入口缺失）标记待定 |
| v1.5 | 2026-10-01 | R28 定案：首页工作台入口卡（v-permission 控显隐 + 跳转）写入 §5.2 正向入口与 M2 里程碑，home 页升级为「入口卡 + 欢迎区」，与「返回后台」构成进出闭环 |
| v1.6 | 2026-10-01 | 吸收评审 R29：findFirstAccessiblePath 对 fullscreen 叶子改「优先级降级」（兜底返回大屏），修复「只勾大屏的角色永久 404 死局」（R12 hidden 不渲染菜单 + R21 跳过 fullscreen 落地的叠加效应） |
| v1.7 | 2026-10-01 | 文档一致性收口（R29 落地的配套订正）：§5.2 第②条措辞由「跳过 fullscreen 叶子」改为「优先级降级」——原文与同一行末尾的 R29 修订段自相矛盾；§5.2 item 1 标题补 R28/R29 引用号；台账 R21 行补注「后被 R29 修订」；新增**台账惯例**（历史行被推翻须标注，防 R6←R12、R21←R29 这类失配复发） |
| v1.8 | 2026-10-01 | 验收覆盖收口（R30）：表头引用号同步至 R1~R29（R29 入库后未同步）；M2 验证栏补「首页卡片 ↔ 大屏返回」进出一体；v1.3 变更记录行补注「后被 v1.6/R29 修订为优先级降级」（**把台账惯例推广到变更记录**——它同样是累积式、同样会被后续推翻）；**M2 补 R26 守卫页（1024×768）与 R29「只勾大屏」角色的验收项**；**新增「手动走查清单」12 条定义**（原 M4 只引用未定义，含此前零覆盖的错误态/空态/负向判权/守卫页/落地页） |
| v1.9 | 2026-10-01 | 吸收评审 R31（mockup 实测）：scale 居中方式由「grid + place-items」改为「absolute + left/top 50% + translate(-50%,-50%) scale」——grid 隐式轨道溢出导致偏右下裁剪，1707×791 视口复现；这也实证了「留白姿态验收」比完美姿态更暴露问题 |
| v2.0 | 2026-10-02 | 吸收评审 R32（**scale 方案推翻，转 vw 响应式**）：M2 实现连续踩坑（R31 居中 + 面板百分比高度重合）证明固定 1920 画布 + transform 的摩擦成本；`/screen` 是独立 URL 页面，vw/vh 等比铺满 = 真等比（无留白/无发虚/无守卫页/autoresize 原生适配）。§5.2 适配方案整体替换，§7 权衡第 8 条改写，走查清单与 M2 验收栏的守卫页/留白项同步更新 |
| v2.1 | 2026-10-02 | 吸收评审 R33（**大屏转顶级独立路由**）：vw 响应式后大屏无需 layout 的 fullscreen 条件渲染，/screen 移入 constantRoutes 顶层（顺带规避 layout keep-alive/transition 嵌套的视图冻结）；layout fullscreen 分支与 RouteMeta.fullscreen 声明清理；**可达性兜底改为 findLandingPath(routes, codes)**——表内无可达叶子时按 codes 直判 /screen（R29 的表内 fullscreen 兜底随路由移出失效，不换实现会复活「只勾大屏角色 404 死局」） |

## 评审意见与处置

> **台账惯例**：处置列记录**该轮当时的结论**。若后续轮次推翻或修订它，必须在原行末尾标注 **「（后被 RXX 修订）」**，并在新行写明修订内容——否则读者会按已被推翻的历史结论去实现（R6←R12、R21←R29 属此类）。

| # | 意见 | 处置 |
|---|---|---|
| R1 | KPI 扩到 6 卡，待定价/在架率提到主位 | 采纳 **（后被 v3.0 修订：实测 6 卡里 4 卡是表行数，改为 5 卡「可售率 / 库存总价值 / 待办 SKU / 在架 SKU / 品牌覆盖」；「待定价」不再是独立卡，并入待办三分类）** |
| R2 | 价格带分布作核心大图，未定价单列一档 | 采纳 |
| R3 | 维度组合热力图（组合快照独有） | 采纳 **（后被 v3.0 修订：上色统计量由「格内 SKU 数」改为「库存合计」——完整笛卡尔积下前者恒为 1）** |
| R4 | 底部滚动明细表 | 采纳 **（后被 v3.0 推翻：整表同批写入，Top10 的 `updatedAt` 毫秒级全同，等值排序未定义 → 不构成事件流，面板删除）** |
| R5 | 旭日图复用 listToTree，不重写建树 | 采纳（后端平铺返回 + 前端组树） **（后被 v3.0 推翻：分类树 SPU 数对商品运营无叙事且前端零消费，旭日图与后端 `categoryNodes` 一并删除）** |
| R6 | 路由归属未写——大屏在 layout 内会带侧边栏，与全屏构图冲突 | 采纳：/screen 移顶层，菜单移除，入口=返回按钮+首页卡片 **（后被 R12 修订：改为留在 menuRoutes + hidden + meta.fullscreen，菜单项由 hidden 隐藏；首页入口卡待补，见 R28）** |
| R7 | 加载/空/错误/403 四态缺失；$group 空库返回 [] 是 500 隐患 | 采纳：四态表 + 兜 0 规范 + 分桶纯函数边界断言 |
| R8 | 热力图 3+ 维场景未定义（MAX_SALE_ATTR_COUNT=10） | 采纳：前两维行列 + 其余聚合，tooltip 完整组合 |
| R9 | 「分转 cents」表述写反，边界应直接写分值 | 采纳：分值表照抄 |
| R10 | scale 放大 canvas 位图发虚未记入权衡 | 采纳：§7 第 8 条 + devicePixelRatio 缓解 |
| R11 | useLatestRequest 失败语义未明确；缺数据新鲜度 | 采纳：§7 第 9 条 + 顶栏「数据更新于」+ 失败微提示 |
| R12 | /screen 移出 menuRoutes 后，只勾大屏的角色登录落 404（可达性/菜单/落地三处连带） | 采纳：留在 menuRoutes + hidden + meta.fullscreen，layout 条件渲染 |
| R13 | 30s 轮询会让骨架屏每轮闪；KPI 滚动动画吵 | 采纳：骨架屏仅首屏；KPI 仅入场动画 + 变化高亮 |
| R14 | echarts 6 + vue-echarts 8 的 peer 兼容未知 | 采纳：装后核实；不兼容回退原生 core + useECharts composable |
| R15 | bucketPrice 位置未写 | 采纳：backend/src/utils/priceBand.ts |
| R16 | 测试数量自相矛盾（+4 vs 3 例/159→162） | 采纳：统一 +4 例（159→163），里程碑不写易漂数字 |
| R17 | mockup 旧版但 M4 要对照走查 | 采纳：刷新 mockup 提到 M2（视觉基线） |
| R18 | kpi 未定价与上下架非同一维度，互斥三分类会少算第三段 | 采纳：返回三独立计数 + StatusRing 推导式（offSale − unpriced） **（后被 v3.0 收口：状态改由后端 `skuStatus` 三段互斥完备直接给出，前端不再做减法推导；同时删掉恒为 0 的「在架 · 未定价」扇区——I11 保证在架必有价）** |
| R19 | `RouteMeta` 未声明 `fullscreen`，条件判断落在 `unknown` 上（写错字段名不报错） | 采纳：`types.ts` 声明合并补字段 |
| R20 | layout fullscreen 样式未归零 → scale 基准不是视口；另：是否该改响应式填充 | **部分采纳**：采纳「内容区样式归零 + 显式深色底」；**「响应式填充替代 scale」不采纳**——保留 scale（理由：展示型页面构图一致性优先；响应式需为 9 面板各定最小尺寸与降级规则、且 mockup 失去验收价值；1920 全屏时 scale=1 代价为零）。另采纳其「留白区需铺满深色背景」与「单接口补上限触发条件」两点 |
| R21 | `findFirstAccessiblePath` 会把全屏大屏当默认落脚页 | 采纳：可达性计算跳过 fullscreen 叶子；`isPathAccessible` 不变 **（后被 R29 修订：改为「优先级降级」——先普通页、无其他可达页时兜底返回大屏；原「跳过」会让只勾大屏的角色登录落地 null → 永久 404 死局）** |
| R22 | `brandTop` 的 join 方式未写明（`$lookup` vs 内存映射） | 采纳：明确内存映射（项目惯例） |
| R23 | 状态计数断言可加分区完整性不变式 | 采纳：补 `onSale + offSale === skuCount` 与 `unpriced ≤ offSale` 双断言 |
| R24 | 图表在 30s 轮询下会重播入场动画；scale 下 tooltip 会放大、`devicePixelRatio` 未定 | 采纳：新增 §5.3「图表更新与渲染规范」 |
| R25 | 热力图缺 0 维场景（无销售属性的 SPU）；单接口缺上限与触发条件 | 采纳：0 维显示「无组合视图」；§7.1 补「SKU > 2000 时拆接口」 |
| R26 | scale 下限 0.6 与 `overflow: hidden` 冲突：下限一生效画布就大于视口，边缘被**裁掉**（信息丢失，非留白问题） | 采纳：新增「**小窗口守卫页**」——`视口 < 1920×MIN_SCALE(1152) 或 < 1080×MIN_SCALE(648)` 时不渲染面板只显示分辨率提示，阈值由 `MIN_SCALE` 派生与下限自洽；并明确 `overflow: hidden` 只管「大屏不自带滚动」，小屏由守卫页兜 |
| R27 | 「网格」一词三义（48px 背景方格底纹 / 布局栅格 / 图表栅格线），§5.2 内部同名 | 采纳：新增 §5.2 术语约定表统一为**底纹 / 布局栅格 / 栅格线**；DOM 类名 `.screen-grid` → `.screen-layout`（避开 mockup 的 `.grid`） |
| R28 | **大屏入口缺失**：菜单 `hidden` 不渲染、首页入口卡只出现在 R6 处置行、§5.2 与 §6 里程碑均无落地 → 实际只能手输 `/screen` | **采纳**：首页工作台入口卡（`v-permission="'/screen'"` 控显隐 + `router.push('/screen')`），home 页顺带从占位升级，写入 M2 里程碑与 §5.2 正向入口 **（后被 v3.14 修订：放开判权，入口卡 v-permission 移除，人人可见）** |
| R29 | R21 与 R12 互相打架：只勾大屏的角色登录落地 null → 404，404 返回键同样落空，永久 404 死局 | **采纳**：findFirstAccessiblePath 改「优先级降级」（先普通页、兜底 fullscreen），死局解除且保留「大屏不优先」意图 **（后被 v3.14 修订：大屏放开判权，/screen 不再可勾选，「只勾大屏」场景整体退役，落地恒 /home）** |
| R30 | 「手动走查清单」被 M4 引用 2 次却全文未定义；且 R26 守卫页与 R29 修复**无任何验收项**（1440/2560 都在守卫阈值之上，永不触发；错误态/空态也零覆盖） | 采纳：§6 新增**「手动走查清单」12 条**（含守卫页、只勾大屏落地、负向判权、错误态、空态、轮询不重播动画）；M2 验证栏补 1024×768 与只勾大屏角色的验收项 |
| R31 | mockup 实测：grid + place-items 居中在容器小于画布时失效——隐式轨道溢出，视觉偏右下、底部被裁（1707×791 视口复现） | 采纳：居中改 absolute + translate(-50%,-50%) scale；§5.2 居中方式同步修订（**后被 R32 整体推翻**） |
| R32 | scale 方案实现摩擦过大（R31 居中 + 面板百分比高度重合两次踩坑）；/screen 是独立 URL 页面，本就该是响应式页 | **采纳：推翻 scale，转 vw/vh 响应式布局**——真等比铺满、无留白发虚守卫页、ECharts autoresize；极小窗口字体模糊列为已知边界暂不处理 |
| R33 | vw 响应式后大屏不再需要 layout 外壳：转顶级独立路由（当页跳转 /screen），顺带规避 keep-alive/transition 嵌套冻结；但移出 menuRoutes 使 R29 的表内 fullscreen 兜底失效，只勾大屏角色 404 死局复活 | **采纳**：/screen 移 constantRoutes 顶层；layout fullscreen 分支与 RouteMeta.fullscreen 声明删除；可达性兜底改为 findLandingPath（codes 直判 /screen），四处调用方统一收口 **（后被 v3.14 修订：放开判权，codes 直判兜底移除，落地恒 /home）** |
| R34 | 布局难改：尺寸/间距/字号散落各文件，断点出现 1600/1300 孤值 | **采纳**：--dash-* 令牌块收口 + 四断点体系（1920/1200/992/768）；字号 clamp 规范、em 仅相对倍率；padding 为面板间距唯一来源 |
| R35 | 库存总价值是单值指标，与 KPI 卡信息密度同构，独占右列半块面板浪费 | **采纳**：并入 KPI 行（金额卡保留渐变大字作视觉锚点），右列只留状态环；mockup 同步 **（后被 v3.0 微调：KPI 由 7 卡收敛为 5 卡，库存总价值为第 2 卡）** |
| R36 | 内容稀疏的面板被拉伸填满中行不合理（状态环与底行间留大片空白）；布局应按内容量对称 | **采纳**：最新 SKU 动态移入右列（滚动表内容多、天然填满拉伸位），右列与左列内容量对称；底行改两面板（旭日图与左列同轨 + 热力图横跨剩余）；状态环按内容定高 **（后被 v3.0 修订：滚动表与旭日图面板均删除，右列改单面板「待办 SKU 清单」`flex:1` 吃满整列；底行回归热力图独占整行）** |
| R37 | 768~1200 单列堆叠太空旷（面板独占一行）；SKU 状态图例「文字最左、数字最右」在宽面板下观感散 | **采纳**：1200 档改双列网格（KPI 全宽 3 列、左右列并排、中央全宽、底行两列），768 档才真正单列；图例数字改紧跟文字（固定 8px 间距） |
| R38 | ≤1200 双列档下品牌 TOP 与趋势图失去响应式：图表固定高度（内容驱动）在面板重排后失配 | **采纳**：≤1200 图表改 flex 填充（height auto + flex 1 + min-height 180px），左列面板同步 flex 1——两档策略（>1200 内容驱动 / ≤1200 填充跟随）各取所长 |
| v2.2 | 2026-10-02 | 吸收评审 R34（**样式令牌与断点体系收口**）：.screen-canvas 定义 --dash-* 令牌块（间距/列宽/字号/图表高度唯一来源），组件全部引用变量；断点统一 1920 基准 / 1200 单列 / 992 预留 / 768 紧凑（删 1600/1300 孤值档；右列下限提 260 保证状态环并排）；字号规范 = clamp（px 下限 + vw + px 上限），em 仅组件内相对倍率 |
| v2.3 | 2026-10-02 | 吸收评审 R35：库存总价值并入 KPI 行第 7 卡（金额卡渐变样式），右列只留状态环；§3 布局与 mockup 同步 |
| v2.4 | 2026-10-02 | 吸收评审 R36：右列改为状态环+滚动表（内容量对称）、底行两面板、状态环内容定高——§3 布局与 mockup 同步 |
| v2.5 | 2026-10-02 | 吸收评审 R37：断点语义重定义——1200 双列网格、768 单列；状态环图例数字紧跟文字 |
| v2.6 | 2026-10-02 | 吸收评审 R38：≤1200 图表 flex 填充跟随面板（两档策略） |
| **v3.0** | **2026-10-02** | **面板取舍重做（本版核心）**。确立「可运营 / 有方差 / 不冗余」三条判据并按判据裁撤面板：① 删**月度趋势**——`createdAt` 是入库时刻非业务事件时间，实测数据只跨 16 天，6 个月窗口 4 根空柱（讲上新节奏须先加 `publishedAt`）；② 删**最新动态滚动表**——整表同批写入，Top10 的 `updatedAt` 毫秒级全同，等值排序未定义，内容随机；③ 删**三级分类旭日图与后端 `categoryNodes`**——对商品运营无叙事且前端零消费（后端每 30s 白算白传）。④ **KPI 重做**：6 个里 4 个是表行数（SPU/SKU/品牌/分类），改为「可售率 / 库存总价值 / 待办 SKU / 在架 SKU / 品牌覆盖」；⑤ **品牌 TOP5 改货值口径**（原 SPU 建档数：实测小米 2 个 SPU 排第 2，货值仅为海尔的 1/18）；⑥ **状态环三段**（删恒为 0 的「在架 · 未定价」扇区，I11 结构性保证）；⑦ **热力图改 stock 上色**——原「格内 SKU 数」在完整笛卡尔积下恒为 1（13 个 SPU 的 SKU 数全部严格等于维度值数之积），整图同色属无效图形；⑧ **新增待办 SKU 清单**（三分类互斥，屏上唯一「该做什么」入口）；⑨ **修 `bucketPrice` 边界 off-by-one**——旧用 `p <= 上界`，导致 ¥100/¥500/¥2000/¥5000/¥10000 整点价整体错开一档与标签不符，改严格小于（下闭上开）并加整点价断言；⑩ 组件删 `TrendChart`/`ScrollTable`，`utils/echarts.ts` 移除 `LineChart` 注册；⑪ 移除 `skus[].updatedAt`（旧滚动表专用） |
| v3.1 | 2026-10-02 | 文档与实现对齐 + 注册表收敛：§5.1 按 `utils/echarts.ts` 实际注册清单重写、§5.2 布局规格改为 `--dash-*` 令牌 + `clamp()` 实况、§5.3 面板要点表按 v3 六组件重写、§6 补 M5 里程碑；**`utils/echarts.ts` 再删两个已失效注册**——`LineChart`（折线面板已删）与 `LegendComponent`（全部图表均不声明 ECharts `legend`，状态环图例是手写 DOM），并注明 `VisualMapComponent` **不可删**（ECharts 6 热力图硬依赖，最易在清理时误删） |
| v3.2 | 2026-10-02 | **修图表容器尺寸塌陷（实测发现）**。初判为「高度链断裂」并给 `.heat-chart-wrap` 加了 CSS 高度 —— **实测无效、警告依旧**，据此重新读了 ECharts 6 与 vue-echarts 8 的**源码**（非文档），确认是两层机制叠加：① ECharts 尺寸链 `initOptions.width \|\| dom.clientWidth \|\| 0`，`v-if` 挂载瞬间父级还在同周期重排 → 0×0；② vue-echarts 的 `useAutoresize` 在 resize 首行有 `observedWidth === chart.getWidth() && observedHeight === chart.getHeight() → return`，以 0×0 初始化后**永远不会恢复**，即 `autoresize` 不做零初始化纠正。**故按官方推荐重写 `DimHeatmap`**：根节点改 `display: grid; grid-template-rows: auto 1fr auto` 自包含布局，绘图区给**确定像素高度**（内联 `height: 300px`，摆脱 `flex:1`/百分比链），并加 `:init-options="{ width, height }"` 显式尺寸兜底；度量用**模板 ref 挂可见绘图区**（`v-if` 为假时页面残留 `<v-chart>` 注释占位节点，`querySelector` 会量到它得 0×0）；`canRenderChart` 保证无数据时不挂载图表。另修**热力图默认选中 SPU**：原取 `props.spus[0]`，后端 `Spu.find()` 无排序、首条实测为 iPhone 16 Pro（组合库存全 0），首屏一片均匀零库存灰；改为按库存合计选默认值 + `currentSpuId` 存在性兜底 + `userPicked` 标志（实测首屏最优 SPU 为 Honor 90GT，9 格 7 级色差）。§5.3 渲染规范与走查清单（第 13/14 条）同步更新 |
| v3.3 | 2026-10-02 | **修正 v3.2 的一处误判**：v3.2 曾照「高度链断裂」的初判给 `PriceBandChart` 也加了 CSS 高度，但该图在 v3 实测中**显示正常**（`flex: 1` 链在它有明确高度的祖先下能解析出尺寸），改动无依据，**已回退**。同时明确 `autoresize` 的定位是「窗口/容器变化的跟随者」而非「零初始化的修复者」，规范里写死两条必须同时满足（容器确定尺寸 + `init-options` 兜底）；并补记 `v-if` 为假时残留的 `<v-chart>` 注释占位节点会骗过 `querySelector` 这一陷阱 |
| v3.4 | 2026-10-02 | **热力图 SPU 选择器改「可搜索 + 按一级分类分组」**。起因：单下拉在 SPU 变多后不好找。**先做了数据核算再定方案**——实测一级 3 / 二级 6 / 三级 12 分类、SPU 14 个，其中 9 个（75%）三级分类只挂 1 个 SPU、1 个挂 0 个，故**否决了「一级→二级→三级→SPU 四层级联」**（要连点 4 次才能选出唯一选项，且空分类是死路），改用「单个可搜索下拉 + 分类分组」。**关键实现约束（读 Element Plus 2.14.4 源码得出）**：默认过滤 `useOption.mjs` 是 `new RegExp(query,'i').test(String(currentLabel))`，**只匹配 option label、不匹配 group label**，因此必须用 `filter-method` 自行过滤并把分类路径纳入匹配；`filterMethod` 签名 `(query: string) => void` 只同步状态，过滤交 computed。搜索文本用 `/` 拼路径（用空格会让含空格的查询串跨层级误匹配）。后端 `spus[]` 补 `categoryPath`（一级→三级正序，上溯带 `visited` 防环 + 深度封顶 5），并在边界测试中加断言（逐级父子关系 + 末节点 = 该 SPU 的 `category3Id`，164 例）。另：核对时发现 SPU 与品牌的映射在本库存在**语义错配**（如 Honor 90GT 挂「三星」、OPPO R7 挂「APPLE」），属种子数据问题，已记录未改 |
| v3.5 | 2026-10-02 | **修下拉浮层 hover 文字看不见（实测反馈）**。根因不是「颜色选得不好」，而是**浮层 token 来源错位**：下拉被 Teleport 到 `body`，`.dim-heat` 上的局部 `--el-*` 作用不到它，option 的 hover 底色走 Element Plus 的 `--el-fill-color-light`，取到的是**页面主题**值（亮色主题 = `#f5f7fa` 近白），而文字色是我们写死的青 `#00e5ff` → 对比度约 1.43:1。修为在 `:global(.dash-select-popper)` 内**把 EP 令牌一并钉死**（背景、`--el-fill-color-light`、文字色、边框色），实测对比度：普通项 13.75:1、hover 9.38:1、选中 10.2:1（旧方案 1.43:1）。§5.4 新增「浮层（Teleport）配色规范」，含「只覆盖 color 或只覆盖 background 都治不好」与「插槽内容可 scoped、EP 创建节点必须 :global」两条约束 |
| v3.6 | 2026-10-02 | **修 `grid.containLabel` 弃用提示（实测反馈）**：ECharts 6 报 `Specified grid.containLabel but no use(LegacyGridContainLabel); use grid.outerBounds instead.`。按官方等价关系 `containLabel:true ≡ {outerBoundsMode:'same', outerBoundsContain:'axisLabel'}`（写在 `GridModel.d.ts` 注释里）改写 `DimHeatmap` 的两处 grid，热力图 `top:32` 给 `position:'top'` 的列标签留位。**同时确认这是 v3.2 重写引入的回归**——原代码本就用现代写法，`BrandTopChart` / `PriceBandChart` 至今未受影响，可作对照。**该弃用类型层不报错**（`@deprecated` 未移除），`pnpm check` 全绿也照样提示，只能靠跑起来看控制台 —— 已把这条局限写进 §5.3 |
| v3.7 | 2026-10-02 | **待办面板加宽 + 表头/内容对齐（实测反馈）**。① 右列 `18vw → clamp(330px, 24vw, 460px)`（左列 21vw→19vw 让位）：1700 视口下原宽仅 ~306px，扣面板内边距与滚动条后「商品/组合」几乎无宽度。② **对齐失配两处根因**：表头 `<span>` 用默认左对齐而数值列右对齐（列越窄偏得越多 → 表现为「不同视口下不一致」）；`.todo-body` 滚动条吃掉行内容宽度、行比表头窄（视口决定滚动条是否出现 → 失配量随视口变化）。修为「表头与行共用同一套 flex 列定义」+ 数值列表头 `text-align:right` + `.todo-body { scrollbar-gutter:stable }` 与表头右侧等宽 padding。③ 弃用固定 px 的 grid 改 flex（固定列需求 698px > 窄视口内容宽，会溢出面板）；数值列 min-width 按「表头 2 字 + 最长数值」收紧到 56/30px，把宽度让给主列。实测各视口（768/1100/1280/1440/1700/1920/2560）均无溢出，商品列可用宽 91~207px |
| v3.8 | 2026-10-02 | **修热力图不响应式（实测反馈）**。两处都是 v3.2 重写引入的：① 绘图区高度写死 `300px`，不随视口变化（改为 `height: clamp(180px, 26vh, 300px)`，与 `--dash-chart-h` 同口径）；② **宽度上限被删掉** —— 原实现有 `maxWidth: min(cols*100+140, 75%)`，我重写时以「底行独占整行」为由删除，导致全宽铺满时格子被横向拉成长条（2 列时每格可宽 400px+）。恢复为按列数的 `maxWidth: clamp(280px, cols*92 + 150, 100%)` + `margin-inline:auto` 居中。另明确 `autoresize` 与组件自身 ResizeObserver 的分工（前者管重绘、后者只维护初始化兜底值，用 rAF 合并 + 卸载断开），并写进 §5.3 渲染规范第 1/3/4 条 |
| v3.9 | 2026-10-02 | **热力图改为「单元格尺寸驱动」的响应式（实测反馈：外框有响应式但内部图表过小）**。v3.8 的 `maxWidth: cols*92+150` 思路仍是猜固定 px（3 列仅 426px，2483 视口下像缩略图）。改为先定目标单元格 `184×92` 与轴区预算，再反推容器 `maxWidth` 与 `aspectRatio`，让**高度跟着宽度**走 —— 于是格子比例跨视口恒定、图随可用宽度放大。实测 768~2560 全部 184×92（精确 2:1），3×3 绘图区恒 672×326。同时修正 `AXIS_H` 预算与 option 的 `grid.top/bottom` 不同步导致的跨视口比例漂移（抽成 `GRID_PAD_Y` 并注明必须同步）。§5.3 把三次失败尝试（裸 flex / 固定 300px / 猜宽度上限）一并留档，防止回退 |
| v3.10 | 2026-10-02 | **热力图响应式改用容器查询单位 `cqw`（第 6 版才走对）**。v3.9 系列连续 4 次失败，根因同一个：**用 `vw` 猜格子尺寸 —— `vw` 是视口量，而图表要填的是面板宽度，两者没有固定比例，于是每版都只能猜系数、必然在某段被夹平**（实测：常量 184×92 → 718px 以上恒定；`clamp(132px,6.4vw,232px)` → 2000px 以下全被下限夹住）。改为 `.dim-heat { container-type: inline-size }` + `cqw` 后，「面板多宽 → 图多宽」成为直接换算。同时定死两条硬约束：**宽度必须有绝对上限**（否则超宽屏把格子拉成横条）、**绝不给高度单独设 `max-height`**（高度一封顶而宽度继续涨，宽高比立刻崩，实测退化成 9.6:1）。`CELL_RATIO_W` 由 2 改 3.2 —— 2:1 时 1152px 宽的图高 571px 会撑出视口，3.2:1 下 366px 正好。实测 768→1440 连续增长（格 161×49→344×107），1440 以上格子稳定 344×107、图高恒 367px |
| v3.11 | 2026-10-02 | **screen 模块规范化审计与整改（应要求）**。审计口径与结论：① **行内样式**——全模块仅 4 处 `:style`，全部是动态量（computed / 标识符 / 成员表达式），**没有一处是模板内静态字面量**；Vue 官方针对此的规则 `vue/no-static-inline-styles` 只报「值为 Literal」的情形，故无需改动（实测启用后零命中）。② **未用引用**——用项目自身的 ESLint（`eslint-plugin-vue` + `vueTsConfigs.recommended`）跑 `--fix-dry-run`，全模块仅 1 条 `vue/multi-word-component-names`（`index.vue`，属项目全局既有命名约定，未越界修改）；额外启用 `no-static-inline-styles`/`no-unused-properties`/`no-unused-refs`/`no-unused-emit-declarations`/`no-empty-component-block` 后**仍仅此 1 条**。③ **样式冗余**——同规则块内重复属性 0 处、模板未引用的自有 class 0 个（73 个自有 class 全部有引用）、跨文件重复选择器 0 处；`index.vue` 的 `.center`/`.left`/`.right`/`.bottom` 各被拆成多块但**无属性级重复**。**唯一实质整改**：`.dim-heat` 的 `--el-*` 令牌块从 13 个精简到 6 个 —— 删掉 2 个 Element Plus 从不读取的（`--el-bg-color`、`--el-text-color-primary`）与 5 个与浮层块重复的（`--el-bg-color-overlay`/`--el-border-color-light`/`--el-fill-color-light`/`--el-text-color-regular`/`--el-text-color-secondary`），并补注释说明「面板内 6 个服务输入框、浮层 6 个服务下拉，两者域不同故非重复」。**同时修正 v3.5 的一处错误归因**：原文称「`.dim-heat` 的变量作用不到浮层」——错，浮层是 `body` 后代、按解析规则能继承到；真正的问题是它是浮层、落在面板之外，且不显式钉死会**静默回落到页面主题**（正是当初 1.43:1 的成因）。§5.4 与 git 注释已同步更正 |
| v3.12 | 2026-10-02 | **令牌化收口 + 修两处方向性错误（实测反馈驱动）**。① 完成 92 处硬编码颜色的令牌化（style 77 + script 37），新增 `variables.scss` 的 `$dash-*` 调色板（纯新增、0 删除，不影响其它模块）与 `.screen-canvas` 的暴露层；修正 `KpiCards` 引用了从未定义的 `--dash-text-secondary`（兜底永远生效）；去掉 3 个零消费令牌。② **错误一：脚本区误用 `var()`** —— ECharts 把颜色交给 canvas，canvas 不解析 CSS 变量，`var(--dash-*)` 一律非法（实测回落 `#000000` 并刷 `illegal color`）；且批量替换把 SCSS 插值写进了 JS 字符串（`'#{$vivo-blue}'`），每帧重绘抛 `addColorStop` 异常导致报错持续增长。修正：新增 `src/styles/dash-tokens.mts` 作为脚本侧唯一事实源（真实色值常量），41 处改为 `DASH.*`。③ **错误二：令牌挂载点** —— 调色板原挂 `.screen-canvas`（组件根）期望跨组件继承，实测未生效；改用 `:global(:root)`，布局令牌仍留 `.screen-canvas`。④ **错误三（自我纠正）**：先前用有 bug 的脚本报「嵌套超标」，正确结论是只有 `index.vue` 的 `.header .meta small .fail` 达 4 层（`@media`/`@keyframes` 被误算成嵌套层），已上提为 `.meta small` / `.meta .fail`（降到 2 层），其余 6 条 depth=3 属 `:global()` 语法包装或 `&` 状态修饰符，不应压平。规范沉淀为 §5.2.1「令牌挂载点与脚本侧色值」两条硬约束 |
| v3.13 | 2026-10-02 | **令牌挂载点再优化（用户实测反馈）**：调色板由 `:global(:root)` 改挂 **`.screen-viewport`**（页面根容器）。两者都能工作，但页面根容器更优——① 作用域正好：随页面卸载一起销毁，不像 `:root` 把大屏专用变量留在全局根上；② 无需 `:global()` 转义绕开 scoped 属性选择器；③ 它是所有消费方的最近公共祖先，跨组件消费只剩一层父子关系。布局令牌仍留 `.screen-canvas`。§5.2.1 判据同步修正为「跨组件 → 挂页面根容器；本页/本组件 → 挂组件根类」 |
| v3.14 | 2026-10-18 | **RBAC v2 联动：大屏放开判权（用户定案）**。背景：RBAC 动态路由改造（code 拆分 perms/path、后端下发路由表、前端 addRoute）中，用户定案静态页统一人人可见——/screen 与 /home 同待遇。四处联动落地：① 后端 `routes/dashboard.ts` 移除 `requirePermission('screen:view')`（仅 auth）；② 种子 /screen、/home 两节点 perms 置空（纯展示节点），seed:admin 的 user 角色基线改空权限；③ 前端守卫删除 /screen 的 hasPerm 检查、首页入口卡删除 v-permission；④ boundary 测试「无 /screen 权限 → 403」改写为「无任何权限 → 200」，168/168 全绿。连带：403 自愈的 accessible 判定对 /screen 显式豁免（静态恒可达，收权不误踢）；「只勾大屏」细粒度场景退役（R28/R29/R33 处置标注修订）。另：面包屑改为显示隐藏页（hidden 只管菜单渲染）、SKU 图片列加占位底色防翻页闪烁（均属本次联动批次的小修复） |
