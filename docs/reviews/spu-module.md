# SPU 模块 · 架构复盘

> 按 `ai-roles/agent.md` 的「首席架构师 & 代码审查官」框架输出：业务全景 / 技术实现链路 / 架构决策分析 / 关键函数深度拆解 / 风险提示 / 重构建议。

## 1. 业务全景

**解决的核心问题**：在「分类 → 属性」之上建立商品标准单元（SPU）—— 一个 SPU 挂靠某个三级分类与品牌，携带图片墙、平台属性快照（如「颜色 → 红色」）和销售属性维度（如「版本 → 8G/12G/16G」）。销售属性是后续 SKU 拆分（笛卡尔积）的差异维度来源，平台属性只做描述。

**数据流向**：

```
左侧分类逐级下钻选中三级分类 → 分页查询 SPU 列表
  → 新增弹窗：品牌下拉（/brand/all）+ 平台属性行（按分类拉取，values 作候选）
    + 销售属性动态行（维度名来自 BaseSaleAttr 字典）+ 图片上传（两段式）
  → 前端行级清洗（trim/去重/边界）→ 后端四层校验 → MongoDB 落库
  → 刷新列表闭环
```

## 2. 技术实现链路（调用栈追踪）

**前端侧**（页面私有状态 + 全局字典状态，无 Pinia 持久化参与）：

1. 选中三级分类 → `getSpuList({ categoryId, page, pageSize })` → 分页表格
2. 新增弹窗打开 → 三个数据源**并行/串行**加载：品牌下拉 `getAllBrands()`、销售属性字典 `getBaseSaleAttrList()`（挂载时并行拉取）、平台属性行 `getAttrList(categoryId)`（打开弹窗时按当前分类拉取）
3. 图片上传：el-upload `:http-request` 接管 → `uploadFile` 两段式（先落盘拿 URL）→ URL 收集进 `form.imageList`，提交时随 SPU 一起入库
4. 提交前 `handleSubmit` 做行级清洗（销售属性值 trim/去重/≤30 字符/≤20 个；平台属性值 ≤200 字符），构建 payload 时剥掉前端专属字段（valueOptions）
5. 编辑模式：深拷贝快照填充 → 异步回拉分类属性做「快照 ∪ 当前分类」合并：快照行填候选、分类新增属性追加空白行、已删且空值的空壳行剔除

**后端侧**（四层流水线）：

```
routes/spu.ts           auth → 路由声明
controllers/spu.ts      形状校验：name/brandId/category3Id 类型，三个列表必须是数组
services/spu.ts         业务规则：分类三级校验 → 品牌存在校验 → normalize* 清洗收口
                        → 平台属性名 ∈ 分类属性集合 → 销售属性维度 ∈ BaseSaleAttr 字典
                        → 11000 → 409 转换
models/Spu.ts           数据兜底：name 全局唯一、子文档边界、timestamps
```

## 3. 架构决策分析

**① 数据建模：子文档（嵌入）而不是独立集合 + `_id: false`**

图片/平台属性/销售属性都是**值对象**——没有独立生命周期、只随 SPU 读写。嵌入让「读一个 SPU」一次查询完成，避免三个 join；`_id: false` 明确表达「值对象不需要独立主键」的语义。将来 SKU 上线后销售属性值需要跨 SKU 引用稳定 id 时，再升级为独立集合——升级路径清晰。

**② 快照语义：平台属性存快照，不存引用**

SPU 的 `attrList` 存 `{ attrName, attrValue }` 文本快照而非 Attr 集合的 ObjectId 引用。理由：属性管理里改名/删除属性时，已发布商品**不应变脸**（电商行业惯例：历史商品数据稳定优先于字典一致性）。代价是字典变更不会回溯到旧 SPU——这是有意为之的权衡，不是缺陷。

**③ 字典强约束（比硅谷甄选更严的一层）**

- 销售属性维度名必须 ∈ BaseSaleAttr 字典（`ensureSaleAttrNamesValid`），不允许自由文本污染维度集合
- 平台属性名必须 ∈ 该分类的 Attr 集合（`ensureAttrNamesValid`），与销售属性校验对称

两层校验都在 Service：**直调 API 无法绕过**。前端下拉只是体验优化。

**④ 属性值「候选 + 可自定义」的折中**

