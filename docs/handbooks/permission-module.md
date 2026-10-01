# 菜单权限管理模块实现手册

> 作为后续树形资源模块（如部门树、地区树）的参照模板。覆盖权限树 CRUD、同层排序、环校验、根节点保护与 RBAC code 对账。

## 一、模块总览

### 功能 ↔ 接口对照表

| 页面操作 | 前端入口 | 后端接口 | 权限 code |
|---|---|---|---|
| 权限树列表（平铺返回，前端组树） | permission/index.vue | `GET /permission` | `/acl/menus`、`role:assign-perm`（任一） |
| 新增（行内带入父级） | permission-form-dialog | `POST /permission` | `permission:create` |
| 编辑（name/parentId） | permission-form-dialog | `PATCH /permission/:id` | `permission:update` |
| 上移/下移（同层交换） | index.vue | `PATCH /permission/:id/swap` | `permission:swap` |
| 删除 | index.vue | `DELETE /permission/:id` | `permission:delete` |

GET 多 code 的动机：角色分配抽屉也是 `GET /permission` 的消费方。

### 文件清单

| 文件 | 职责 |
|---|---|
| backend/src/models/Permission.ts | 自引用树（parentId）、code 唯一、`{parentId, sortIndex}` 复合唯一 |
| backend/src/services/permission.ts | CRUD + validateParentFor（环校验）+ swap 三步 + 根节点保护 |
| backend/src/controllers/permission.ts / routes/permission.ts | 形状校验 / requirePermission 挂载 |
| backend/scripts/seed-permissions.ts | 全量树种子（25 节点，幂等按 code upsert） |
| vue-project/src/views/acl/permission/… | 树表格页 / 表单弹窗（presetParent 模式） |
| vue-project/src/utils/listToTree.ts | 平铺 → 树（主键契约 `{ id, parentId, sortIndex }`） |

## 二、后端分层实现

### 1. Model：树与唯一索引

```ts
permissionSchema.index({ parentId: 1, sortIndex: 1 }, { unique: true })
```

- **code 唯一**：RBAC 对账的稳定身份，创建后不可改（前端路由/指令按它匹配，改了会全面失联）；
- **复合唯一索引的双重身份**：既是查询加速，也是**并发下 sortIndex 冲突的数据库级兜底**（11000 → 409）；
- 根节点 code `/`（vue-router 根路径语义）：不是权限值，聚合剔除；服务端不可改/删（403）。

### 2. 环校验：validateParentFor（create/update 共用）

校验链顺序：button 不能做顶级 → parentId 格式 → 不能是自己 → 父级存在 → 层级规则（menu 挂 menu、button 只挂 menu）→ **环校验**（沿 parentId 上溯遇自己 → 拒绝）。

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

改/删 code `/` → 403；角色侧 updateRole 对根 id 静默剔除（R5：EP disabled 节点仍返回勾选值，抛 400 会让存量角色永久保存失败）。

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
- code 仅新增可填、编辑只回显（code 是稳定身份，创建后不可改）。

### 3. 分配抽屉（角色侧复用本接口）

见 role-module.md §三.2：只存 checked、根节点禁用、空树守卫。

## 四、专项集成：RBAC code 对账

权限树里的 code 与三方对同一个字符串：

| 消费方 | code 风格 | 例子 |
|---|---|---|
| 前端路由 meta.code（菜单过滤/守卫） | 路径式 | `/acl/users` |
| v-permission 指令绑定值 | 冒号式 | `user:delete` |
| 后端 requirePermission 参数 | 两者都有 | GET 挂路径、写挂冒号 |

**为什么两种风格并存**：菜单对账路由路径最直观；操作码表达动作语义。读接口挂「页 code」（能进页即能看），写接口挂「操作 code」（与按钮一一对账）——API 权限 ≠ 数据权限，数据级裁剪未来在 service 层做，不往中间件塞。

## 五、错误处理全链路

| 场景 | 后端触发点 | 转换 | 前端消费 |
|---|---|---|---|
| code 重名 | 唯一索引 11000 | 409「权限标识 code 已存在」 | 拦截器弹文案 |
| sortIndex 冲突（并发/显式传值） | 复合唯一索引 11000 | 409「排序号冲突，请重试」 | 同上（刷新重试） |
| 按钮挂顶级 / 菜单挂按钮 | validateParentFor 层级规则 | 400 | 同上 |
| 父级是自己/自己的后代 | 环校验 | 400 | 同上 |
| 删除有子级 / 被角色引用 | exists / countDocuments | 409 | 同上 |
| 改/删根节点 | code === '/' 特判 | 403 | 同上 |
| 交换不同层节点 | swap 前置检查 | 400 | 同上 |

## 六、验证清单

- [ ] 权限树 CRUD + 环校验 + swap 边界测试（158 例含 RBAC 矩阵）
- [ ] 改名不动 sortIndex（同名父级 PATCH 不重排）
- [ ] 跨父移动 → 自动排目标父级末尾
- [ ] 上下移连续操作后顺序正确、刷新后持久
- [ ] 根节点改/删 → 403；分配抽屉根节点勾选框禁用
- [ ] 只勾按钮的角色登录后 codes 含菜单链（祖先补全）
- [ ] `pnpm run type-check`（src + scripts 双配置）
