# 属性管理模块实现手册（三级分类下钻 + 平台属性）

> 本手册记录属性管理（前端 `/product/attr`，后端 `/api/category` + `/api/attr`）模块的完整实现，
> 作为后续同类模块（SPU/SKU）的**参照模板**。每个关键决策附「为什么这么做」。
>
> 分类选择器已从「全量分类树」改造为**逐级下钻**，并抽成全局组件 `components/category`（attr / SPU 共用）；
> 改造的决策复盘见 `docs/reviews/category-drilldown.md`（本手册只记录落地形态）。

## 一、模块总览

| 功能 | 前端入口 | 后端接口 |
|------|----------|----------|
| 分类逐级下钻 | 左侧面包屑 + 平铺列表 | `GET /api/category?parentId=xxx`（不传 = 一级分类） |
| 属性列表（按三级分类） | 点击三级分类项 | `GET /api/attr?categoryId=xxx` |
| 新增属性 | 弹窗（名称 + 动态属性值） | `POST /api/attr` |
| 修改属性 | 弹窗回显 | `PATCH /api/attr/:id` |
| 删除属性 | 二次确认 | `DELETE /api/attr/:id` |

涉及文件：

```
backend/src/
├── models/Category.ts            # 三级分类（复合唯一索引 {parentId, name}）
├── models/Attr.ts                # 平台属性（复合唯一索引 {categoryId, name} + limits/validator/DTO）
├── services/category.ts          # listChildCategories：平铺子级 + hasChildren 聚合批量判断
├── services/attr.ts              # 分类校验 / 值清洗 / 边界校验 / CRUD
├── controllers/category.ts       # listCategories：parentId 形状校验
├── controllers/attr.ts           # 形状校验 + 响应组装
├── routes/category.ts            # GET /api/category
├── routes/attr.ts                # GET/POST /api/attr、PATCH/DELETE /api/attr/:id
└── scripts/seed-categories.ts    # 分类种子（自然键 upsert，_id 稳定）

vue-project/src/
├── api/category/                 # getCategoryChildren(parentId?) + CategoryFlatNode 契约
├── api/product/attr/             # 属性 CRUD 类型契约 + 请求函数
├── components/category/index.vue # 【跨模块共享】逐级下钻分类选择器（attr / SPU 共用）
└── views/product/attr/
    ├── constants.ts              # ATTR_LIMITS：与后端 models/Attr.ts 镜像的边界常量
    └── index.vue                 # 属性表格 + 动态属性值弹窗（分类选择外包给共享组件）
```

## 二、后端分层实现

### 1. 数据模型

**`models/Category.ts` —— 三级分类：**

```ts
name: { required, trim, maxlength: 20 }
level: { required, enum: [1, 2, 3] }
parentId: { ref: 'Category', default: null }   // 一级分类为 null

// 复合唯一索引：同一父级下分类名唯一
categorySchema.index({ parentId: 1, name: 1 }, { unique: true })
```

**为什么：**

- `parentId` 为 null 的一级分类在唯一索引中同样按值参与去重 —— 一级分类之间也不会重名
- 复合索引同时覆盖「按 parentId 查询」的需求（下钻的主查询），替代单字段索引
- **索引定义变更后必须手动对齐库**：mongoose 的 `autoIndex` 只建不删，schema 里删掉的索引会静默留在库里。
  本项目用 `pnpm --filter backend run sync:indexes`（`scripts/sync-indexes.ts`，`syncIndexes()` 建缺失 + 删多余）对齐，
  脚本会打印每个集合的「无变化 / 增删了哪些」。**不要挂进应用启动流程** —— 它会 DROP 索引

**`models/Attr.ts` —— 平台属性：**

