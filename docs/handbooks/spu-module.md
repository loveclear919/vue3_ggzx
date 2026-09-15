# SPU 管理模块实现手册（三级分类下钻 + 复杂表单弹窗）

> 本手册记录 SPU 管理（前端 `/product/spu`，后端 `/api/spu`）模块的完整实现，
> 作为后续同类模块（**SKU 模块**）的**参照模板**。每个关键决策附「为什么这么做」。
>
> 决策复盘（方案对比、关键函数深度拆解）见 `docs/reviews/spu-module.md`；本手册记录**落地形态与边界约定**。
> 分类下钻部分与属性模块共用同一个组件与接口，见 `docs/handbooks/attr-module.md`。

## 一、模块总览

| 功能 | 前端入口 | 后端接口 |
|------|----------|----------|
| 分类逐级下钻 | 左侧共享组件 `components/category` | `GET /api/category?parentId=xxx`（不传 = 一级） |
| SPU 列表（分页 + keyword） | 选中三级分类后自动查询 | `GET /api/spu?categoryId&page&pageSize&keyword` |
| 新增 SPU | 弹窗：基本信息 / 图片墙 / 平台属性行 / 销售属性动态行 | `POST /api/spu` |
| 编辑 SPU | 同一弹窗回显 | `PATCH /api/spu/:id` |
| 删除 SPU | 二次确认 | `DELETE /api/spu/:id` |
| 品牌下拉 | 弹窗内（页面挂载时预取） | `GET /api/brand/all` |
| 销售属性维度下拉 | 弹窗内（页面挂载时预取） | `GET /api/base-sale-attr` |
| 平台属性行与候选值 | 打开弹窗时按当前分类拉取 | `GET /api/attr?categoryId=xxx` |
| 图片上传（两段式） | 图片墙，选图即上传 | `POST /api/upload`（multipart） |

涉及文件：

```
backend/src/
├── models/Spu.ts                 # SPU + 三个子文档（_id:false 值对象）+ SPU_LIMITS + name 全局唯一
├── models/BaseSaleAttr.ts        # 基础销售属性字典（name 唯一，只读，种子写入）
├── services/spu.ts               # normalize* 清洗收口 + ensure* 双层校验 + 白名单更新 + 409 转换
├── services/baseSaleAttr.ts      # 字典全量查询
├── controllers/spu.ts            # 形状校验（三个列表必须是数组等）+ 分页参数解析
├── controllers/baseSaleAttr.ts   # 字典列表
├── routes/spu.ts                 # GET/POST /api/spu、PATCH/DELETE /api/spu/:id
├── routes/baseSaleAttr.ts        # GET /api/base-sale-attr
├── utils/upload.ts               # multer 配置：MIME 白名单 / 扩展名映射 / UPLOAD_DIR
├── utils/escapeRegExp.ts         # keyword 正则转义（brand / spu 共用）
└── scripts/seed-base-sale-attr.ts # 字典种子（幂等 upsert）

vue-project/src/
├── api/product/spu/              # SpuInfo / SpuImage / SpuAttr / SpuSaleAttr 契约 + CRUD 请求
├── api/product/baseSaleAttr/     # 字典契约 + 请求
├── api/upload/                   # uploadFile：FormData → { url }
└── views/product/spu/
    ├── index.vue                 # 页面骨架：下钻 + 分页表格 + 弹窗挂载与刷新
    └── components/
        ├── constants.ts          # SPU_LIMITS：与后端 models/Spu.ts 镜像的边界常量
        ├── types.ts              # SpuAttrForm（模块内部类型：平台属性行 + 前端专属候选值）
        ├── spu-form-dialog/      # 表单状态 + 提交清洗（v-model 控制开关）
        ├── image-uploader/       # 图片墙编辑器（v-model: SpuImage[]）
        ├── platform-attr-editor/ # 平台属性行（v-model: SpuAttrForm[]）
        └── sale-attr-editor/     # 销售属性动态行（v-model: SpuSaleAttr[]）
```

## 二、后端分层实现

### 1. 数据模型

**`models/Spu.ts` —— 一个主文档 + 三个值对象子文档：**

