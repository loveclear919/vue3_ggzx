# 分类逐级下钻改造 · 架构复盘

> 按 `ai-roles/agent.md` 的「首席架构师 & 代码审查官」框架输出：业务全景 / 技术实现链路 / 架构决策分析 / 关键函数深度拆解 / 风险提示 / 重构建议。

## 1. 业务全景

**解决的核心问题**：分类数据量增长后，「展开整棵分类树」的交互不可持续——上千条分类时树巨大、难找、渲染重。将 attr/SPU 页的分类选择从「全量树」改造为**逐级下钻**：进入页面只显示一级分类，点击逐层深入，路径面包屑可回跳。**任何时刻页面上只有当前层级的平铺列表**，渲染量与数据总量解耦。

**数据流向**：

```
进入页面 → GET /api/category（无 parentId）→ 一级分类平铺列表
点击「手机数码」→ path=[手机数码] → GET /api/category?parentId=xxx → 二级列表
点击「手机通讯」→ path=[手机数码, 手机通讯] → 三级列表
点击「智能手机」（level 3）→ 选中，查询右侧属性/SPU 列表
面包屑点击「手机数码」→ path 截断回跳 → 重新拉二级列表
```

## 2. 技术实现链路（调用栈追踪）

**前端侧**（attr 页与 SPU 页两份同构实现）：

1. `fetchCategoryLevel(parentId?)`：不带参拉一级，带参拉子级；`treeLoading` 控制列表 loading
2. `handleCategoryClick(node)`：**level 分支语义**——level < 3 时 push 进 `categoryPath` 并下钻；level 3 时写入 `selectedCategory` 并查业务列表（SPU 页顺带重置 `pageNo`）
3. `goBackTo(index)`：取路径栈目标节点 → 防御性判空 → `slice(0, index + 1)` 截断 → 重新拉该层级
4. `goBackToRoot()`：清空路径 → 拉一级
5. 渲染：`el-breadcrumb`（「全部」固定项 + 路径栈，非末项可点击）+ 平铺列表（有子级的项带右箭头，选中项高亮，最大高度内部滚动）

**后端侧**：

```
routes/category.ts       GET /api/category（新增，与 GET /tree 共存）
controllers/category.ts  parentId 形状校验（可选 string）
services/category.ts     listChildCategories：parentId 过滤 + hasChildren 聚合批量判断
```

## 3. 架构决策分析

**① 形态选择：为什么是「面包屑 + 平铺列表」而不是懒加载树 / cascader / 树形表格？**

- **全量树**（改造前）：数据量增长后不可用，被否决的起点
- **懒加载树**（el-tree lazy）：能解决渲染量，但用户指出的痛点还在——已展开路径的节点仍占大量纵向空间，且「找」的本质问题没解决
- **el-cascader**：行业标准筛选器组件，但 `lazy` 模式与 `filterable` 搜索**互斥**（官方限制），千级数据无搜索依旧难找
- **逐级下钻平铺列表**：淘宝/京东商家后台选类目的**事实标准形态**（逐层平铺、顶部路径指示）；每屏渲染量恒定、宽度需求小、与即将开工的分类管理页形态统一

**② 平铺节点返回 `hasChildren` 而不是 `children`**

下钻场景前端只需要知道「这行还能不能点进去」，不需要子树。`hasChildren` 让每次响应保持 O(当前层级) 的数据量，整棵树永不离开数据库。

**③ `hasChildren` 用一次聚合批量判断**

`aggregate + $group` 对当前层级所有 id 一次查完子级计数，而不是逐条 `countDocuments`（N+1）。与 `listCategoryTree` 的「一次查询 + 两遍 Map」同哲学：**批量优于循环**。

**④ level 由后端数据驱动交互分支**

前端点击行为完全由 `node.level` 决定（<3 下钻、=3 选中），不维护额外状态机。level 是分类模型的既有字段，零新增复杂度。

**⑤ 选中态与下钻路径解耦**

切换到其他分支时**不清空** `selectedCategory`（与原树的「点非三级节点静默放行」行为一致）——右侧数据保持稳定，用户点错分支再点回来，右侧不用重查。

## 4. 关键函数深度拆解

### `listChildCategories`（`services/category.ts`）

- **入参设计**：`parentId?: string`——**不传表示一级分类**，这是关键语义设计：一级分类的 parentId 是 `null`，但 URL 查询参数无法表达「null vs 未提供」，用「不传参数」代替「传 null」避免了 `?parentId=null` 这种歧义串。
- **边界处理**：`list.length === 0` 提前 return——避免对空数组做 `$in: []` 聚合（Mongo 下空 $in 有语义陷阱）；parentId 不存在于库中时自然返回空列表（不 404——下钻场景里「空」是合法结果，不是错误）。
- **返回值设计**：`CategoryFlatNode[]` 平铺数组，与树节点同构但 `children` 换 `hasChildren`。**为什么不复用 `CategoryNode` 加可选字段**：两种形态的契约不同，混用会让前端永远要处理「children 到底有没有」的分支。
- **副作用**：无（纯查询，`lean()`）。

