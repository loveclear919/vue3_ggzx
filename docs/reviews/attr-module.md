# 属性管理模块 · 架构复盘

> 按 `ai-roles/agent.md` 的「首席架构师 & 代码审查官」框架输出：业务全景 / 技术实现链路 / 架构决策分析 / 关键函数深度拆解 / 风险提示 / 重构建议。

## 1. 业务全景

**解决的核心问题**：为电商平台的商品体系提供「分类 → 属性」的组织能力 —— 每个三级分类下可以定义若干平台属性（如「颜色 → 红/蓝/黑」），这些属性是后续 SPU 商品发布时填写规格的数据来源。

**数据流向**：

```
用户点击左侧分类树叶子节点（三级分类）
  → 携带 categoryId 查询属性列表 → 表格渲染
  → 弹窗新增/编辑（属性名 + 动态属性值标签）
  → 后端四层校验 + 清洗 → MongoDB 落库
  → 刷新列表闭环
```

## 2. 技术实现链路（调用栈追踪）

**前端侧**（无 Pinia 参与 —— 全部是页面私有状态）：

1. `onMounted` → `getCategoryTree()` → `GET /api/category/tree` → 请求拦截器注入 Bearer token → 响应拦截器剥壳 → `el-tree` 渲染
2. 点击树节点 → `handleNodeClick`：非三级**静默放行**（树的展开收起是默认行为）；三级 → `selectedCategory` 更新 → `getAttrList(categoryId)`
3. 弹窗提交流程：`editingId`（null=新增/有值=编辑）决定调用 `createAttr` 还是 `updateAttr`；表单校验（name ≤30、values ≥1）与后端对齐
4. 属性值编辑器：`newValue` 临时输入 → `addValue` 前端预清洗（trim + 去重）→ tag 可关闭删除

**后端侧**（四层流水线）：

```
routes/attr.ts        auth → 路由声明（一行一个接口）
controllers/attr.ts   形状校验：categoryId/name/values 的类型与存在性
services/attr.ts      业务规则：三级分类校验 → 值清洗 → 边界校验 → 唯一性转换
models/Attr.ts        数据兜底：复合唯一索引 + validator
errorHandler          所有错误统一出口（409/404/400 信封）
```

**拦截器/中间件在链路中的作用**：请求拦截器负责「身份注入」、auth 中间件负责「身份验证」、响应拦截器负责「信封拆解 + 错误提示」，页面 catch 因此可以**静默**（只收 loading）。

## 3. 架构决策分析

**① 分层原因：为什么清洗逻辑在 Service 而不是 Controller？**

Controller 的职责是「请求形状」（字段在不在、类型对不对），Service 的职责是「业务规则」（三级分类才能挂属性、值怎么清洗）。分界线清晰后，将来定时任务或测试直接调 Service 时，规则依然生效 —— 校验深度与入口无关。

**② 性能优化：两处「量级判断」驱动**

- 分类树：**一次查询 + 两遍 Map 内存建树**，而非逐层查询（避免 N+1）。前提判断：分类是全局小数据（几十条），全量拉取成本极低。
- 属性列表：**不做分页**。判断标准同上 —— 每个三级分类下的属性是「几条到几十条」的量级，分页是纯交互负担。对照品牌管理的分页实现，正好是「量级决定设计」的正反两面。

**③ 错误处理：为什么全局拦截器 + 局部静默 catch？**

提示职责收口在拦截器（`request.ts`），页面 catch 只做状态收尾（关 loading）。收益：每个页面的 catch 块不再重复 ElMessage；代价：**成功提示反而要页面自己弹**（后端 message 在剥壳时被丢弃）—— 这是当前契约的一个非对称点。

**④ 扩展性：三处为未来埋的点**

- 分类复合唯一索引 + 种子 upsert（_id 稳定）—— 为 SPU/SKU 引用 categoryId 铺路
- `values: string[]` 的升级路径明确 —— SKU 维度需要稳定 id 时升级对象数组
- 属性删除当前无引用检查 —— 见风险提示

## 4. 关键函数深度拆解

### `listCategoryTree`（`services/category.ts`）