```ts
// 本模块的数字边界总表 —— 唯一来源：模型 validator、service 的清洗/截断/文案都从这里取
export const SPU_LIMITS = {
  NAME_LENGTH: 100, DESCRIPTION_LENGTH: 500,
  MAX_IMAGE_COUNT: 10, IMAGE_NAME_LENGTH: 100,
  MAX_ATTR_COUNT: 20, ATTR_NAME_LENGTH: 30, ATTR_VALUE_LENGTH: 200,
  MAX_SALE_ATTR_COUNT: 10, SALE_ATTR_NAME_LENGTH: 30,
  MAX_SALE_ATTR_VALUES: 20, SALE_ATTR_VALUE_LENGTH: 30,
} as const

const spuImageSchema     = new Schema<ISpuImage>({ imageUrl, imageName }, { _id: false })
const spuAttrSchema      = new Schema<ISpuAttr>({ attrName, attrValue }, { _id: false })
const spuSaleAttrSchema  = new Schema<ISpuSaleAttr>({ saleAttrName, saleAttrValueList }, { _id: false })

// 数量边界：数组型字段用 validate 兜住"最多几条"（maxlength 只管字符串，管不了数组）
imageList:    { type: [spuImageSchema],    validate: { validator: (l) => l.length <= SPU_LIMITS.MAX_IMAGE_COUNT } }
attrList:     { type: [spuAttrSchema],     validate: { validator: (l) => l.length <= SPU_LIMITS.MAX_ATTR_COUNT } }
saleAttrList: { type: [spuSaleAttrSchema], validate: { validator: (l) => l.length <= SPU_LIMITS.MAX_SALE_ATTR_COUNT } }
// 销售属性值：与 Attr.values 同款防线（单个值长度 + 数量）
saleAttrValueList: { validate: { validator: (l) => l.length <= MAX_SALE_ATTR_VALUES && l.every((v) => v.length <= SALE_ATTR_VALUE_LENGTH) } }

name: { required, unique, trim, maxlength: SPU_LIMITS.NAME_LENGTH }   // 全局唯一
spuSchema.index({ category3Id: 1 })                                    // 列表主查询：按三级分类
```

**为什么：**

- **子文档（嵌入）而不是独立集合** —— 图片/属性/销售属性都是**值对象**（没有独立生命周期，只随 SPU 读写）。
  嵌入让「读一个 SPU」一次查询完成，避免三次关联；`_id: false` 明确表达「值对象不需要独立主键」的语义。
  SKU 上线后若销售属性值需要跨 SKU 稳定引用，再升级为独立集合
- **数量边界用 `validate` 而不是 `maxlength`** —— `maxlength` 只作用于字符串，数组要自己写 validator。
  这是本模块相比属性模块新增的一层：属性只有 `values` 一个数组，SPU 有三个
- **`SPU_LIMITS` 单一来源** —— 模型 validator（任何写入路径的兜底：接口、脚本、将来的迁移）、
  service 的清洗/截断/报错文案、前端 `components/constants.ts` 的镜像常量，三者同名同值。
  改边界只需改模型一处，前端那处靠命名一致保证可比对（前端无法 import 后端代码，见 §三.4）
- **模型层的数量 validator 是「不可达的兜底」** —— 接口路径上 service 会先截断，永远轮不到它报错；
  它的价值在于**绕过 service 的写入路径**（脚本 / mongosh 直写）不会破坏数据完整性
- **索引变更后必须对齐库**：`autoIndex` 只建不删，用 `pnpm --filter backend run sync:indexes`（详见属性模块手册）

### 2. 业务层

**`services/spu.ts` —— 两道防线，分工明确：**