### `handleCategoryClick`（attr/SPU 页）

- **入参设计**：接收被点击的 `CategoryFlatNode`——节点自带 level/name/id，函数无需再查列表或依赖 index。
- **边界处理**：`level < 3` 与 `= 3` 的两分支语义（下钻 vs 选中）；没有 else——level 是 `1 | 2 | 3` 的联合类型，TS 已保证穷尽。
- **返回值设计**：无返回；副作用是更新 `categoryPath` / `selectedCategory` / 触发查询——**为什么选中后不也 push 进 path**：path 的语义是「下钻导航栈」，选中是终点，混入会让面包屑出现「可点击的叶子」歧义。
- **副作用**：异步触发 `fetchCategoryLevel` / `fetchAttrList`——竞态窗口存在（快速连点两级，后发的请求先回），当前量级下影响可忽略，但见风险提示 2。

### `goBackTo`（attr/SPU 页）

- **入参设计**：`index` 而非节点对象——面包屑渲染时 `v-for` 天然持有 index，传 index 免去再查栈。
- **边界处理**：先取目标节点并**判空**再截断——防御「index 越界」的运行时可能（TS 的 noUncheckedIndexedAccess 不覆盖 ref 值的索引访问）。
- **返回值设计**：无；副作用是 path 截断 + 重拉列表。**为什么截断而非清空**：面包屑回跳到中间层级（如二级）后，该层级下的兄弟/子级列表正是用户想看的，清空会丢失导航上下文。

## 【风险提示】

1. **分类管理页的接口复用约定未落文档** —— `GET /api/category` 当前无 keyword/分页，分类管理页动工时需要加参数。两处消费方（下钻、管理）对同一接口的演进会互相影响，**动工时必须先定接口契约再写页面**。
2. **快速连点的请求竞态** —— 连续快速点击不同分类，两个 `fetchCategoryLevel` 并发，后发的可能先返回导致列表错乱。当前本地量级无感；接口一旦变慢，需要请求序号（token）丢弃过期响应。
   → ✅ **已处理（2026-09-15）**：`fetchCategoryLevel` 已加请求序号防竞态（只认最后一次发起的结果），同款防护同步补到 attr/SPU/SKU 页的列表拉取。
3. ~~`GET /tree` 与 `getCategoryTree` 已成死代码~~ —— ✅ 已解决：确认逐级下钻为唯一形态后，全量组装链路（`listCategoryTree`/`toCategoryNode`/`getTree` + 前端 `getCategoryTree`）已整体删除，分类只保留平铺查询一个入口。
4. **三级分类平铺列表无搜索** —— 某个二级分类下三级有几百条时，纯滚动寻找效率低。淘宝/京东形态里搜索是标配，将来可在列表顶部加过滤输入框（后端 keyword 参数已预留）。
5. **两份同构逻辑复制在 attr/SPU 两页** —— 下钻状态与函数完全一致的两份拷贝。第三个页面（如分类管理复用此形态）出现时，必须抽成 `useCategoryDrilldown` composable，否则三处维护是隐患。

## 如果重构，我会改进…

1. **抽 `useCategoryDrilldown` composable** —— path / list / loading / 四个 handler 打包成组合式函数，attr/SPU 页只留「选中三级后干什么」的回调。这是「两份即临界点」的 DRY 判断。
2. **下钻列表加关键词过滤** —— 后端 `listChildCategories` 加 keyword（`escapeRegExp` 工具已就绪），前端列表顶部一个输入框，一次改三处消费方。
3. **面包屑状态持久化** —— 将来若希望刷新页面后恢复上次的下钻路径，可把 path 存入 Pinia（用户级记忆策略此前讨论过，当前不做）。
4. **竞态防护前置** —— 给 `fetchCategoryLevel` 加请求序号，过期响应直接丢弃，避免等「量级上来后偶发错乱」再排查。
   → ✅ **已做（2026-09-15）**，见风险提示 2 的标注。

---

## 附：本模块的关键文件清单

```
backend/src/
├── services/category.ts      # listChildCategories：平铺子级 + hasChildren 聚合
├── controllers/category.ts   # listCategories：parentId 形状校验
└── routes/category.ts        # GET /api/category（与 GET /tree 共存）

vue-project/src/
├── api/category/index.ts     # getCategoryChildren(parentId?) + CategoryFlatNode 契约
├── api/category/type.ts      # CategoryFlatNode（children 换 hasChildren）
├── views/product/attr/index.vue  # 面包屑 + 平铺列表下钻（点击三级选中查属性）
└── views/product/spu/index.vue   # 同构实现（点击三级选中查 SPU，重置分页）
```