```ts
// 本模块的数字边界总表 —— 唯一来源：模型 validator 与 service 的校验/文案共用
export const ATTR_LIMITS = { NAME_LENGTH: 30, MAX_VALUES_COUNT: 20, VALUE_LENGTH: 30 } as const

name: { required, trim, maxlength: [ATTR_LIMITS.NAME_LENGTH, `属性名称不能超过 ... 个字符`] }
categoryId: { ref: 'Category', required }
values: {
  type: [String],
  default: [],
  validate: {   // 边界防线：单个值 ≤ VALUE_LENGTH、最多 MAX_VALUES_COUNT 个
    validator: (arr) => arr.length <= ATTR_LIMITS.MAX_VALUES_COUNT &&
                        arr.every((v) => v.length <= ATTR_LIMITS.VALUE_LENGTH),
    message: `属性值单个最长 ${...} 个字符，最多 ${...} 个`,
  },
}

// 复合唯一索引：同一分类下属性名唯一（11000 → isDuplicateKeyError → 409）
attrSchema.index({ categoryId: 1, name: 1 }, { unique: true })
```

**为什么：**

- 唯一性交给数据库索引而不是先查后写 —— 先查后写有并发竞态窗口，11000 → 409 才是并发安全的兜底
- values 边界写在模型 = **数据完整性兜底**（任何写入路径都逃不过，包括将来的脚本/迁移）；
  service 层的同规则校验只负责给出更明确的 400 文案。两者共用 `ATTR_LIMITS`，不存在"两份常量靠注释对齐"的漂移风险
- **DTO 显式 `String()` 而不是让 mongoose 自己序列化**：`toAttrDTO` 返回
  `{ attrId: String(_id), name, categoryId: String(categoryId), values }`。
  线上格式本就是 JSON 序列化后的 hex 字符串，显式转换让「DTO 类型 = 传输格式 = 前端 `AttrInfo`（全为 string）」三者一致

### 2. 业务层

**`services/category.ts` —— 平铺子级 + `hasChildren` 批量判断：**

```ts
// 按父级平铺查询子级（不传 parentId = 一级分类）：list.length === 0 提前 return，
// 避免对空数组做 $in: [] 聚合
const list = await Category.find(parentId ? { parentId } : { parentId: null })
  .sort({ createdAt: 1 })
  .lean()

const childCounts = await Category.aggregate([
  { $match: { parentId: { $in: list.map((c) => c._id) } } },
  { $group: { _id: '$parentId', count: { $sum: 1 } } },   // 一次聚合算完所有子级计数
])
return list.map((category) => ({ ..., hasChildren: (countMap.get(String(category._id)) ?? 0) > 0 }))
```

**为什么：**

- **返回 `hasChildren` 而不是 `children`** —— 下钻场景前端只需知道「这行还能不能点进去」，
  不要子树：每次响应保持 O(当前层级)，整棵树永不离开数据库（旧版「全量查询 + 内存建树」已删除）
- **`$group` 聚合批量判断而不是逐条 `countDocuments`** —— 后者是 N+1 查询（10 条一级分类 = 11 次往返）
- **不传 parentId 表示一级分类** —— 一级分类的 `parentId` 是 `null`，但 URL 查询参数无法表达「null vs 未提供」，
  用「不传参数」代替「传 null」，避免 `?parentId=null` 这种歧义串
- **parentId 不存在时返回空数组而不是 404** —— 下钻场景里「空」是合法结果（该父级下确实没有子级），不是错误

**`services/attr.ts` —— 属性 CRUD 的三道业务关卡：**

```ts
// ① 分类校验（list 与 create 共用，校验深度一致）
async function ensureCategoryCanHoldAttrs(categoryId: string) {
  const category = await Category.findById(categoryId)
  if (!category) throw AppError.notFound('分类不存在')
  if (category.level !== 3) throw AppError.badRequest('只有三级分类才能添加属性')
}

// ② 值清洗（后端防线 —— 前端 addValue 已做一轮，绕过前端直调 API 也拦得住）
function normalizeValues(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))]   // trim + 去空 + 去重
}

// ③ 边界校验（数字取自 ATTR_LIMITS，只负责给出更明确的 400 文案）
function assertValuesBoundary(values: string[]) {
  if (values.length > ATTR_LIMITS.MAX_VALUES_COUNT) throw AppError.badRequest(`属性值最多 ${...} 个`)
  if (values.some((v) => v.length > ATTR_LIMITS.VALUE_LENGTH)) throw AppError.badRequest(`属性值长度不能超过 ${...} 个字符`)
}
```