- **入参设计**：**零入参**。为什么不接受 parentId 做懒加载？因为分类总量级下「全量拉取 + 前端树组件懒展开」的复杂度最低；按 parentId 逐层查是 N+1 查询的典型来源。
- **边界处理**：对「parentId 指向不存在的父级」的孤儿节点做了容错 —— 直接挂到根数组而不是丢弃或抛错（数据自愈优于报错）。
- **返回值设计**：嵌套 `CategoryNode[]` 树而非平铺数组 —— el-tree 的 `data` 契约就是树形，后端组装好前端零加工。
- **副作用**：无（纯查询，`lean()` 返回普通对象）。

### `createAttr`（`services/attr.ts`）

- **入参设计**：三个独立参数而非对象。理由：Controller 已把 `req.body` 做形状校验拆解完毕，Service 收到的是「已确认存在的字段」—— 独立参数让类型契约更精确，也防止 Service 内部再猜 body 结构。
- **边界处理**：四道关 —— 分类存在（404）→ 必须是三级（400）→ name trim 后非空（400）→ values 归一化后非空且 ≤20 个/≤30 字符（400）。**为什么忽略其他边界**（如 values 的字符集）：无业务意义，属性值理论上可以是任意文本。
- **返回值设计**：`toAttrDTO` 而不是 mongoose 文档 —— `_id` 映射为 `attrId`、时间戳不暴露，契约最小化（品牌模块同一原则）。
- **副作用**：唯一副作用是写库；并发冲突靠复合唯一索引的 11000 → `isDuplicateKeyError` → 409 兜底 —— 不依赖先查后写（有竞态窗口）的悲观策略。

### `normalizeValues`（`services/attr.ts`）

- 一行 `Set` 管道完成 trim/去空/去重。**为什么放在 Service 而不是只靠前端 `addValue`**：前端交互只是体验优化，直调 API 可绕过 —— 双重防线原则的落点。
- **潜在语义问题**：静默去重意味着用户传 `['红','红']` 得到 `['红']` 且无任何提示 —— 这是「纠正」而非「告知」，如果产品上希望提示用户，这里是将来要改的点。

## 【风险提示】

1. **分类没有删除功能，也没有级联策略** —— 将来做分类删除时，必须决策：禁止删除有属性的分类 / 级联删除属性 / 属性迁移。当前模型没有任何约束，**这个决策点被推迟到了未来，但没有留 TODO**。
2. **属性删除无引用检查** —— 一旦 SPU/SKU 上线引用属性 id，删除属性会造成引用断裂。标准解法是引用计数或软删除，且**必须在商品模块动工前定案**，否则数据模型要返工。
3. **属性值边界常量两处重复** —— `MAX_VALUE_LENGTH/MAX_VALUES_COUNT` 在 service、模型 validator 里各写一份（30/20），改动需两处同步。量级小可接受，但已到「再出现一处就该收口」的临界点。

## 如果重构，我会改进…

1. **Phase 1 zod 落地时优先覆盖本模块** —— attr 的响应形状（树 + 列表）和请求 DTO（create/update）是最典型的契约校验对象，也是之前「类型断言 ≠ 运行时验证」讨论的落点。
2. **把「分类树」缓存起来** —— `listCategoryTree` 每次页面进入都查全表，将来分类被多个页面（商品、SPU）消费时，可以引入短 TTL 缓存 + 分类变更时失效。
3. **属性值去重从「静默纠正」升级为「显式反馈」** —— API 返回时附带被去重的提示（如 `message` 注明），让调用方感知清洗行为，而不是拿到与请求不一致的数据毫不知情。

---

## 附：本模块的关键文件清单

```
backend/src/
├── models/Category.ts      # 三级分类（复合唯一索引 {parentId, name}）
├── models/Attr.ts          # 平台属性（复合唯一索引 {categoryId, name} + values 边界 validator）
├── services/category.ts    # listCategoryTree：一次查询 + 两遍 Map 建树
├── services/attr.ts        # ensureCategoryCanHoldAttrs / normalizeValues / 边界校验 / CRUD
├── controllers/category.ts # getTree
├── controllers/attr.ts     # 形状校验 + 响应组装
├── routes/category.ts      # GET /api/category/tree
├── routes/attr.ts          # GET/POST /api/attr、PATCH/DELETE /api/attr/:id
└── scripts/seed-categories.ts  # 分类种子（自然键 upsert，_id 稳定）

vue-project/src/
├── api/category/           # getCategoryTree 类型契约
├── api/product/attr/       # 属性 CRUD 类型契约 + 请求函数
└── views/product/attr/index.vue  # 分类树 + 属性表格 + 动态属性值弹窗
```