```ts
// 防线①：normalize* —— 脏值清洗（静默纠正）
normalizeImageList(input)     // 非对象项丢弃 → imageUrl 必填 → imageName 缺省从 URL 末段派生 → 超量截断
normalizeAttrList(input)      // 同名属性只保留首次出现 → 空值行**保留**（见下）→ 超量截断
normalizeSaleAttrList(input)  // 整行全空跳过 / 缺名或缺值 **显式 400** → 同名维度去重 → 超量截断

// 防线②：ensure* —— 引用合法性（显式 400，绝不静默过滤）
ensureBrand(brandId)                                  // 品牌必须存在
ensureCategory3(category3Id)                          // 分类必须存在且 level === 3（与属性模块同规则）
ensureAttrNamesValid(category3Id, attrs)              // 平台属性名 ∈ 该分类已定义的属性
ensureSaleAttrNamesValid(saleAttrs)                   // 销售属性维度名 ∈ BaseSaleAttr 字典
```

**为什么「静默纠正」与「显式 400」的分界是这个样子**（本模块最细的一条设计）：

| 情形 | 处理 | 理由 |
|------|------|------|
| 图片/平台属性/销售属性**超量** | 截断保留前 N 条 | 前端上传器与行编辑器已限制数量，越界只可能来自脏请求；保住前 N 条比整体失败更符合「宽容兜底」 |
| 字符串脏值（trim / 空串 / 重复 / 超长） | 清洗掉 | 语义无歧义，纠正后的值与用户意图一致 |
| 平台属性**空值行** | **保留** | 这些行是按分类**预置的待填项**（用户只填其中几个是正常状态），丢弃等于删掉可填项 |
| 销售属性**整行全空** | 跳过 | 动态行的常态：用户点了「添加销售属性」还没填就是空行 |
| 销售属性**缺名或缺值**（有一半数据） | **显式 400** | 业务意图缺数据，静默丢弃会造成「保存后少了一个维度」的假象 —— 与前端提交前的提示语义对齐 |
| 维度名 / 属性名不在允许集合内 | **显式 400** | 调用方对业务实体认知错误，纠正（丢弃）会制造数据缺失的假象 |

**`updateSpu` —— 白名单更新 + 分类不可变更：**

```ts
// 只认 name / description / brandId / category3Id / imageList / attrList / saleAttrList，其余字段一律忽略

// 分类：换类目是「迁移」流程（牵动属性快照与将来的 SKU 归属），不在编辑接口里做
// 只接受原值回传（前端编辑表单会带上当前分类），不一致直接拒绝
const { category3Id } = await loadCurrent()
if (String(category3Id) !== updates.category3Id) throw AppError.badRequest('不支持修改所属分类')

// 属性名校验用「快照 ∪ 当前分类」的宽松版本：允许保留属性管理中已删除的历史快照行，拒绝凭空捏造的名字
await ensureAttrNamesValidOnUpdate(snapshot.attrList, String(snapshot.category3Id), attrList)

// 惰性取当前文档：分类比对与属性名校验都要它，只查一次库；不缓存「没查到」（直接抛 404，避免 null 二次收窄）
const loadCurrent = async (): Promise<CurrentSpu> => { ... }
```

**为什么分类不可变更能省掉一层校验**：值不允许变更 ⇒ 分类层级在创建时已校验过，
更新路径无需重复校验分类；同时堵住了「分类换了、属性快照还挂在旧分类下」的悬空属性名。
前端在编辑模式下始终回传当前分类，因此同值必须放行（边界测试有对应用例）。

### 3. 处理层与接线层

**controller 的职责：形状校验 + 参数解析，不碰业务规则：**

```ts
// 三个列表「可以不给，给了就必须是数组」（真正的清洗在 service）
if (imageList !== undefined && !Array.isArray(imageList)) throw AppError.badRequest('图片列表格式不合法')

// Express 5 的 query 类型是 string | string[] | ParsedQs | ...：数值参数要显式转，非法值回落到默认
const page = Number(req.query.page) || 1
const pageSize = Number(req.query.pageSize) || 10
// keyword 必须收窄成 string 再 trim：Express 5 默认 query parser 是 'simple'，
// ?keyword=a&keyword=b 会解析成数组，直接 .trim() 抛 TypeError → 500
const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : undefined
```

**routes 的职责：只有声明：**

```ts
router.use(auth)
router.get('/', spuController.listSpus)
router.post('/', spuController.createSpu)
router.patch('/:id', spuController.updateSpu)
router.delete('/:id', spuController.deleteSpu)
```

