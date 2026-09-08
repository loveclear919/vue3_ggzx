# 品牌管理模块实现手册（增删改查 + 图片上传）

> 本手册记录品牌管理（前端 `/product/trademark`，后端 `/api/brand`）模块的完整实现：
> 后端四层分层（model / service / controller / routes）、前端列表页状态模型、增删改交互设计、图片上传集成。
> 每个关键决策都附「为什么这么做」，作为后续商品模块（SPU/SKU/属性）的参照模板。

## 一、模块总览

| 功能 | 前端入口 | 后端接口 |
|------|----------|----------|
| 分页列表 / 关键词搜索 | 进页面 / 翻页 / 搜索 | `GET /api/brand?page&pageSize&keyword` |
| 新增品牌 | 弹窗表单 | `POST /api/brand` |
| 修改品牌 | 弹窗回显 | `PATCH /api/brand/:id` |
| 删除品牌 | 二次确认 | `DELETE /api/brand/:id` |
| 图片上传 | 弹窗内选图 | `POST /api/upload` |

涉及文件：

```
backend/src/
├── models/Brand.ts          # 品牌模型（unique 名称、maxlength 30、timestamps）
├── services/brand.ts        # 业务层：分页查询、白名单更新、11000 → 409
├── controllers/brand.ts     # 处理层：参数解析、数值转换、响应组装
├── routes/brand.ts          # 接线层：auth + 4 条 RESTful 路由
├── utils/upload.ts          # multer 上传配置（限大小、限类型、文件名随机化）
├── controllers/upload.ts    # 上传处理：返回可访问的相对路径
├── routes/upload.ts         # 上传路由（auth 保护）
└── index.ts                 # 挂载 /api/brand、/api/upload、/uploads 静态服务

vue-project/src/
├── api/product/trademark/   # 前端 API 层（type.ts 类型契约 + index.ts 请求函数）
├── api/upload/index.ts      # 上传请求函数
└── views/product/trademark/index.vue   # 页面：列表 + 分页 + 弹窗 + 上传
```

## 二、后端分层实现

### 1. 数据模型 `models/Brand.ts`

```ts
name: { type: String, required: true, unique: true, trim: true, maxlength: 30 }
logoUrl: { type: String, default: '', trim: true }
// 选项：{ timestamps: true } → 自动维护 createdAt/updatedAt
```

**为什么：**

- `unique: true` —— 数据库层保证名称唯一（唯一索引），是 409 冲突判断的基础
- `maxlength: 30` —— 长度规则写在模型，前端校验和它对齐（双重防线）
- `timestamps: true` —— 列表 `sort({ createdAt: -1 })` 依赖它；但 DTO 不对外暴露（契约最小化，前端要显示再加）

### 2. 业务层 `services/brand.ts`

**分页查询的三个关键点：**

```ts
// ① keyword 为空时不加正则条件，避免不必要的全表正则扫描
const filter: { name?: { $regex: string; $options: string } } = {}
if (keyword) {
  filter.name = { $regex: keyword, $options: 'i' }
}

// ② 防御：非法页码/页大小规范化（0、负数、超大 pageSize 都不击穿查询）
const safePage = Math.max(1, Math.floor(page))
const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)))

// ③ 列表与总数并行查询（Promise.all），互不阻塞
const [list, total] = await Promise.all([
  Brand.find(filter).sort({ createdAt: -1 }).skip((safePage - 1) * safePageSize).limit(safePageSize),
  Brand.countDocuments(filter),
])
```

**唯一键冲突（11000）→ 409 的转换：**

```ts
try {
  const brand = await Brand.create({ name, logoUrl })
  return toBrandDTO(brand)
} catch (err) {
  if (isDuplicateKeyError(err)) {
    throw AppError.conflict('品牌名称已存在')
  }
  throw err
}
```

**为什么：**

- Mongo 的重复键错误码固定是 `11000`，判断逻辑在 `utils/mongoError.ts` 收口为 `isDuplicateKeyError(err)` —— auth 注册、品牌新增、品牌改名三处复用，「11000 是什么」只有一处出处
- 注意 **updateBrand 也要捕获 11000**：把品牌名改成已存在的名字同样触发唯一索引冲突，漏处理就是 500
- 更新走字段白名单（`['name', 'logoUrl']`）：请求体里再多字段也只认这两个；长度上限交给模型的 `maxlength` + `runValidators`，校验规则不写两处