**为什么：**

- **list 也要校验分类**而不是返回空数组 —— 空数组有「该分类确实没有属性」的语义，非法分类返回空会造成
  「误导性空结果」，调用方分不清「没数据」和「查错了」
- **11000 → 409** 复用 `isDuplicateKeyError`（新增和改名两条路径都要接）
- name 的 trim 收口在 service（create/update 两条路径对齐），controller 只做类型判断

### 3. 处理层与接线层

**controller 的职责：形状校验（字段在不在、类型对不对）→ 调 service → 组装响应：**

```ts
// 查询参数：必填 string（parentId 是可选的另一种写法）
if (typeof categoryId !== 'string' || !categoryId) throw AppError.badRequest('缺少 categoryId 参数')

// 请求体：字段必须齐、类型必须对，清洗一律不在这里做
if (!Array.isArray(values) || values.length === 0 || !values.every((v) => typeof v === 'string')) {
  throw AppError.badRequest('属性值不能为空且必须为字符串数组')
}
```

**routes 的职责：只有声明：**

```ts
router.use(auth)
router.get('/', attrController.listAttrs)
router.post('/', attrController.createAttr)
router.patch('/:id', attrController.updateAttr)
router.delete('/:id', attrController.deleteAttr)
```

**Express 5 的坑**（品牌模块手册已记录，此处再次出现）：`req.params.id` 类型是 `string | string[]`，
每个带 `:id` 的接口都要 `Array.isArray` 收窄。

### 4. 种子脚本（分类数据来源）

`scripts/seed-categories.ts`（`pnpm --filter backend run seed` 执行）：

```ts
// 按「同级 + 同名 + 同父」的自然键 upsert —— 分类 _id 保持稳定
async function upsertCategory(level, name, parentId) {
  return Category.findOneAndUpdate(
    { level, name, parentId },
    { $set: { level, name, parentId } },
    { upsert: true, new: true },
  )
}
```

**为什么不用 `deleteMany` + 重建：** 重建会让所有 categoryId 换新 —— 属性（以及 SPU/SKU）都引用 categoryId，
重跑种子后旧数据全部变成孤儿引用。upsert 保证 _id 稳定，重跑无害。
代价：从种子数据里删掉的分类不会自动清除（开发库需彻底重置时手动清 collection）。

## 三、前端页面实现

### 1. 状态模型（为什么不用 Pinia）

**页面（`views/product/attr/index.vue`）自己只持有 4 个状态：**

```
selectedCategory  当前选中的三级分类（null = 未选择）
attrList          当前分类下的属性列表
dialogVisible / editingId   弹窗开关 + 模式（null=新增 / 有值=编辑）
```

下钻路径与层级列表**不在页面里**，而是封在共享组件内部（见下节）。

判断标准同品牌模块：**「有多个页面/组件要读吗？切换路由要保留吗？刷新要恢复吗？」都不是 → 组件内 ref 即可**。
属性列表是页面私有数据，天然随页面销毁而清理。

### 2. 共享的分类下钻组件（`components/category/index.vue`）

attr 与 SPU 两页的分类选择完全同构，已抽成全局组件：**使用方只声明「选中了哪个三级分类」**。

```vue
<!-- 使用方：selectedId 用于回显高亮，@select 只在点到三级分类时触发 -->
<CategoryDrilldown :selected-id="selectedCategory?.categoryId" @select="handleCategorySelect" />
```