**分页与搜索的实现要点**（`services/spu.ts#listSpus`）：

- `keyword` 用 `escapeRegExp` 转义后作字面量正则（`$options: 'i'`）—— 用户输入 `(` 等字符时不会破坏正则语法
- `safePage / safePageSize` 二次收口（`Math.max(1, ...)`、上限 100）—— 不信任来自 URL 的数值
- **先 `ensureCategory3`** 再查列表：非法分类返回 404/400，而不是「误导性的空列表」
- 列表与总数用 `Promise.all` 并行（`find` + `countDocuments`），排序 `createdAt: -1`（新增的排在最前）

**Express 5 的坑**（品牌/属性模块手册已记录，本模块再次出现）：`req.params.id` 是 `string | string[]`，每个带 `:id` 的接口都要 `Array.isArray` 收窄。

### 4. 字典种子

`scripts/seed-base-sale-attr.ts`（`pnpm --filter backend run seed`）：
按 name 自然键 upsert 写入「颜色 / 版本 / 尺码 …」，重跑幂等、`_id` 稳定 ——
与分类种子同一策略（重建会让已被 SPU 引用的字典 id 全部换新）。

## 三、前端页面实现

### 1. 状态模型与组件拆分

**页面（`views/product/spu/index.vue`）只持有「列表 + 弹窗开关」：**

```
selectedCategory  当前三级分类（null = 未选择，此时表格显示引导文案、按钮禁用）
tableData / total / pageNo / limit / loading   列表状态（半页私有，无 Pinia）
brandOptions / saleAttrOptions                 下拉字典（挂载时并行拉取，onMounted）
dialogVisible / editingRow                     弹窗开关 + 模式（null=新增 / 有值=编辑）
```

判断标准同品牌/属性模块：**「有多个页面/组件要读吗？切换路由要保留吗？刷新要恢复吗？」都不是 → 组件内 ref 即可**。

**弹窗为什么拆成 1 + 3 个组件：**

| 文件 | 持有状态 | 为什么独立 |
|------|----------|-----------|
| `spu-form-dialog` | 整个 `form` + 提交清洗 | 表单是「一次事务」：状态、校验、提交必须在一起；`defineModel<boolean>` 只管开关，父页面不碰表单内部 |
| `image-uploader` | 无（`v-model: SpuImage[]`） | 上传是自洽的行为单元（含 beforeUpload 校验 + 两段式上传），与表单其余部分零耦合 |
| `platform-attr-editor` | 无（`v-model: SpuAttrForm[]`） | 纯展示 + 双向绑定；`valueOptions` 只在编辑器内部用 |
| `sale-attr-editor` | 无（`v-model: SpuSaleAttr[]`） | 动态行增删是独立交互；行数上限在这里拦 |

**为什么父页面用 `v-model` 而不是把 form 传下去**：子组件只认「我这份数据」，不关心数据来自新增还是编辑 ——
新增/编辑的差异（初始化方式、payload 组装、接口选择）全部收在 `spu-form-dialog` 内部，
父页面对两者一视同仁（`editingRow` 为 null 与否即模式）。

**模块内部类型放在 `components/types.ts`**：`SpuAttrForm = SpuAttr & { valueOptions: string[] }` ——
`valueOptions` 是**前端专属字段**（属性管理定义的候选值，仅用于下拉，不随 payload 提交），
用独立类型把它和 API 契约（`api/product/spu/type.ts`）隔开，提交时天然剥离。

### 2. 弹窗打开时的初始化（新增 vs 编辑）

| 模式 | 初始化 |
|------|--------|
| 新增 | `resetForm()` → 按当前分类拉平台属性行（`getAttrList`）：每行 `{ attrName, attrValue: '', valueOptions: attr.values }` |
| 编辑 | 深拷贝行数据填充（**必须深拷贝**：编辑期间的增删不得污染列表原数据）→ 异步回拉分类属性做「**快照 ∪ 当前分类**」合并 |

编辑合并的三条规则（`fillEditForm`）：