属性值不做枚举强约束（现实里 values 列表常不全，强约束会让运营每上新值都要先改属性管理）；改为 values 作 el-select 候选 + `allow-create` 自定义。前端 `valueOptions` 字段只存在于表单内部，提交时剥离。

**⑤ 防线对称：前端行级清洗 + 后端 normalize 收口**

前端在「输入时即拦」（warning 提示具体超限值），后端 normalize* 系列在「入库前兜底」（静默纠正）。双防线哲学与属性模块一致，但 SPU 的清洗更重——三个列表、每个都有自己的边界（10 图/20 属性/10 维度/20 值/30 字符/200 字符）。

## 4. 关键函数深度拆解

### `normalizeStringList`（`services/spu.ts`）

- **入参设计**：`(list: unknown[], maxLen: number)`——`unknown[]` 而不是 `string[]`，因为 body 是运行时不可信输入；`maxLen` 参数化让三个不同边界（30/200）复用同一管道。
- **边界处理**：只收 string/number——**明确拒绝对象**（否则 `String({})` 得到 `"[object Object]"` 入库）；trim → 去空 → Set 去重 → 逐项截断。静默纠正而非报错：清洗语义下「纠正」比「拒绝」对用户更友好。
- **返回值设计**：干净数组。**为什么在 Service 静默纠正而不报错**：前端已做行级 warning 拦截，到达这里的脏值只可能是绕过前端的请求——对恶意/脏请求，纠正后入库比 400 拒绝更符合「宽容读、严格写」的折中。
- **副作用**：无（纯函数）。

### `ensureAttrNamesValid` / `ensureSaleAttrNamesValid`（`services/spu.ts`）

- **入参设计**：`(category3Id, attrs)` 而非从 SPU 取——调用方（create/update）各有自己的分类来源（请求参数 / patch 新值 / 查库现值），传入保持函数单一职责。
- **边界处理**：空数组直接 return（平台属性/销售属性可留空是合法 SPU）；已知集合一次 `select('name')` 查全字典（数据量小，无分页必要）；**未知名称全部列出**（`unknown.join('、')`）而非只报第一个——一次提交让调用方看到全部问题。
- **返回值设计**：无返回值，非法即 throw 400。**为什么用 400 而非静默过滤**：与 `normalizeStringList` 的「纠正」策略不同——维度名错误意味着调用方对业务实体认知错误，纠正（丢弃）会产生数据缺失的假象，必须显式失败。
- **副作用**：无（只读校验）。

### `handleSubmit`（`views/product/spu/components/spu-form-dialog/index.vue`）

> 位置说明：本函数原在 `views/product/spu/index.vue`，后随弹窗拆分（`components/spu-form-dialog` + 三个编辑器组件）迁移；
> 逻辑未变，状态改为弹窗组件私有。

- **入参设计**：无入参，全部读弹窗私有 state——弹窗表单是一次事务，不需要参数化。
- **边界处理**：`formRef.validate()` 走表单规则（name/品牌必填）；随后**三段手写校验**：销售属性名去重 → 值级清洗 + 逐项边界 → 平台属性值 200 字符。手写的原因：动态数组行的规则 el-form 的 `FormRules` 表达力不足（嵌套数组的行内去重/长度），放提交前最可靠。
- **返回值设计**：无返回；成功路径副作用是关闭弹窗 + 刷新列表。**为什么提交失败不重试**：错误已由拦截器弹出，重试交给用户决定。
- **副作用**：构建 `cleanedSaleAttrList` 时剥离 `valueOptions`——保证前端专属字段永不外泄到 payload。

## 【风险提示】