组件内部三件事：

| 内部状态/函数 | 作用 |
|--------------|------|
| `categoryPath` | 下钻路径栈（`[]` = 正在看一级分类），同时驱动 `el-breadcrumb` |
| `categoryLevelList` | 当前层级的平铺列表 —— **任何时刻只渲染这一层**，与数据总量解耦 |
| `handleCategoryClick` | `level < 3` → push 路径 + 拉子级；`level === 3` → `emit('select')` |
| `goBackTo(index)` / `goBackToRoot()` | 面包屑回跳：路径 `slice(0, index + 1)` 截断后重拉该层级 |

**三个交互决策（都有理由）：**

| 决策 | 理由 |
|------|------|
| 只有三级分类 `emit('select')`，一级/二级点击是**下钻**（不弹提示） | 「提示疲劳」反模式：非叶子节点本来就负责深入，是正常交互不是错误；空态引导由表格 empty-text 承担 |
| 面包屑**回跳而非清空** | 回跳到中间层级后，该层级下的兄弟/子级列表正是用户想看的，清空会丢失导航上下文 |
| `level < 3 && hasChildren` 才显示右箭头 | 箭头是「还能点进去」的承诺；后端给了 `hasChildren`，不必前端猜 |

**为什么用全局组件而不是 `useCategoryDrilldown` composable：** 本模块的形态是「左栏选择器 + 右栏业务列表」，
两页的左右分栏布局与卡片头部也完全一致 —— 抽成**组件**连模板一起复用（composable 只能复用逻辑，模板要抄两遍）。
后续若出现第三种消费形态（例如分类管理页内嵌仅列表、无卡片外壳），再把组件内部逻辑下沉为 composable。

### 3. 交互细节表

| 细节 | 处理 |
|------|------|
| 空态双语义 | `computed` 动态文案：未选分类 = 「请先在左侧选择三级分类」（引导），已选无数据 = 「暂无数据」（结果说明） |
| 弹窗模式区分 | `editingId`（null=新增/有值=编辑）—— 一个变量同时回答「什么模式」和「编辑哪条」 |
| 弹窗销毁策略 | `destroy-on-close`：关闭即销毁内容、每次打开全新挂载 —— el-dialog 默认复用 DOM（关闭只是隐藏），上次打开的布局状态会带到下次打开的过渡动画里（属性值 tag 由有变无时内容上下跳动）；销毁后每次打开都是全新首帧 |
| 属性值编辑器 | 临时 `newValue` → `addValue`（trim + 去重 + 警告）→ `el-tag closable` 删除；回车键可添加 |
| 表单校验 | `name` 必填 ≤ `ATTR_LIMITS.NAME_LENGTH`、`values` 数组 ≥1，与后端对齐（双重防线） |
| 边界常量 | 页面不再写 `30` / `20` 字面量，一律取 `views/product/attr/constants.ts` 的 `ATTR_LIMITS`（含输入框 `maxlength`） |
| 成功提示谁弹 | 页面 `ElMessage.success`（拦截器只弹错误） |
| 未选分类时添加按钮 | `disabled`（能力禁用），而非点击后弹提示 |

**EP 类型限制**（品牌模块手册已记录）：el-table 插槽 `scope.row` 是宽泛的 `DefaultRow`，调用处 `scope.row as AttrInfo` 断言。

**边界常量的镜像约定：** 前端 `views/product/attr/constants.ts` 与后端 `models/Attr.ts` 的 `ATTR_LIMITS`
**键名完全一致、值必须相等**。前后端是两个独立包，前端不能 import 后端代码（浏览器也不该拿到服务端规则），
所以只能镜像；键名一致是为了让 diff 时能一眼比对。**真正的兜底永远在后端**，前端只是提前告知。

## 四、错误处理全链路（本模块完整矩阵）