1. 保留「分类里还有该属性」或「快照里有非空值」的行 —— 其余（分类已删且没填值的空壳行）剔除
2. 快照行回填 `valueOptions` 候选
3. 分类**新增**的属性追加为空值行（新建时就有的能力，编辑时同样开放）

**为什么用 `watch(dialogVisible)` 而不是 `onMounted`**：数据要**每次打开都重建**，`onMounted` 只跑一次。
结构前提：`form` 状态放在组件 setup（弹窗槽位**之外**），`destroy-on-close` 每次关闭销毁的只是弹窗内容 DOM，
组件与状态不受影响 —— watch 负责在每次打开时重建数据；组件本身既不反复销毁（不用 `v-if`），也不保留上次的布局残留。

### 3. 提交前的清洗（`handleSubmit`）

前端在「输入时即拦」（`ElMessage.warning` 提示具体超限值），后端在「入库前兜底」（静默纠正）——
**双防线对称**，且前端的每一条规则都能在后端找到对应：

| 前端拦截（弹窗提交前） | 对应后端 |
|------------------------|----------|
| 销售属性名去重（`Set` 比较） | `normalizeSaleAttrList` 同名维度去重 |
| 销售属性「需填写名称和至少一个值」 | 缺名/缺值 → 400（同文案语义） |
| 销售属性值 ≤ `SPU_LIMITS.MAX_SALE_ATTR_VALUES` 个 | 超量截断 + 模型 validator 兜底 |
| 单个销售属性值 ≤ `SALE_ATTR_VALUE_LENGTH` 字符 | 逐项截断 |
| 平台属性值 ≤ `ATTR_VALUE_LENGTH` 字符 | 逐项截断 |
| 图片张数 ≤ `MAX_IMAGE_COUNT`（上传前拦） | `normalizeImageList` 截断 |
| 销售属性行数 ≤ `MAX_SALE_ATTR_COUNT`（添加行时拦） | 截断 + 模型 validator 兜底 |

**为什么这些校验手写在 `handleSubmit` 而不是 `el-form` 的 `rules`**：动态数组行的规则
（行内去重、逐项长度、跨行唯一）用 `FormRules` 表达力不足，放提交前最可靠；
`rules` 只承担静态字段（名称必填/长度、品牌必填）。

### 4. 边界常量镜像（`components/constants.ts`）

```ts
// 与后端 models/Spu.ts 的 SPU_LIMITS 键名完全一致、值必须相等
export const SPU_LIMITS = {
  NAME_LENGTH: 100, DESCRIPTION_LENGTH: 500, MAX_IMAGE_COUNT: 10, ATTR_VALUE_LENGTH: 200,
  MAX_SALE_ATTR_COUNT: 10, MAX_SALE_ATTR_VALUES: 20, SALE_ATTR_VALUE_LENGTH: 30,
} as const
```

**为什么是镜像而不是共享**：前后端是两个独立包（`vue-project` / `backend`），前端不能 import 后端代码，
浏览器也不该拿到服务端规则；键名一致是为了 diff 时能一眼比对。
**只镜像前端真正会拦截的项**（`IMAGE_NAME_LENGTH` / `MAX_ATTR_COUNT` / `ATTR_NAME_LENGTH` 等前端没有自由输入入口，
不重复定义）。**真正的兜底永远在后端**，前端只是提前告知。

### 5. 交互细节表

| 细节 | 处理 |
|------|------|
| 空态双语义 | 未选分类 = 「请先在左侧选择三级分类」（引导），已选无数据 = 「暂无数据」（结果说明） |
| 未选分类时「添加SPU」 | `disabled`（能力禁用），而非点击后弹提示 |
| 切分类重置分页 | `handleCategorySelect` 里 `pageNo = 1` 再查询；`handleSizeChange` 同样回到第 1 页 |
| 新增后回到第 1 页 | 列表按 `createdAt` 倒序，新增的数据在第一页；只有新增才重置页码，编辑不重置 |
| 删除后页码回退 | 本页只剩 1 条且不在第 1 页时 `pageNo--`，避免删完停在空页 |
| 弹窗挂载时机 | `v-if="selectedCategory"`：没有分类就没有表单语义（新增要分类 id、编辑列表也来自分类） |
| 弹窗销毁策略 | `destroy-on-close`：关闭即销毁弹窗内容、每次打开全新挂载 —— el-dialog 默认复用 DOM，上次布局/校验状态会残留到下次打开的过渡动画（属性模块弹窗同款修复，见属性模块手册）；表单状态在槽外，销毁不丢数据 |
| 品牌列展示 | `brandNameMap`（computed：`brandId → name`），列表接口只返回 id |
| 字典拉取失败 | `fetchOptions` 整体 try/catch：两个下拉都是必填来源，不做「半个表单可用」的部分成功；失败后表单校验会拦住提交 |
| 成功提示谁弹 | 弹窗内 `ElMessage.success`，父页面只负责关闭 + 刷新（拦截器只弹错误） |

