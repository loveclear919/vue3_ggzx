# 电商后台管理系统（ggzx）· 项目总结

> 复盘范围：`2026-08-21 first commit` → `2026-10-04 d3d27a2 feat: 虚拟列表`，共 23 次提交，工作树干净。
> 本文按 `ai-roles/agent.md` 的「架构复盘」框架输出，但对象是整个项目而非单一模块。

---

## 1. 业务全景

一句话：给电商运营用的**商品 + 权限中台**，外加一块给运营主管看的**数据大屏**。

三条业务主线：

1. **商品域建档链路**：三级分类 → 品牌 → 平台属性 → SPU（含销售属性）→ SKU（销售属性笛卡尔积生成）
2. **权限域（RBAC）**：用户 / 角色 / 权限树（菜单 + 按钮 code），页级、按钮级、接口级三处生效
3. **数据大屏**：把库存 / 定价 / 上架状态压成 1 行 KPI 卡 + 5 个面板（品牌货值 / 状态分布 / 价格带 / 热力图 / 待办清单）

核心数据流：

```
浏览器
  → axios 拦截器（注入 token / 401 踢出 / silent 静默开关）
  → /api/*
  → helmet · cors · 限流（/api/auth）
  → routes（auth → requirePermission）
  → controller（参数校验、错误抛 AppError）
  → service（业务与聚合）
  → mongoose model → MongoDB
  ← 统一信封 { code, message, data }
  ← 拦截器拆包 → Pinia / 组件 → 视图
```

---

## 2. 工程结构与规模

pnpm workspace（`pnpm@11.21.0`，Node `^22.18 || >=24.12`）：

| 包 | 内容 | 规模 |
|---|---|---|
| `backend` | Express 5 + Mongoose 9 服务 | src **4111** 行 + scripts **3442** 行 |
| `vue-project` | Vue 3.5 + TS + Element Plus 后台 | src **8649** 行 |
| `docs` | 设计文档 / 模块手册 / 复盘 | — |
| `ai-roles` | 给 AI 协作用的角色剧本（总结 / 手册 / 评审） | — |

技术栈：Vue 3.5.40 · TypeScript · Element Plus 2.14 · Vite（rolldown 构建链）· Pinia 4 · vue-router 5 · ECharts 6.1（vue-echarts 8.3，按视图注册）；Express 5.2 · Mongoose 9.9 · JWT · multer · helmet · express-rate-limit。

命令（根目录）：`pnpm dev`（前后端并行）· `pnpm check`（双端 type-check）；后端另有 `seed*` / `sync:indexes` / `audit:data` / `test:boundary` / `clean:residue`。

质量门：husky + commitlint（Conventional Commits）、lint-staged、oxlint + eslint；prettier 前后端都有配置，但**约定前端不整体跑**（只对改动文件单独 lint，避免全项目 diff）。

---

## 3. 模块清单与实现链路

| 模块 | 前端入口 | 后端链路 | 关键实现 |
|---|---|---|---|
| 登录 / 注册 | `views/login` | `routes/auth` → `services/auth` | JWT 签发；手机号或用户名登录；登录响应内联 `codes` |
| 个人资料 / 改密 | `layout/tabbar/avatar` | `routes/user` → `services/user` | 展示名可改；默认用户名「用户 + 随机编码」 |
| 用户管理 | `views/acl/user` | `routes/user` → `services/user` | 角色分配；最后一名超管不可降级（测试锁定） |
| 角色管理 | `views/acl/role` | `routes/role` → `services/role` | 内置角色不可改名 / 不可移除 `grant-super` |
| 菜单（权限）管理 | `views/acl/permission` | `routes/permission` → `services/permission` | 权限树增删改；根节点不可动 |
| 品牌管理 | `views/product/trademark` | `routes/brand` → `services/brand` | 分页 + 搜索；`/brand/all` 供商品表单下拉 |
| 属性管理 | `views/product/attr` | `routes/attr` → `services/attr` | 平台属性 + 属性值挂三级分类（`categoryId + name` 唯一） |
| SPU 管理 | `views/product/spu` | `routes/spu` → `services/spu` | SPU 表单 + 图片上传；列表按三级分类查询 |
| SKU 管理 | `views/product/sku`（路由 `/product/spu/sku`） | `routes/sku` → `services/sku` | 销售属性**笛卡尔积**生成 SKU；上架闸门（无价不可上架）；并发重复生成防护 |
| 图片上传 | `components/image-uploader` | `routes/upload` → `utils/upload` | multer 落盘 + 静态目录；非图片类型 400 |
| 数据大屏 | `views/screen` | `routes/dashboard` → `services/dashboard` | 1 行 KPI 卡 + 5 面板（含待办清单）；30s 轮询；虚拟列表 |
| 分类 / 销售字典 | **无管理页**（只读接口） | `routes/category`（仅 GET）、`routes/baseSaleAttr`（仅 GET） | 分类树供级联选择器、销售属性供 SPU 表单；治理方案未实现，见 §7 |