### 3. 处理层与接线层

**controller 的职责：参数解析（形状问题）→ 调 service → 组装响应**

```ts
const page = Number(req.query.page) || 1      // 数值转换 + 默认值（NaN → || 兜底）
const keyword = typeof req.query.keyword === 'string' ? req.query.keyword.trim() : undefined
```

**routes 的职责：只有声明**

```ts
router.use(auth)                              // 全部接口需登录
router.get('/', brandController.listBrands)
router.post('/', brandController.createBrand)
router.patch('/:id', brandController.updateBrand)
router.delete('/:id', brandController.deleteBrand)
```

**Express 5 的坑：** `req.params.id` 类型是 `string | string[]`（v5 支持同名参数重复），controller 里需 `Array.isArray(id)` 收窄 —— 以后每个带 `:id` 的接口都会遇到。

## 三、前端页面实现

### 1. 列表分页状态模型

核心心智模型：**`pageNo / pageSize / keyword` 是「查询状态」，翻页 = 改状态重新执行同一个查询函数。**

```ts
const fetchBrandList = async () => {
  loading.value = true
  try {
    const result = await getBrandList({ page: pageNo.value, pageSize: limit.value })
    tableData.value = result.list
    total.value = result.total
  } catch {
    // 错误提示已由拦截器统一弹出，这里只负责让 loading 收尾
  } finally {
    loading.value = false
  }
}

// 切换每页条数：回到第 1 页再查（页容量变化后原页码可能越界）
const handleSizeChange = () => {
  pageNo.value = 1
  fetchBrandList()
}
```

分页器用 `@current-change` / `@size-change` 两个事件接线；以后加搜索框时，keyword 加入同一状态模型（搜索时 `pageNo = 1`）。

**为什么不用 Pinia：** 品牌列表数据只有本页面消费，是页面私有状态。store 只收「跨页面共享 + 需持久化」的状态（token、折叠偏好等）。页面内 ref 天然随页面销毁而清理，每次进入都是新数据。

### 2. 增删改交互

**新增 / 编辑共用一个弹窗**，用 `editingId` 区分模式：

```ts
const editingId = ref<string | null>(null)   // null = 新增；有值 = 编辑
const dialogTitle = computed(() => (editingId.value ? '编辑品牌' : '新增品牌'))
```

| 细节 | 处理 |
|------|------|
| 弹窗二次打开残留校验红字 | 打开前 `clearValidate()` |
| 新增成功后新数据位置 | `pageNo = 1` 再刷新（列表按 createdAt 倒序，新数据在第 1 页） |
| 删除当前页最后一条 | `pageNo--` 回退，避免停在空白页 |
| 删除二次确认 | `ElMessageBox.confirm`，文案带品牌名；用户取消走 catch 静默退出 |
| 成功提示谁弹 | 拦截器只弹错误（后端 message 在剥壳时被丢弃），成功提示由页面 `ElMessage.success` |

**校验与后端对齐：** `name` 必填 + 最长 30（与模型 maxlength 一致），前端拦一道、后端 `runValidators` 兜一道。

**EP 类型限制：** el-table 插槽的 `scope.row` 被声明为宽泛的 `DefaultRow`，不会从 `:data` 推断回业务类型，调用处用 `scope.row as BrandInfo` 断言（Element Plus 所有项目的通用解法）。

## 四、图片上传集成

### 后端：multer 三件套安全配置

```ts
// utils/upload.ts
export const upload = multer({
  storage,                                    // 磁盘存储，文件名随机化
  limits: { fileSize: 2 * 1024 * 1024 },      // ① 大小上限 2MB
  fileFilter: (_req, file, cb) => {           // ② MIME 白名单
    if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(AppError.badRequest('仅支持 jpg/png/webp/gif 格式的图片'))
    }
  },
})

req.file = {
  fieldname: 'file',           // 表单字段名
  originalname: 'avatar.png',  // 用户原始文件名（不可信）
  encoding: '7bit',            // 编码方式
  mimetype: 'image/png',       // 文件 MIME 类型
  size: 102400,                // 文件大小（字节）—— 这里对应你配置的 limits 的校验结果
  destination: '/path/to/uploads', // 来自 storage 里的 destination 返回值
  filename: '123-abc.png',     // 来自 storage 里的 filename 返回值（cb 传的值）
  path: '/path/to/uploads/123-abc.png' // 全路径（destination + filename 拼起来的）
}
```

