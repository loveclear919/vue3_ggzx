// ECharts 按需注册（tree-shaking，不打全量包；dashboard-design §5.1）
//
// 注册清单按「大屏实际用到的图表/组件」精确收敛，不多注册一个：
//   图表   BarChart（价格带 / 品牌货值 / 热力图 1 维降级条形）
//          PieChart（SKU 状态环）
//          HeatmapChart（维度组合库存热力图）
//   组件   GridComponent（直角坐标系）
//          TooltipComponent（全部图表 hover 提示）
//          VisualMapComponent（ECharts 6 热力图**硬性依赖**：缺它 heatmap 直接抛错；
//                              格子颜色由 itemStyle 手动插值，visualMap 只满足依赖不渲染）
//
// 已移除（随面板裁撤而失效，留着是白付包体）：
//   - LineChart：月度趋势折线图面板已按「有方差」判据删除
//   - LegendComponent：全部图表都不声明 ECharts `legend` ——
//     StatusRing 的图例是手写 DOM（.ring-legend），不依赖该组件
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, PieChart, HeatmapChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'

use([
  CanvasRenderer,
  BarChart,
  PieChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
])
