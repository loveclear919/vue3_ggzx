# 菜单权限管理模块实现手册

> 作为后续树形资源模块（如部门树、地区树）的参照模板。覆盖权限树 CRUD、同层排序、环校验、根节点保护与 RBAC perms 对账。
> **v2 更新（2026-10，动态路由改造）**：code 拆分为 perms/path/component/icon/hidden（若依对齐），perms/path 全字段可编辑，根节点改结构键 parentId: null；路由表由后端下发、前端 addRoute 注册。

## 一、模块总览

### 功能 ↔ 接口对照表

| 页面操作 | 前端入口 | 后端接口 | 权限 perms |
|---|---|---|---|
| 权限树列表（平铺返回，前端组树） | permission/index.vue | `GET /permission` | `permission:list`、`role:assign-perm`（任一） |
| 新增（行内带入父级） | permission-form-dialog | `POST /permission` | `permission:create` |
| 编辑（全字段：perms/path/component/icon/hidden/name/parentId） | permission-form-dialog | `PATCH /permission/:id` | `permission:update` |
| 上移/下移（同层交换） | index.vue | `PATCH /permission/:id/swap` | `permission:swap` |
| 删除 | index.vue | `DELETE /permission/:id` | `permission:delete` |

GET 多 code 的动机：角色分配抽屉也是 `GET /permission` 的消费方。

### 文件清单

| 文件 | 职责 |
|---|---|
| backend/src/models/Permission.ts | 自引用树（parentId）、perms 部分唯一（partial index `$gt: ''`）、`{parentId, sortIndex}` 复合唯一、path/component/icon/hidden 路由元数据 |
| backend/src/services/permission.ts | CRUD（perms/path 全字段可编辑）+ validateParentFor（环校验 + 业务节点必挂父级）+ swap 三步 + 根节点保护 |
| backend/src/controllers/permission.ts / routes/permission.ts | 形状校验 / requirePermission 挂载 |
| backend/scripts/seed-permissions.ts | 全量树种子（根 + 36 节点，幂等按 path/perms upsert，含 v1→v2 原位迁移通道） |
| vue-project/src/views/acl/permission/… | 树表格页 / 表单弹窗（presetParent 模式） |
| vue-project/src/utils/listToTree.ts | 平铺 → 树（主键契约 `{ id, parentId, sortIndex }`） |

## 二、后端分层实现

### 1. Model：树与唯一索引

```ts
permissionSchema.index({ parentId: 1, sortIndex: 1 }, { unique: true })
// 非空才唯一的部分索引：根/分组 perms 为 ''（多个空串合法）
permissionSchema.index({ perms: 1 }, { unique: true, partialFilterExpression: { perms: { $gt: '' } } })
```

- **perms 非空唯一 + 全字段可编辑**：`$gt: ''` 等价"非空"（MongoDB 部分索引不支持 `$ne`）；perms/path 创建后可改（若依式，纠错直接改——改错改对是纯收益，改对改错是操作者风险，契约失配是显性错误）；
- **path**（menu 必填，`/` 开头）、**component**（叶子填、分组留空）、**icon**、**hidden**（不渲染菜单但可直达，SKU 语义）；
- **复合唯一索引的双重身份**：既是查询加速，也是**并发下 sortIndex 冲突的数据库级兜底**（11000 → 409）；
- 根节点 = **parentId: null**（全树唯一结构键）：不是权限值，聚合跳过；服务端不可改/删（403）；业务节点一律挂父级（顶级菜单挂根节点）。

### 2. 环校验：validateParentFor（create/update 共用）

校验链顺序：**业务节点必挂父级**（v2：根节点 parentId null 是全树唯一结构键，顶级菜单挂根节点）→ parentId 格式 → 不能是自己 → 父级存在 → 层级规则（menu 挂 menu、button 只挂 menu）→ **环校验**（沿 parentId 上溯遇自己 → 拒绝）。

**为什么放在共享函数**：create 与 update 是两条入口同一套规则，抽离后不会只修一边（曾在 update 缺失环校验时被移动成环）。

### 3. sortIndex 的两种语义（面试常问）

| 场景 | 语义 | 谁写 |
|---|---|---|
| SKU 组合 | 生成时枚举序 | 系统写，不可改 |
| 权限树 | 人工维护展示序 | 可换（上下移） |

- **创建**：未传时「同级 max+1」排末尾；显式传值须非负整数；
- **跨父移动重排**：原 sortIndex 是「旧父级下的序号」，直接带过去撞唯一索引 → 非显式传值时重排到目标父级末尾；
- **同父改名不动序**：只在前端传的 parentId 与现状**不同**时才重排——否则「只改名称」也会被静默踢到末尾（曾为真 bug）；
- **swap 三步无事务**：`a → 临时值（同级 max+1，崩溃残留也是合法位置）→ b 占 a 位 → a 占 b 位`；并发窗口由唯一索引兜底（11000 → 409 乐观写入）。

### 4. 根节点保护

改/删 `parentId: null` 节点 → 403；角色侧 updateRole 对根 id 静默剔除（R5：EP disabled 节点仍返回勾选值，抛 400 会让存量角色永久保存失败）；seed-admin 洗存量与 audit-data 体检都按此结构键定位根。