**EP 类型限制**（品牌/属性模块手册已记录）：el-table 插槽 `scope.row` 是宽泛的 `DefaultRow`，调用处 `scope.row as SpuInfo` 断言。

## 四、专项集成：图片上传（两段式）

**后端关键点（`utils/upload.ts`）：**

| 配置 | 值 | 理由 |
|------|-----|------|
| 存储 | `multer.diskStorage` → `UPLOAD_DIR` | 目录锚定**代码位置**（`path.resolve(import.meta.dirname, '../../uploads')`）而不是 `process.cwd()`：从任何目录启动服务，落盘位置都一样 |
| 文件名 | `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}` | 随机化避免覆盖与路径穿越；**不用用户原始文件名** |
| 扩展名 | 由**已通过白名单的 MIME** 映射（`MIME_TO_EXT`） | 取原始文件名的扩展名会被伪造（`evil.html` + 图片 MIME → 借静态服务的 Content-Type 造 XSS） |
| MIME 白名单 | jpg / png / webp / gif | 唯一真正的闸门；`fileFilter` 拒绝时 `cb(AppError)` 走统一错误信封（400） |
| 大小上限 | 2MB（`limits.fileSize`） | multer 自身错误也由 errorHandler 归一成 400 |

**响应 `{ url }` 是相对路径字符串**（`/uploads/<filename>`），数据库**只存字符串不存文件** ——
上传接口与业务接口解耦：上传只管落盘，URL 由表单提交时随 SPU（或品牌 logo）一起入库。

**前端为什么自定义接管（`:http-request`）而不是用 el-upload 默认上传：**

- 默认行为要自己管 action / headers（token 注入、响应剥壳都已有统一封装，重复实现会分叉）
- 自定义后 `handleImageUpload` 走 `uploadFile`（同一个 axios 实例）→ **鉴权与错误提示自动复用拦截器**
- 两段式：先上传拿 URL → 再随表单提交。**代价是孤儿文件**（上传成功但用户取消/提交失败，文件永久留在 uploads）

**已知权衡（不掩盖）：**

- 孤儿图片文件目前无回收机制（与品牌模块同款问题）—— 标准解法是定时任务扫描「未被任何 SPU/Brand 引用的 URL」
- `beforeUpload` 的张数检查在多图并发上传时存在理论竞态窗口（两张图可能在 push 前先后通过检查），后端截断兜底
- 前端 `rawFile.type` 可被伪造，但后端 MIME 白名单 + 扩展名映射是真正的闸门（防线分工正确）

## 五、错误处理全链路（本模块完整矩阵）

| 场景 | 后端触发点 | 转换 | 前端消费 |
|------|-----------|------|----------|
| SPU 重名（新增/改名） | `name` 唯一索引 11000 | `isDuplicateKeyError` → 409 | 拦截器弹「SPU 名称已存在」 |
| 品牌不存在 | `ensureBrand` | AppError → 404 | 同上 |
| 分类不存在 / 非三级分类 | `ensureCategory3` | AppError → 404 / 400 | 同上 |
| 平台属性名不在该分类 | `ensureAttrNamesValid` | AppError → 400 | 同上 |
| 销售属性维度名不在字典 | `ensureSaleAttrNamesValid` | AppError → 400 | 同上 |
| 销售属性缺名 / 缺值 | `normalizeSaleAttrList` | AppError → 400 | 同上 |
| 更新时改动所属分类 | `updateSpu` 分类比对 | AppError → 400「不支持修改所属分类」 | 同上（正常流程不会触发 —— 编辑回传原分类） |
| 三个列表不是数组 | controller 形状校验 | AppError → 400 | 同上 |
| 更新/删除不存在的 id | service 查无 + `loadCurrent` | AppError → 404 | 同上 |
| 名称/描述超长、数组超量 | service 截断 → 模型 validator 兜底 | ValidationError → 400 | 同上 |
| 上传非图片 / 超 2MB | multer fileFilter / limits | AppError → 400 | 同上 |
| token 失效 | auth 中间件 | AppError → 401 | 拦截器 401 分支：清 token 跳登录 |