1. **品牌与销售字典都缺「分类关联」** —— 品牌下拉全量展示（手机分类下能看到耐克），销售维度字典全局共用（冰箱分类能选「内存」）。真实电商是品牌-类目关联 + 类目销售规格池（淘宝/京东标准），教程未做此治理层。方案已定案：Brand 加 `categoryIds` 数组、CategorySaleAttr 关联集合、SPU 表单按分类过滤 + 后端 `ensureBrandInCategory` 校验。与分类管理 CRUD 同批实现（三件事共享「分类下钻 + 按分类拉取 + 分类校验」模式）。
2. **删除 SPU 没有 SKU 引用检查** —— SKU 模块上线后，删除有 SKU 的 SPU 会制造孤儿 SKU。必须在 SKU 动工前定案（与分类删除级联同一决策点，见 category-drilldown.md）。
3. **图片孤儿文件** —— 上传完成但取消提交/提交失败的图片，uploads 目录里永久残留（品牌模块同款问题）。标准解法：定时清理任务扫描「未被任何 SPU/Brand 引用的 URL」，当前未实现。
4. **图片数量检查的竞态窗口** —— `beforeUpload` 检查 `imageList.length >= 10`，但多图并发上传时两张图可能在 push 前先后通过检查，理论上突破 10 张。后端 `normalizeImageList` 截断兜底，前端在 `handleImageUpload` 里再查一次可关闭窗口。
5. **keyword 后端支持但前端未暴露** —— `listSpus` 的 keyword 参数是死代码路径（无搜索框）。已做 `escapeRegExp` 转义防正则注入，但功能没接上。
6. **边界常量前后端各自维护** —— 30/20/200/10 在 service、前端 script 各写一份，改边界需两处同步（与 attr 模块同类问题，已到「应收口成共享常量或由后端下发」的临界点）。
   → ✅ 已处理（后端侧收口）：后端统一从 `models/Spu.ts` 的 `SPU_LIMITS` 取（模型 validator / service 清洗 / 报错文案同源），
   前端改为镜像 `components/constants.ts` 的同名常量。**跨包共享仍未实现**，镜像是当前 monorepo 下的定案，见 `docs/handbooks/spu-module.md` §三.4。
7. **`beforeUpload` 的 MIME 检查依赖浏览器信任** —— `rawFile.type` 可被伪造，但后端 multer MIME 白名单 + 扩展名映射是真正的闸门，前端只是体验拦截（防线分工正确，无动作）。

## 如果重构，我会改进…

1. **zod Phase 2 优先覆盖本模块** —— SPU 的请求体是三个嵌套数组，形状最复杂、手写校验最长，是 zod DTO 收益最大的地方；响应侧 Phase 1 同步覆盖 `SpuInfo`（含三个子文档数组）。
2. **下钻/字典接口加短 TTL 缓存** —— `getBaseSaleAttrList`、平台属性列表每次开弹窗都查库，字典级数据适合 30s 缓存 + 写入失效。
3. **销售属性维度下拉排除已选行** —— 当前每行的维度下拉都显示全量字典，已选「颜色」后第二行还能再选「颜色」（提交时才拦）。前端过滤掉已选项是更顺的体验。
4. **把「上传但未入库」的图片标记为临时态** —— 上传接口返回 `expiresAt` 或定时任务回收未引用文件，闭环孤儿文件问题。

---

## 附：本模块的关键文件清单

```
backend/src/
├── models/Spu.ts            # SPU + 三个子文档（_id:false 值对象）、name 全局唯一、category3Id 索引
├── models/BaseSaleAttr.ts   # 基础销售属性字典（name 唯一，只读）
├── services/spu.ts          # normalize* 清洗收口 + ensure* 双层校验 + CRUD + 409 转换
├── services/baseSaleAttr.ts # 字典全量查询
├── controllers/spu.ts       # 形状校验（三个列表必须是数组等）
├── controllers/baseSaleAttr.ts
├── routes/spu.ts            # GET/POST /api/spu、PATCH/DELETE /api/spu/:id
├── routes/baseSaleAttr.ts   # GET /api/base-sale-attr
├── utils/escapeRegExp.ts    # keyword 正则转义（brand/spu 共用）
└── scripts/seed-base-sale-attr.ts  # 字典种子（幂等 upsert）

vue-project/src/
├── api/product/spu/         # SpuInfo/SpuImage/SpuAttr/SpuSaleAttr 契约 + CRUD 请求
├── api/product/baseSaleAttr/ # 字典契约 + 请求
└── views/product/spu/
    ├── index.vue            # 逐级下钻分类 + 分页列表 + 弹窗挂载与刷新
    └── components/          # 弹窗拆分（复盘写作时还在 index.vue 内）
        ├── constants.ts     # SPU_LIMITS（与后端镜像）
        ├── types.ts         # SpuAttrForm（含前端专属 valueOptions）
        ├── spu-form-dialog/ # 表单状态 + 提交清洗
        ├── image-uploader/  # 图片墙
        ├── platform-attr-editor/
        └── sale-attr-editor/
```