**为什么文件名要随机化（`时间戳-随机hex.ext`）：**

- 不信任用户原始文件名 —— 防路径穿越（`../../etc/xxx`）、防重名覆盖、防伪造扩展名
- 扩展名从原始文件名提取，但内容类型已被 MIME 白名单校验

**静态服务：** `app.use('/uploads', express.static(path.resolve('uploads')))` —— 上传接口返回**相对路径** `/uploads/xxx.png`，开发环境前端 Vite 加 `/uploads` 代理，生产环境交给 nginx / 对象存储（相对路径让两种环境都不需要改数据库里的值）。

**错误接入统一信封：** errorHandler 新增 MulterError 分支 —— `LIMIT_FILE_SIZE` 映射为「图片大小不能超过 2MB」，其余映射为「文件上传失败」，格式与其他错误完全一致。

### 前端：选图即传 + 自定义 http-request

```vue
<el-upload
  :show-file-list="false"
  :http-request="handleUpload"
  :before-upload="beforeUpload"
  accept="image/jpeg,image/png,image/webp,image/gif"
>
  <div class="logo-uploader" v-loading="uploading">
    <img v-if="form.logoUrl" :src="form.logoUrl" class="logo-preview" />
    <el-icon v-else class="logo-uploader-icon"><Plus /></el-icon>
  </div>
</el-upload>
```

```ts
// 自定义上传：走项目 axios 实例，而不是 el-upload 默认的 action 属性
const handleUpload = async (options: UploadRequestOptions) => {
  const formData = new FormData()
  formData.append('file', options.file)
  const res = await uploadFile(formData)   // 自动带 token、统一错误提示
  form.logoUrl = res.url
}
```

**为什么不用默认 `action` 属性：** 默认 action 是裸 XMLHttpRequest，绕过项目 axios 实例 —— token 要手动拼 header、错误要自己处理。用 `:http-request` 接管后，上传请求和普通接口走同一条管道（拦截器全生效）。

**双重防线：** `before-upload` 做客户端预检（类型 + 2MB），秒级反馈体验好；真正的安全边界在后端的 MIME 白名单 —— 前端校验可以被绕过，后端才是防线。

### 已知权衡：孤儿文件

选图即传的副作用：用户上传后取消弹窗，文件留在 uploads 目录无人引用。当前规模无影响；系统上线前可加「定时清理无主文件」任务或改为提交时上传。

## 五、错误处理全链路（本模块涉及的完整矩阵）

| 场景 | 后端触发点 | 转换 | 前端消费 |
|------|-----------|------|----------|
| 名称重复（新增/改名） | 唯一索引 11000 | `isDuplicateKeyError` → 409 | 拦截器 error 分支弹「品牌名称已存在」 |
| 名称超 30 字符 | 模型 maxlength | ValidationError → 400 | 同上，弹 Schema 中文提示 |
| id 格式非法 | CastError | 全局 → 400「参数格式不正确」 | 同上 |
| id 合法但查无记录 | service 显式判断 | AppError → 404「品牌不存在」 | 同上 |
| 上传非图片 / 超 2MB | multer fileFilter / limits | MulterError → 400 | 同上 |
| token 失效 | auth 中间件 | AppError → 401 | 拦截器 401 分支：清 token 跳登录 |

**分工原则：后端 service 判断 Mongo 的 code → 转 AppError → errorHandler 生产信封 code → 前端拦截器判断信封 code / HTTP status → 决定「给数据」还是「弹错误」。** 每一层只处理自己该认的那个 code。

## 六、验证清单

- [ ] 进页面自动加载第 1 页，loading 正常；翻页 / 改页大小数据正确
- [ ] 新增：名称留空被拦 → 填名提交 → 「新增成功」→ 列表第 1 页第 1 行
- [ ] 撞名：再新增同名 → 「品牌名称已存在」
- [ ] 编辑：回显正确，改名提交列表更新
- [ ] 删除：取消无动作；确认后消失；末页删空自动回退一页
- [ ] 上传：选图 → 上传成功 → 提交 → 列表显示真实图片；选 .txt 被拒
- [ ] `pnpm type-check` + `pnpm lint:oxlint`（前端）、`pnpm exec tsc --noEmit`（后端）全通过