---

## 4. 架构决策分析

### 4.1 分层：为什么逻辑在 Service 而不是 Controller / Component

- **后端**：`routes` 只做接线（挂 `auth` + `requirePermission`），`controller` 只做参数校验与响应封装，`service` 承担业务与聚合。理由是**同一份业务要被多个入口复用** —— 例如品牌名映射、分类上溯、SKU 生成规则在列表、详情、大屏三处都要用，放进 controller 就会复制三份。
- **前端**：请求封装集中在 `api/*`，页面只做状态与交互；跨页面复用的 UI 沉到 `components/`（分类级联、图片上传、分页）。

### 4.2 鉴权：接口级粗粒度 + 数据级在 Service

`requirePermission(...codes)`（`backend/src/middlewares/requirePermission.ts:9`）是 **some 语义**（任一 code 命中即放行），并把聚合出的 `userCodes` 挂到 `req.permissionCodes`，由 controller **显式透传**给 service —— service 不读 `req`，拿不到权限集合时按无特权 **fail-closed**。这样「能否调用此 API」在中间件回答，「能看多少数据」在 service 回答，两层不互相污染。

三元特权保护（内置角色、`grant-super`、最后一名超管）全部由边界测试锁定，防止后续改动悄悄放开。

### 4.3 错误处理：全局拦截器 + 统一信封

后端所有失败路径都抛 `AppError`，由 `middlewares/errorHandler` 统一转成 `{ code, message }`；404 也走同一条路（`backend/src/index.ts:44`）而不是 Express 默认 HTML。前端在 `utils/request.ts` 一处拆包：业务码非 200 → `ElMessage.error`；HTTP 401 → 去重标志（并发 401 只处理一次）→ 清 store → 跳登录；**登录/注册自身的 401 不算会话过期**，只弹文案不踢人。

### 4.4 性能：把「按数据量增长」的成本挡在外面

| 位置 | 手段 | 为什么 |
|---|---|---|
| 大屏轮询 | 30s 定时 + `visibilitychange` 暂停/恢复 | 大屏常驻，后台标签页不该空转 |
| 大屏取数 | 4 次 `Promise.all` + `select` + `lean`，内存建 Map 聚合 | 数据量小，一次全量比 `$lookup` / N+1 更简单也更快 |
| ECharts | 按视图注册 + 大屏独立 chunk（588KB 懒加载） | echarts 全量不进首屏 |
| 待办清单 | **虚拟列表 + `contain: size`** | DOM 与数据量解耦：1000 条待办仍是 21 行 / 261 节点；面板高度不再被清单顶长 |
| 路由 | 懒加载 + `keep-alive` 只保 SPU 页 | 保住列表页筛选状态，又不留一堆常驻组件 |

### 4.5 前端约定（踩坑后固化下来的）

