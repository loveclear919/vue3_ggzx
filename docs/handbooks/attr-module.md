# 属性管理模块实现手册（三级分类 + 平台属性）

> 本手册记录属性管理（前端 `/product/attr`，后端 `/api/category` + `/api/attr`）模块的完整实现，
> 作为后续同类模块（SPU/SKU）的**参照模板**。每个关键决策附「为什么这么做」。

## 一、模块总览

| 功能 | 前端入口 | 后端接口 |
|------|----------|----------|
| 三级分类树 | 左侧 el-tree | `GET /api/category/tree` |
| 属性列表（按三级分类） | 点击树叶子节点 | `GET /api/attr?categoryId=xxx` |
| 新增属性 | 弹窗（名称 + 动态属性值） | `POST /api/attr` |
| 修改属性 | 弹窗回显 | `PATCH /api/attr/:id` |
| 删除属性 | 二次确认 | `DELETE /api/attr/:id` |

涉及文件：

```
backend/src/
├── models/Category.ts          # 三级分类（复合唯一索引 {parentId, name}）
├── models/Attr.ts              # 平台属性（复合唯一索引 {categoryId, name} + values 边界 validator）
├── services/category.ts        # listCategoryTree：一次查询 + 两遍 Map 内存建树
├── services/attr.ts            # 分类校验 / 值清洗 / 边界校验 / CRUD
├── controllers/category.ts     # getTree
├── controllers/attr.ts         # 形状校验 + 响应组装
├── routes/category.ts          # GET /api/category/tree
├── routes/attr.ts              # GET/POST /api/attr、PATCH/DELETE /api/attr/:id
└── scripts/seed-categories.ts  # 分类种子（自然键 upsert，_id 稳定）

vue-project/src/
├── api/category/               # getCategoryTree 类型契约
├── api/product/attr/           # 属性 CRUD 类型契约 + 请求函数
└── views/product/attr/index.vue # 分类树 + 属性表格 + 动态属性值弹窗
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
- 复合索引同时覆盖「按 parentId 查询」的需求，替代单字段索引（记得 `syncIndexes()` 清理旧索引 —— mongoose 不会自动删除 schema 中已移除的索引）

**`models/Attr.ts` —— 平台属性：**

```ts
name: { required, trim, maxlength: 30 }
categoryId: { ref: 'Category', required }
values: {
  type: [String],
  default: [],
  validate: {   // 边界防线：单个值 ≤30 字符、最多 20 个
    validator: (arr) => arr.length <= 20 && arr.every((v) => v.length <= 30),
    message: '属性值单个最长 30 个字符，最多 20 个',
  },
}

// 复合唯一索引：同一分类下属性名唯一
attrSchema.index({ categoryId: 1, name: 1 }, { unique: true })
```

**为什么：**

- 唯一性交给数据库索引而不是先查后写 —— 先查后写有并发竞态窗口，11000 → 409 才是并发安全的兜底
- values 边界写在模型 = 数据完整性兜底（任何写入路径都逃不过）；service 层还有一份同规则校验提供更明确的 400 文案

### 2. 业务层

**`services/category.ts` —— 建树（一次查询 + 两遍 Map）：**

```ts
export async function listCategoryTree() {
  const categories = await Category.find().sort({ createdAt: 1 }).lean()

  // 第一遍：为每条记录建节点并登记（Map 按 _id 索引）
  const nodeMap = new Map<string, CategoryNode>()
  for (const category of categories) {
    nodeMap.set(String(category._id), toCategoryNode(category))
  }

  // 第二遍：按 parentId 挂载 —— 有父级挂到父级 children，无父级进根数组
  const roots: CategoryNode[] = []
  for (const category of categories) {
    const node = nodeMap.get(String(category._id))!
    const parentId = category.parentId ? String(category.parentId) : null
    if (parentId && nodeMap.has(parentId)) {
      nodeMap.get(parentId)!.children.push(node)
    } else {
      roots.push(node)   // 孤儿节点容错：挂根而不是抛错
    }
  }
  return roots
}
```

**为什么：**

- **一次查询全量 + 内存建树**，而不是按 parentId 逐层查 —— 逐层查是 N+1 查询的典型来源；分类是全局小数据（几十条），全量成本极低
- 孤儿节点（parentId 指向不存在的父级）容错挂根 —— 数据自愈优于报错

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
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))]
}

// ③ 边界校验（与模型 validator 对齐的明确 400 文案）
function assertValuesBoundary(values: string[]) { /* ≤20 个、单个 ≤30 字符 */ }
```

**为什么：**

- **list 也要校验分类**而不是返回空数组 —— 空数组有「该分类确实没有属性」的语义，非法分类返回空会造成「误导性空结果」，调用方分不清「没数据」和「查错了」
- **11000 → 409** 复用 `isDuplicateKeyError`（新增和改名两条路径都要接）
- name 的 trim 收口在 service（create/update 两条路径对齐），controller 只做类型判断

### 3. 处理层与接线层

**controller 的职责：形状校验（字段在不在、类型对不对）→ 调 service → 组装响应：**