| 场景 | 后端触发点 | 转换 | 前端消费 |
|------|-----------|------|----------|
| 同分类同名属性（新增/改名） | 复合唯一索引 11000 | `isDuplicateKeyError` → 409 | 拦截器弹「该分类下已存在同名属性」 |
| 一级/二级分类挂属性 | service 显式校验 | AppError → 400「只有三级分类才能添加属性」 | 同上 |
| 分类不存在 | service 显式校验 | AppError → 404 | 同上 |
| 属性值超长/超量 | service 边界校验 → 模型 validator 兜底 | 400 | 同上 |
| 属性值全空/全重复去空 | service 归一化后为空 | 400「属性值不能为空」 | 同上 |
| 名称超 30 字符 | 模型 maxlength | ValidationError → 400 | 同上 |
| 下钻查询 `parentId` 参数格式非法（如 `?parentId=`） | controller 形状校验 | AppError → 400 | 同上 |
| token 失效 | auth 中间件 | AppError → 401 | 拦截器 401 分支：清 token 跳登录 |

**分工原则**（与品牌模块一致）：后端 service 判断 → 转 AppError → errorHandler 生产信封 code →
前端拦截器判断 code/HTTP status → 决定「给数据」还是「弹错误」。

## 五、验证清单

**接口层（`pnpm --filter backend run test:boundary` 已覆盖，44 例全绿）：**

- [ ] `GET /api/category` 无参 → 一级分类平铺（带 `hasChildren`）；带 `?parentId=` → 该父级子级
- [ ] 新增属性 → 200；同分类同名 → 409；一级/二级分类 → 400；分类不存在 → 404
- [ ] 脏数据清洗：`[' 红 ', '红', '', ' 蓝 ']` → 存为 `['红','蓝']`
- [ ] 31 字符属性值 → 400；21 个值 → 400；正常值不误伤
- [ ] `pnpm --filter backend run seed` 重跑后分类 _id 不变
- [ ] `pnpm --filter backend run sync:indexes` → 六个集合均「无变化」

**浏览器层：**

- [ ] 进页面只显示一级分类；点一级/二级下钻，面包屑随路径增长
- [ ] 面包屑回跳：点「手机数码」回到二级列表，路径截断为 `[手机数码]`
- [ ] 只有三级分类会改变右侧：表格加载 + 左侧选中项高亮 + 标题带分类名
- [ ] 未选分类：表格显示「请先在左侧选择三级分类」、添加按钮禁用
- [ ] 已选无数据分类：显示「暂无数据」
- [ ] 添加属性（tag 增删、重复值警告、回车添加、超 20 个警告）→ 列表出现
- [ ] 编辑回显、删除二次确认，行为正常

## 【风险提示】

1. **分类没有删除功能，也没有级联策略** —— 将来做分类删除时必须决策：禁止删除有属性的分类 / 级联删除 / 属性迁移。
   当前无任何约束，做分类 CRUD 前先定案。
2. **属性删除无引用检查** —— SPU 已开始引用属性（SPU 的 `attrList` 是属性快照），SKU 上线后引用更深。
   删除属性会造成引用断裂。标准解法是引用计数或软删除，**必须在 SKU 模块动工前定案**。
   （现状：SPU 的编辑流程对「属性管理中已删除」的行做了宽松放行 —— 见 `docs/handbooks/spu-module.md`）
3. **下钻列表无搜索、无竞态防护** —— 某个二级分类下三级有几百条时纯滚动低效；快速连点两级时后发请求可能先回。
   两者都在 `docs/reviews/category-drilldown.md` 的风险提示里有方案（keyword 过滤 / 请求序号），当前量级未做。
4. **前后端边界常量镜像靠人工同步** —— `ATTR_LIMITS` 在前后端各一份（键名一致），改边界必须同时改两处；
   漏改的后果是前端提示与后端拦截不一致（后端仍会拦，不会写脏数据）。要彻底消除只能引入共享包，当前 monorepo 未做。