- **令牌化样式**：颜色 / 间距 / 字号 / 圆角全部走 CSS 变量（`styles/variables.scss`、大屏另有 `styles/dash-tokens.mts` 供 ECharts 读取 JS 值），不硬编码。
- **Element Plus 浮层样式**必须另开**非 scoped** 块（浮层被 teleport 到 body，scoped 选择器打不到）。
- **弹窗表单加 `destroy-on-close`**：复用 DOM 会让上次的布局残留、下次打开跳动。
- **keep-alive 结构**：keyed `fullPath` + `include` + 刷新重建 key 三件套是一起定案的，改一处必须连带看另两处。

---

## 5. 关键链路深度拆解

### 5.1 `requirePermission(...codes)` — 鉴权中间件

- **入参设计**：可变 code 列表而非单个 code。`/brand/all` 同时被品牌页（`/product/trademark`）和 SPU 表单（`/product/spu`）调用，两种角色都该能读；写成「任一命中」省掉一个「权限组」概念。
- **边界处理**：`req.userId` 缺失 → 401（未登录）；集合不含任何 code → 403。**没有**做「无权限码的接口默认放行」这类兜底 —— 漏挂中间件是接线错误，宁可 401/403 暴露。
- **返回值 / 副作用**：不返回值，成功走 `next()`；副作用只有一条：把 `userCodes` 写进 `req.permissionCodes`（给 controller 透传给 service 用，service 自己不碰 `req`）。
- **关键**：权限聚合（角色 → 权限 → 祖先菜单链补全、防成环）在 `services/rbac.ts`，中间件只做集合判定，两者职责不混。

### 5.2 `getDashboardStats()` — 大屏聚合（`backend/src/services/dashboard.ts:147`）

- **入参**：无。整屏数据是一个快照，多面板必须**同一时刻**的口径（分三次请求会出现「KPI 是旧的、图表是新的」）。
- **边界处理**：空库时 `sellableRate` 取 0 而不是 NaN；价格带用 `bucketPrice` 的**下闭上开**语义（`utils/priceBand.ts`），边界值归上一档；待办三分类是 **if/else 链**（未定价优先于零库存），保证同一条 SKU 不重复计数。
- **返回值设计**：整包返回 `{ kpi, stockValue, priceBands, brandTop, skuStatus, todos, skus, spus }`，而不是让前端自己算 —— 前端若从 `skus` 推导 KPI，等于把业务口径复制到两个语言里，改一处漏一处。
- **副作用**：纯读，无写入。`todos` **不截断**（原 `TODO_LIMIT` 已移除），因为前端是虚拟列表，全量给过去只是滚动范围变大；代价是响应体随待办数线性增长（实测 96 条约 17.6KB），上千条时再改游标/增量 —— 已写在 `dashboard.ts:126` 的注释里。

### 5.3 `SkuTodoList` 虚拟列表（`vue-project/src/views/screen/components/SkuTodoList.vue`）

- **入参设计**：只有 `todos`。原先还需要 `pendingTotal` 来算「未展示条数」，不截断后它恒等于 `todos.length`，于是连同脚注一起删除 —— 参数要能被证明是必需的。
- **边界处理**：首帧 `rowH = 0` 时**只渲染 1 行**，量出行高再开窗（否则首帧要按估高渲染一整屏再纠正）；行高必须**实测**（字号带 `vw`，窄视口下标签高度会反超文本行），且必须带上 CSS 的 `margin-bottom`；`atEnd` 判定留 1px 容差，避免浏览器亚像素舍入导致渐隐不撤。
- **返回值 / 副作用**：无对外副作用；内部起一个 `ResizeObserver` 盯滚动容器（面板随视口变高变矮），`onBeforeUnmount` 断开。
- **配套的布局前提**：面板加 `contain: size`（`views/screen/index.vue:485`）断开「内容 → 高度」，否则清单越长 → 面板越高 → 网格行越高 → 整页被顶长（实测 30 条就能到 2000px+）。**先试过 `max-height` 封顶，实测在 1920×1080 下会让面板提前收边、右列下方空出 117px 空洞**，才换成尺寸包含。

---

## 6. 质量与验证