### 5. 踩过的坑

- `String(null)` 是 `'null'`：parentId null 判断必须 `permission.parentId ? String(...) : null`（曾把 null 组树成孤儿）；
- `Model.findById` 与 `Permission` 模型对象混淆（import 错对象直接运行期炸）；
- `AppError.badRequest(...)` 忘 throw（return 会把错误对象当 200 数据返回）；
- 种子里同父级多节点不能裸 upsert（默认 sortIndex 0 撞复合唯一索引）——创建时按同级 max+1。

## 三、前端实现

### 1. 树表格（permission/index.vue）

- 后端返回**平铺数组**，前端 `listToTree` 组树——树的形状是派生数据，后端只管父子关系；
- 懒展开（不用 default-expand-all，否则刷新全展开）；
- **上移/下移邻居预计算**：computed 出两张 `Map<id, 邻居id>`（父级分组 + 排序 + 前后驱遍历），模板 `:disabled` 查 Map——曾逐行调 findSibling 是 O(n²)，且每次重渲染都重算；
- 行内「新增」：menu 行才显示（button 不能有子级），带入当前行为父级预设。

### 2. 表单弹窗（presetParent 模式）

- 新增：父级只读展示（行内按钮带入）；编辑：el-tree-select 可移动（button、自己及后代 disabled——环校验的前端预演）；
- 清空父级归一化：el-tree-select 清空给 undefined，JSON 序列化会丢字段 → `parentId: form.value.parentId ?? null`；
- **perms 可编辑**（v2 若依式：纠错直接改，按钮必填/分组可空）；type==='menu' 时显示路由地址（必填）/组件路径/图标名/隐藏菜单开关，button 类型不显示（后端拒绝非空值）；
- 校验规则为 computed（依赖 form.type）：按钮必填 perms、菜单必填 path，正则与后端 cleanRouteMeta 同口径。

### 3. 分配抽屉（角色侧复用本接口）

见 role-module.md §三.2：只存 checked、根节点禁用、空树守卫。

## 四、专项集成：RBAC perms 对账与动态路由（v2）

**perms 与三方对同一个字符串**（v2 起菜单 path 与权限标识分离）：

| 消费方 | perms 风格 | 例子 |
|---|---|---|
| 后端 requirePermission 参数 | 页面挂 `xxx:list`、操作挂 `xxx:create` | `spu:list` / `user:delete` |
| v-permission 指令绑定值 | 冒号式 | `user:delete` |
| 动态路由注册 | 路由树由后端下发（path/component 驱动），不经 perms | — |

**动态路由链路**：登录/getInfo 响应带 `perms + routes` → 前端 `dynamicRoutes.ts`（glob 组件映射 + 直映射）→ `addRoute('layout', r)`；静态壳（/login、/home、/screen、/404、layout、catch-all）前端承载。/home /screen 权限节点留树不进路由表（perms 照常聚合供判权/指令消费）。

**为什么 path 与 perms 分离**（v1 合并的教训）：路径是 URL 契约、perms 是判权契约——重构组件路径/换 URL 互不影响；按钮没有 path，perms 是全类型统一标识；接口对账挂 perms 而非文件路径。

## 五、错误处理全链路

| 场景 | 后端触发点 | 转换 | 前端消费 |
|---|---|---|---|
| perms 重名（非空） | 部分唯一索引 11000 | 409「权限标识已存在」 | 拦截器弹文案 |
| sortIndex 冲突（并发/显式传值） | 复合唯一索引 11000 | 409「排序号冲突，请重试」 | 同上（刷新重试） |
| 缺父级 / 按钮挂顶级 / 菜单挂按钮 | validateParentFor | 400 | 同上 |
| 父级是自己/自己的后代 | 环校验 | 400 | 同上 |
| 删除有子级 / 被角色引用 | exists / countDocuments | 409 | 同上 |
| 改/删根节点 | parentId === null 特判 | 403 | 同上 |
| 交换不同层节点 | swap 前置检查 | 400 | 同上 |
| 交换畸形 id | isValidObjectId 前置检查 | 404 | 同上 |

## 六、验证清单

- [ ] 权限树 CRUD + 环校验 + swap 边界测试（168 例含 RBAC 矩阵与 v2 契约）
- [ ] 改名不动 sortIndex（同名父级 PATCH 不重排）
- [ ] 跨父移动 → 自动排目标父级末尾
- [ ] 上下移连续操作后顺序正确、刷新后持久
- [ ] 根节点改/删 → 403；分配抽屉根节点勾选框禁用
- [ ] 只勾按钮的角色登录后 perms 含菜单链、routes 含祖先分组（祖先补全）
- [ ] 编辑 perms/path 保存后列表同步；perms 撞已有值 → 409
- [ ] 重跑 seed:permissions 幂等（迁移 0/新建 0/同步 N）且恢复基线
- [ ] 改权限 → 重登后动态路由/菜单收敛；403 自愈踢回落地页
- [ ] `pnpm run type-check`（src + scripts 双配置）