**分工原则**（与品牌/属性模块一致）：后端 service 判断 → 转 AppError → errorHandler 生产信封 code →
前端拦截器判断 code/HTTP status → 决定「给数据」还是「弹错误」。

## 六、验证清单

**接口层（`pnpm --filter backend run test:boundary` 已覆盖，44 例全绿）：**

- [ ] `GET /api/spu?categoryId=` 非法格式 → 400；缺 `categoryId` → 400
- [ ] 新增：缺 brandId → 400；品牌不存在 → 404；分类非三级 → 400
- [ ] 维度名不在字典 → 400；平台属性名不在该分类 → 400；重名 → 409
- [ ] 脏值清洗：重复值去重、超长值截断、`{bad:true}` 对象值丢弃、`attrValue` 被 trim
- [ ] 销售属性「有值无名称」/「有名无值」→ 400（不静默丢行）
- [ ] 更新携带原分类（同值）→ 200；改成其他分类 → 400
- [ ] 更新/删除不存在 id → 404
- [ ] 上传非图片 → 400；合法图片 → 200 返回 URL
- [ ] 测试数据自动清理（含上传的临时文件）

**浏览器层：**

- [ ] 未选分类：表格引导文案 + 添加按钮禁用；选中三级分类后加载列表与标题
- [ ] 新增弹窗：平台属性行按分类预置、图片可上传/删除、销售属性行可增删（超 10 行警告）
- [ ] 提交脏值（重复销售属性值、超长值）→ 前端 warning 拦下，不发起请求
- [ ] 新增成功 → 关闭弹窗 → 回到第 1 页看到新数据
- [ ] 编辑弹窗：字段回显、分类新增的属性以空行追加、分类已删且未填值的行被剔除
- [ ] 删除二次确认；本页最后一条删除后页码回退
- [ ] 未选分类/已选无数据两种空态文案正确

## 【风险提示】

1. **品牌与销售字典都缺「分类关联」** —— 品牌下拉全量展示（手机分类下能看到耐克），销售维度全局共用
   （冰箱分类能选「内存」）。方案已定案（Brand 加 `categoryIds`、CategorySaleAttr 关联集合 +
   `ensureBrandInCategory` 校验），**与分类管理 CRUD 同批实现**。详见 `docs/reviews/spu-module.md` 风险提示 1
2. **删除 SPU 没有 SKU 引用检查** —— SKU 上线后删除有 SKU 的 SPU 会制造孤儿 SKU。
   **必须在 SKU 动工前定案**（与「分类删除级联」同一决策点）
3. **图片孤儿文件** —— 上传完成但取消提交/提交失败的图片永久残留在 `backend/uploads/`
   （`uploads/` 已 gitignore，不污染仓库，但会持续占磁盘）。解法见 §四
4. **keyword 后端支持但前端未暴露** —— `listSpus` 的 keyword 参数目前没有搜索框消费（后端已做正则转义，
   接口本身是安全的）。接搜索框时前端零改动
5. **边界常量前后端各一份** —— `SPU_LIMITS` 镜像靠人工同步（键名一致，值必须相等）；
   漏改的后果是前端提示与后端拦截不一致（后端仍会拦，不会写脏数据）。要彻底消除只能引入共享包
6. **图片张数检查的理论竞态** —— `beforeUpload` 的多图并发窗口见 §四；后端截断兜底，无数据风险