### 6.1 边界测试 164 例（`backend/scripts/boundary-test.ts`）

模块分布：SKU 相关 51（生成 / 取值 / 引用 / 完整性 / 上架闸门 / 并发 / 边界）、权限与 RBAC 32、SPU 18、用户 13、品牌 9、角色 8、属性 6、注册 5、大屏 5、分类 4、个人资料 3、改密 3、登录 2、上传 2、token 与销售字典 3。

覆盖类型：越权（无 token / 伪造 token / 无权限用户）、边界值（价格分档下闭上开、SKU 笛卡尔积空集）、契约（字段形状、分类路径、大屏数值与**直连库**一致）、并发（重复生成 SKU）、软约束（内置角色 / 超管保护）。

**当前状态：163 / 164 通过。**

### 6.2 其它验证手段

- 双端 `type-check`（`vue-tsc --build` + `tsc --noEmit`）× 每次改动；
- `audit:data` 数据体检脚本（跨表一致性）；
- 大屏 UI 用 headless Chrome + CDP 探针实测（窗口化定位漂移 0.00px、行距恒 5px、表头对齐 0、滚动条宽度 0、断点矩阵 2560→600、数据刷新 50→8→50 条不空白）。探针脚本是一次性工具，不随代码演进 —— 见 §7。

---

## 7. 【风险提示】与已知遗留

- **【风险提示】边界测试有 1 例红**：`RBAC：无权限用户访问管理接口 → 403` 实际拿到 400。原因是**测试前提过期**，不是接口缺陷 —— 注释仍写「新注册 = 默认 user 角色（仅 /home /screen）」，但库里的默认 user 角色已经带了 `/product/spu` 等商品权限，于是 `GET /spu` 根本没走到 403，而是因缺 `categoryId` 返回 400（`controllers/spu.ts:11`）。实测普通 token：`/user`、`/role`、`/permission`、`/brand?page` 均 403，`/brand/all` 200（它接受 `/product/trademark` 或 `/product/spu`，符合预期）。**修法**：把断言改成实际语义（用 `categoryId` 调一次断言 403，或换一个该角色确实没有的接口），不要为了迁就它去改权限数据。
- **【风险提示】分类与销售字典只有只读接口**：`routes/category.ts`、`routes/baseSaleAttr.ts` 都只有 GET，前端也没有管理页。分类树只能靠种子脚本维护，运营改不了分类名 / 层级；销售字典同理。这是当前**唯一成体系的未完成面**。
- **【风险提示】大屏待办无上限、响应无压缩**：`todos` 全量返回（96 条约 17.6KB，整个 stats 响应 66KB，**未挂 compression**）。到上千条时该做的是游标 / 增量拉取 + 压缩，而不是重新砍条数。
- **前端没有测试框架**：UI 靠人工 + 一次性 CDP 探针验证，探针不进仓库。改动大屏布局时，历史上多次靠探针才发现问题（2px 列错位、浮窗越界、0×0 图表），这部分经验没有被自动化沉淀。
- **大屏 responsive 断点靠媒体查询兜底**（≤1200 双列、≤768 单列）：能工作，但每加一个面板都要重新验证一遍断点矩阵。

---

## 8. 如果重构，我会改进…

1. **把分类 / 销售字典的管理页补上**，让分类体系可运营（当前是种子脚本独占写入权）。
2. **给前端补最小可用的测试**：至少把大屏的「数值面板 ↔ 直连库一致」和虚拟列表的窗口几何做成可重复跑的脚本，而不是一次性探针。
3. **大屏取数改增量**：轮询只拉变化的部分（或后端算好 ETag / 版本号），顺带挂上 compression。
4. **把 `requirePermission` 的 code 与前端路由 `meta.code` 收敛到一份常量**（现在后端字符串、前端字符串，靠测试与人工对齐）。
5. **统一响应体的错误码语义**：现在 `code` 直接复用 HTTP 状态码，够用；要做前端按码分支处理时，建议再分出业务错误码维度。