```ts
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

**Express 5 的坑**（品牌模块手册已记录，此处再次出现）：`req.params.id` 类型是 `string | string[]`，每个带 `:id` 的接口都要 `Array.isArray` 收窄。

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

**为什么不用 `deleteMany` + 重建：** 重建会让所有 categoryId 换新 —— 属性（以及将来的 SPU/SKU）都引用 categoryId，重跑种子后旧数据全部变成孤儿引用。upsert 保证 _id 稳定，重跑无害。代价：从种子数据里删掉的分类不会自动清除（开发库需彻底重置时手动清 collection）。

## 三、前端页面实现

### 1. 状态模型（为什么不用 Pinia）

```
categoryTree   分类树数据（全量，el-tree 消费）
selectedCategory  当前选中的三级分类（null = 未选择）
attrList      当前分类下的属性列表
```

判断标准同品牌模块：**「有多个页面/组件要读吗？切换路由要保留吗？刷新要恢复吗？」都不是 → 组件内 ref 即可**。属性列表是页面私有数据，天然随页面销毁而清理。

### 2. el-tree 集成要点

```vue
<el-tree
  :data="categoryTree"
  :props="{ label: 'name', children: 'children' }"   <!-- 后端树形直接消费，前端零加工 -->
  node-key="categoryId"
  highlight-current
  default-expand-all
  @node-click="handleNodeClick"
/>
```

**两个交互决策（都有理由）：**

| 决策 | 理由 |
|------|------|
| 点击一级/二级**静默放行**（不弹提示） | 「提示疲劳」反模式：非叶子节点本来就负责展开/收起，是正常交互不是错误；空态引导由表格 empty-text 承担 |
| 高亮采用**点击反馈**语义（非受控选中） | 用户明确选择：小树里「高亮 = 你点了这里」的即时反馈比「高亮 = 当前生效选择」的严格语义更友好；真正的选中由右侧标题（`属性列表（xxx）`）承载 |

### 3. 交互细节表

| 细节 | 处理 |
|------|------|
| 空态双语义 | `computed` 动态文案：未选分类 = 「请先在左侧选择三级分类」（引导），已选无数据 = 「暂无数据」（结果说明） |
| 弹窗模式区分 | `editingId`（null=新增/有值=编辑）—— 一个变量同时回答「什么模式」和「编辑哪条」 |
| 属性值编辑器 | 临时 `newValue` → `addValue`（trim + 去重 + 警告）→ `el-tag closable` 删除；回车键可添加 |
| 表单校验 | `name` 必填 ≤30、`values` 数组 ≥1，与后端对齐（双重防线） |
| 成功提示谁弹 | 页面 `ElMessage.success`（拦截器只弹错误） |
| 未选分类时添加按钮 | `disabled`（能力禁用），而非点击后弹提示 |

**EP 类型限制**（品牌模块手册已记录）：el-table 插槽 `scope.row` 是宽泛的 `DefaultRow`，调用处 `scope.row as AttrInfo` 断言。

## 四、错误处理全链路（本模块完整矩阵）

| 场景 | 后端触发点 | 转换 | 前端消费 |
|------|-----------|------|----------|
| 同分类同名属性（新增/改名） | 复合唯一索引 11000 | `isDuplicateKeyError` → 409 | 拦截器弹「该分类下已存在同名属性」 |
| 二级分类挂属性 | service 显式校验 | AppError → 400「只有三级分类才能添加属性」 | 同上 |
| 分类不存在 | service 显式校验 | AppError → 404 | 同上 |
| 属性值超长/超量 | service 边界校验 → 模型 validator 兜底 | 400 | 同上 |
| 属性值全空/全重复去空 | service 归一化后为空 | 400「属性值不能为空」 | 同上 |
| 名称超 30 字符 | 模型 maxlength | ValidationError → 400 | 同上 |
| token 失效 | auth 中间件 | AppError → 401 | 拦截器 401 分支：清 token 跳登录 |

**分工原则**（与品牌模块一致）：后端 service 判断 → 转 AppError → errorHandler 生产信封 code → 前端拦截器判断 code/HTTP status → 决定「给数据」还是「弹错误」。

## 五、验证清单

**接口层（实测已通过）：**

- [ ] `GET /api/category/tree` 返回三级嵌套树
- [ ] 新增属性 → 200；同分类同名 → 409；二级分类 → 400
- [ ] 脏数据清洗：`[' 红 ', '红', '', ' 蓝 ']` → 存为 `['红','蓝']`
- [ ] 31 字符属性值 → 400；21 个值 → 400；正常值不误伤
- [ ] `pnpm --filter backend run seed` 重跑后分类 _id 不变

**浏览器层：**

- [ ] 树默认展开，点一级/二级静默展开收起，右侧不变
- [ ] 点三级分类 → 表格加载 + 高亮 + 标题带分类名
- [ ] 未选分类：表格显示「请先在左侧选择三级分类」、添加按钮禁用
- [ ] 已选无数据分类：显示「暂无数据」
- [ ] 添加属性（tag 增删、重复值警告、回车添加）→ 列表出现
- [ ] 编辑回显、删除二次确认，行为正常

## 【风险提示】

1. **分类没有删除功能，也没有级联策略** —— 将来做分类删除时必须决策：禁止删除有属性的分类 / 级联删除 / 属性迁移。当前无任何约束，做分类 CRUD 前先定案。
2. **属性删除无引用检查** —— SPU/SKU 上线引用属性后，删除属性会造成引用断裂。标准解法是引用计数或软删除，**必须在商品模块动工前定案**。
3. **属性值边界常量两处重复** —— `30/20` 在 service 常量与模型 validator 各写一份，改动需两处同步；再出现一处就该收口成共享常量。
