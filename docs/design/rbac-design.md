# RBAC 权限闭环设计方案

> 状态：**v1 已全部落地**（v1.3，M1~M4，158 例边界测试全绿）；**v2 动态路由改造已落地**（2026-10，边界测试 168/168，见 §8）。§3~§7 为 v1 历史定案（已按 v2 修订的细节以 §8 为准）。本文自包含，不依赖记忆文件。

## 1. 目标与闭环

四层防线，各司其职：

```
① 后端 requirePermission(code) → 403   ← 安全边界（唯一真防线）
② 前端路由守卫：meta.code ∉ codes → 404 ← 体验层（防手输 URL 进无权限页）
③ 菜单过滤：静态路由 ∩ codes           ← 体验层（看不到就别点）
④ v-permission 指令                    ← 体验层（按钮级显隐）
```

**核心机制 = code 对账**：权限树里的 code 与「前端 meta.code / 指令绑定值 / 中间件参数」三方对同一个字符串。改权限 = 改角色勾选，处处即时生效。

## 2. 现状盘点（已核实）

| 项 | 现状 |
|---|---|
| 静态路由 | [routes.ts](../../vue-project/src/router/routes.ts) `meta: { title, icon, hidden }`，**无 code** |
| permission store | 静态直出 menuRoutes，无过滤 |
| 登录响应 | `{ token, user }`，toUserDTO 带 **buttons/routes 死字段**（前端零消费） |
| 后端 | `AppError.forbidden` 存在但 0 调用；acl 三组路由只有 `auth`（登录即可任意管理操作） |
| 种子 | seed-permissions 只有根节点 code `/`；seed-admin 管理员挂 `admin` 角色 |
| 403 前端 | request.ts 通用分支弹后端文案即可，无需改动 |

**遗留清单（原 backlog ①~⑧ 全量收录）**：① 超管授予/撤销控制；② 持超管用户不可改角色/删除；③ 内置角色不可改名/删除；④ 种子管理员挂 super_admin；⑤ 边界测试补 403/400 用例；⑥ 权限根节点 code `/` 保护（抽屉禁用 + 服务端防改删 + 聚合忽略）；⑦ **聚合期祖先补全**（Role.permissions 只存 getCheckedKeys，半选父级不入库——修法在聚合侧沿 parentId 上溯，存储与回显语义不动）；⑧ 动工序（requirePermission 第一优先）、buttons/routes 死字段清理、前端不认角色名、手册回填（user-module 两处失真待 RBAC 完成后回填）。

## 3. code 体系定案

两种风格并存（主流做法）：

| 语义 | 风格 | 例子 | 消费方 |
|---|---|---|---|
| 菜单 | 路径式（= 路由 meta.code） | `/acl/users`、`/product/spu` | 菜单过滤 + 守卫 + GET 接口 |
| 按钮/操作 | 冒号式 | `user:delete`、`permission:swap` | v-permission + 写接口 |
| 特权专用 | 冒号式 | `role:grant-super` | 仅 super_admin 持有，特判四向 |

根节点 code `/` **不是权限值**：聚合时忽略（连同所有无 code 节点）。

### 3.1 菜单 code 全表（对齐 routes.ts）

`/home`、`/screen`、`/acl`、`/acl/users`、`/acl/roles`、`/acl/menus`、`/product`、`/product/trademark`、`/product/attr`、`/product/spu`、`/product/spu/sku`

### 3.2 按钮 code 全表

**acl 三页**：`user:create` `user:update` `user:delete` `user:assign-role` · `role:create` `role:update` `role:delete` `role:assign-perm` · `permission:create` `permission:update` `permission:delete` `permission:swap` · `role:grant-super`

**商品页（2026-09-30 铺开）**：`brand:create` `brand:update` `brand:delete` · `attr:create` `attr:update` `attr:delete` · `spu:create` `spu:update` `spu:delete` · `sku:generate` `sku:update` `sku:clear`

## 4. 后端设计

### 4.1 聚合函数（RBAC 心脏）

新文件 `backend/src/services/rbac.ts`：

```ts
export async function getPermissionCodesForUser(userId: string): Promise<Set<string>>
```

链路（共 3 次查询）：
1. `User.findById(userId).select('roles')`
2. `Role.find({ _id: { $in: roles } }).select('permissions')` → 展开 permission ids
3. **`Permission.find().select('code parentId')` 一次全取**，建内存 Map —— 关键：Role.permissions 只存 checked 叶子，**半选父级不在库里**，按已存 id 过滤再上溯是查不到父级的，必须全表取后在内存 Map 上沿 parentId 上溯（backlog ⑦ 祖先补全）

补全后：剔除无 code 节点与 code `/`（backlog ⑥），返回 `Set<string>`。

**数据形态约定**：后端内部全程 `Set`；只在 DTO 边界 `[...codes]` 转数组。前端接收数组，过滤/判定时转 `Set`（`JSON.stringify(Set)` 会得到 `{}`，禁止直接序列化）。

**为什么查库不内嵌 JWT**：改角色权限立即生效，不用重登。3 次索引查询对 resume 量级无压力；演进路径（Redis 缓存 / JWT 内嵌 + 版本号）在 §7。

### 4.2 requirePermission 中间件

新文件 `backend/src/middlewares/requirePermission.ts`（`AppError.forbidden` 的第一次调用）：

```ts
export function requirePermission(...codes: string[]) {
  return async (req: AuthRequest, _res, next) => {
    const userCodes = await getPermissionCodesForUser(req.userId!)
    req.permissionCodes = userCodes // 挂 req 供 controller 透传给 service，service 不读 req
    if (codes.some((c) => userCodes.has(c))) return next()
    throw AppError.forbidden('没有操作权限')
  }
}
```

- `AuthRequest` 扩展 `permissionCodes?: Set<string>`
- Express 5 对 async 中间件的 rejection 自动进 errorHandler（现有机制）
- **任一满足即放行**（`some`）——多 code 场景的基座

**service 不读 req（R11）**：特权特判一律走显式参数 `{ operatorCodes?: Set<string> }`，controller 把 `req.permissionCodes` 传入。`undefined` 一律按「无特权」fail-closed——不隐式依赖「路由挂过中间件」。

### 4.3 路由挂载表（接口 → code → 消费方）

| 路由组 | 接口 | 挂载 code（任一满足） | 消费方 |
|---|---|---|---|
| user.ts | GET `/` | `/acl/users` | 用户列表页 |
| | POST | `user:create` | 新增按钮 |
| | PATCH `/:id` | `user:update`；roles 变更另判 `user:assign-role`（§4.4） | 编辑弹窗 |
| | DELETE `/:id` | `user:delete` | 删除按钮 |
| | `/info` `/password` | 仅 auth | 本人资料 |
| role.ts | GET `/` | `/acl/roles`、`/acl/users`、`user:assign-role` | 角色页 + 用户页角色标签/分配选项 |
| | POST | `role:create` | 新增按钮 |
| | PATCH `/:id` | `role:update`；permissions 变更另判 `role:assign-perm`（§4.4） | 编辑弹窗 + 分配抽屉 |
| | DELETE `/:id` | `role:delete` | 删除按钮 |
| permission.ts | GET `/` | `/acl/menus`、`role:assign-perm` | 菜单管理页 + 角色分配抽屉 |
| | POST | `permission:create` | 新增 |
| | PATCH `/:id` | `permission:update` | 编辑 |
| | PATCH `/:id/swap` | `permission:swap` | 上下移 |
| | DELETE `/:id` | `permission:delete` | 删除 |

多 code 的动机（R2）：GET /permission 的消费者有两个（菜单管理页、角色分配抽屉）、GET /role 的消费者有三个（角色页、用户页标签、用户页分配选项）——按「页面 code」单挂会切断跨页依赖。

商品接口挂载随第二阶段按钮 code 一起铺。

### 4.4 特权保护（R3/R4 修订版）

**收敛原则：全部归到 `role:grant-super` 一个 code，不引入角色名判断，不递归。**

支撑：Role model 加 `builtin: boolean`（default false）——「内置角色」是模型事实而非名字约定。Role DTO 输出 `builtin`。种子 `super_admin` 的 `builtin: true`。

| # | 方向 | 规则 | 实现位置 |
|---|---|---|---|
| 1 | 授予/撤销 | patch.roles 存在时操作者须持 `user:assign-role`；**涉及 builtin 角色 id** 时须另持 `role:grant-super`，否则 403 | userService.updateUser（显式 operatorCodes 参数） |
| 2 | 修改 | 同 #1（改角色 = 授予/撤销集合） | updateUser |
| 3 | 删除 | 目标用户持 builtin 角色 → 操作者须持 `role:grant-super`，否则 403（「不能删自己」保留） | userService.deleteUser |
| 4 | 内置角色自保 | `role.builtin`：不可改名、不可删除（硬 403）；permissions 修改须持 `role:assign-perm` + `role:grant-super` 双 code | roleService.updateRole / deleteRole |
| 5 | 最后一名超管 | 目标用户的聚合 codes 含 `role:grant-super` 且全系统持有者数量 === 1 → 改 roles 时**只拦「新角色集合不再产出 grant-super」的变更**（保留 super 的同时追加普通角色 = 安全操作，放行）；删除一律拦（删除必失去 grant-super），403 防全系统锁死（R4） | userService（改/删前置检查） |
| 6 | 提权闭环 | patch.permissions 含 `role:grant-super` 权限 id（按 code 查 id 比对）→ 操作者自身须持 `role:grant-super`，否则 403（R3-③，堵住「普通角色被勾上超管权限」） | roleService.updateRole |

防自我锁死补充：builtin 角色的 permissions 修改**不允许移除 `role:grant-super`**（updateRole 特判，一行），与 #5 双保险。

### 4.5 根节点保护（backlog ⑥，R5 修订版）

- `updatePermission` / `deletePermission`：目标 code === `/` → 403「系统根节点不可修改/删除」
- `updateRole` 的 validatePermissionIds：**根节点 id 静默剔除，不报错**——存量角色可能已勾过根（EP 的 getCheckedKeys 对 disabled 节点照常返回勾选值），抛 400 会让这些角色永久保存失败。配一次性洗库：`Role.updateMany({}, { $pull: { permissions: 根节点_id } })`
- 聚合忽略根节点（4.1 已含）
- 前端抽屉对根节点禁用勾选（5.7），与后端剔除双保险

### 4.6 死字段清理（backlog ⑧）

删除 `User.buttons/routes`：model 定义、toUserDTO、前端 `api/user/type.ts`。替换为登录响应携带 `codes: string[]`：

- `auth.login` / `register` / `GET /user/info` 响应：`{ token, user: { ...toUserDTO, codes } }`（内部调 rbac 聚合，DTO 边界 `[...codes]`）
- 前端 `UserInfo` 类型加 `codes: string[]`

### 4.7 种子改造

**seed-permissions.ts 扩为全量**（幂等按 code upsert，含 parentId 链）：
- 菜单树：3.1 全表（根 `/` 已有）
- 按钮：3.2 全表挂在对应菜单下
- **sortIndex 显式分配**（R6）：同父级下按顺序递增（1, 2, 3…），复用「同级 max+1」口径——默认 0 会让 23 节点撞 `{parentId, sortIndex}` 唯一索引 11000
- **幂等同步的 sortIndex 口径**：同层重跑不动 sortIndex（尊重管理页手动排序）；节点被管理页**跨父移动**过时，恢复父级必须同步重排到目标父级末尾（原 sortIndex 属旧父级，带回必撞唯一索引——与 updatePermission 跨父重排同口径，2026-09-30 端到端验证）
- 种入节点放开可改可删（无额外保护）——超管玩坏了重跑种子即恢复

**seed-admin.ts**（backlog ④，R12 修订版）：
- 管理员**改挂** super_admin：`$set: { roles: [superAdminId] }`（`$addToSet` 会与旧 admin 角色并存）
- `super_admin` 角色：`builtin: true` + permissions = 全量权限 id；`admin` 挂除 `role:grant-super` 外全量；`user` 挂 `/home` + `/screen`

**防静默失效（R13）**：M2 验收显式「重跑种子」；后端启动时断言 builtin 角色存在（`console.warn` 提示跑种子），不阻断启动。

### 4.8 边界测试（backlog ⑤）

在 boundary-test.ts 追加（沿用 `boundary_` 前缀 + 清理）：
- 无权限用户 GET/POST acl 接口 → 403
- 普通用户改/删持超管用户 → 403；超管操作 → 200
- 改/删 builtin 角色 → 403；超管改其 permissions（含移除 grant-super 的尝试）→ 403
- 改/删根节点 → 403；updateRole 传根 id → **被静默剔除后 200**（断言库内无根 id）
- 提权闭环：普通角色勾 grant-super → 403
- 最后一名超管改自己 roles → 403
- 登录/fetchUserInfo 断言 codes 含祖先补全结果（勾了按钮的角色，codes 必含菜单）

## 5. 前端设计

### 5.1 routes.ts：meta 补 code

3.1 菜单全表逐条补 `meta.code`（含 hidden 的 `/product/spu/sku`——不渲染但要守卫拦截）。

### 5.2 user store（R8/R10 修订版）

- `UserInfo.codes` 入内存 store，登录/拉取时写入
- **buildMenuRoutes 触发点收进 store 内**：`login()` 与 `fetchUserInfo()` 成功尾部各调一次 `permissionStore.buildMenuRoutes(codes)`（登录不走守卫的 fetch 分支，只挂守卫会首屏空菜单）；`logout()` 清空 permission store
- codes 以数组形态存（API 返回值），判权处转 `Set`（§4.1 约定）

### 5.3 permission store 改造

```ts
function buildMenuRoutes(codes: string[]): RouteRecordRaw[] // 递归过滤 staticMenuRoutes
```

过滤规则：`meta.code ∈ Set(codes)` 才保留；**分组父级在子级全被过滤时整组剔除**（否则 `children: []` 会被菜单组件渲染成可点击叶子，点击 redirect 到无权限子级 → 404）；父级无 code 但有存活子级则保留父（本表父级都有 code，此分支防御性保留）。

### 5.4 守卫（R7/R15 修订版）

authGuard 追加：
1. fetchUserInfo 成功后 → `permissionStore.buildMenuRoutes(codes)`（5.2 已收口，此点仅兜底）
2. 导航检查：**以 userInfo 存在为前提**，`to.meta.code` 存在且 `∉ codes` → `/404`。userInfo 拉取失败（网络类）时**跳过判权**——与既有「只有 401 才踢人」的定案一致，fail-open
3. lastVisited 回退防越权（R15）：登录跳转与 lastVisited 恢复两处，目标 `meta.code` 不在 codes 时**回退到第一个有 code 且可达的菜单路由**（不硬编码 /home），全没有才 `/404`

**不引入 addRoute 动态注册**——权衡见 §7。

### 5.5 v-permission 指令（R9 修订版）

新文件 `src/directives/permission.ts` + main.ts 注册：

```ts
app.directive('permission', {
  mounted: toggle, updated: toggle,
})
// toggle：codes 含 binding.value ? (el.style.display = '') : (el.style.display = 'none')
```

- 用 **display 切换而非 removeChild**：removeChild 不可逆且破坏 Vue 的 vnode 对账（重渲染时更新已脱离 DOM 的节点）
- `updated` 钩子兜住 codes 变化后的状态同步
- 第一阶段挂载：acl 三页全部操作按钮，与 3.2 一一对应

### 5.6 roleTagType 不认角色名（backlog ⑧）

[user/index.vue:60](../../vue-project/src/views/acl/user/index.vue#L60) 改判 `option.builtin`（Role DTO 已输出），删除 `roleName === 'super_admin'` 字符串比对。

### 5.7 分配抽屉根节点禁用

permission-drawer 的 el-tree：props 加 `disabled` 函数（`data.code === '/'` → true）。注意 EP 语义：disabled 节点**已勾选状态会被 getCheckedKeys 照常返回**，故后端 4.5 的静默剔除不可省。

## 6. 里程碑（每阶段独立可验证）

| 阶段 | 内容 | 验证 | 状态 |
|---|---|---|---|
| M1 后端聚合与中间件 | rbac.ts、requirePermission、路由挂载（4.3 全表）、登录/`/user/info` 带 codes、死字段清理、显式 operatorCodes | 边界测试聚合用例 + tsc | ✅ |
| M2 种子与特权 | 全量权限种子（显式 sortIndex）、builtin 字段、super_admin 改挂全权、§4.4 六条保护、根节点保护 + $pull 洗存量、启动 warn 断言 | **重跑种子** + 边界测试 403/400 全绿 | ✅ |
| M3 前端闭环 | meta.code、store 收口（R8）、守卫（R7/R15）、v-permission（R9）、roleTagType、抽屉禁用 | 手工：造两个角色对比登录效果、lastVisited 回退 | ✅ |
| M4 收尾 | 商品页按钮 code（12 个）、手册回填（user-module 两处失真 + role/permission 模块手册）、数据体检脚本、README | 全量回归 158 例 + `pnpm check` + `audit:data` | ✅ |

## 7. 权衡记录（面试可讲）

1. **codes 查库 vs JWT 内嵌**：查库 = 实时（改权即生效）；内嵌 = 少查询但改权重登。选实时，演进路径留 Redis
2. **前端不 addRoute**：菜单过滤 + 守卫 + 指令是体验层；安全边界只在后端 requirePermission
3. **越权页跳 404 而非 403**（R14）：信息隐藏惯例——403 等于向用户承认「此页存在但你无权」；404 不暴露资源存在性。API 层照常 403（机器间不需要隐藏）
4. **种入权限放开可编辑**：幂等种子可恢复，不额外造「系统节点」保护概念（根节点除外）
5. **两种 code 风格并存**：菜单路径式（与路由对账直观）、操作冒号式（层级语义清晰），是主流项目惯例
6. **守卫 fail-open**：前端只是体验层，网络抖动时宁可放行（后端会兜），不误伤登录态——与 guards.ts 既有定案一致

## 8. v2 动态路由改造（对齐若依，2026-10）

### 8.1 权限模型：code 拆分

v1 的 `code` 字段（菜单路径式 + 按钮冒号式混合）拆为若依式多字段：

| 字段 | 语义 | 占位 |
|---|---|---|
| `perms` | 权限标识（判权/指令契约）：页面 `user:list`、按钮 `user:create`；分组/根节点为 '' | 非空值唯一（**partial index `$gt: ''`**——MongoDB 部分索引不支持 `$ne`） |
| `path` | menu 专用路由地址（绝对路径 `/acl/users`） | 按钮/根节点 '' |
| `component` | menu 叶子组件路径（`acl/user/index`） | 分组/按钮 '' |
| `icon` / `hidden` | 图标名 / 不渲染菜单但可直达（SKU） | 按钮缺省 |

- 根节点 = 结构键 **`parentId: null`**（全树唯一，不再用 code '/'）
- **perms/path 全字段可编辑**（若依式，纠错直接改，code 输错问题消失）
- 业务节点必须挂父级（顶级菜单挂根节点），`validateParentFor` 拒绝空父级
- 按钮 perms 与 v1 完全一致（`brand:create` 本就是若依风格）——按钮链路零迁移

### 8.2 后端契约

- `getUserRbac(userId)`：一次聚合产出 `{ perms: Set, routes: MenuRouteNode[] }`——祖先补全同趟收集按钮标识与授权菜单 id；路由树 = `{ path, title, icon, hidden, component, children }`，**排除静态页 /home /screen**、空分组剪枝（自底向上单趟达不动点）、防环挂载
- 登录/注册/getInfo 响应：`user: { ..., perms: string[], routes: 树 }`（v1 的 codes 退役）
- 接口挂载：页面级 GET 挂菜单 perms（`spu:list` 等），操作级挂按钮 perms（不变）；中间件改用轻量 `getPermsForUser`（不带树，每请求实时聚合不变）
- 种子：菜单节点补 component/icon/hidden；**SKU 与 SPU 平级挂 /product**（对齐若依：C 类页面无子菜单，权限树 = 路由树，免前端归一化）；v1 数据**原位迁移**（按 legacyCode $set 新字段 + $unset code，保 _id 角色引用不断裂；SKU 跨父由 upsert 的 parentChanged 逻辑重排 sortIndex 防 11000）

### 8.3 前端架构：静态壳 + 动态 addRoute

- 静态壳（前端承载，无需后端返回）：/login、/home（人人可达）、/screen（守卫按 `screen:view` 判权）、/404、layout、catch-all
- 动态路由：login/getInfo 的 routes → `dynamicRoutes.ts` 的 glob 组件映射 + `mapBackendRoutes` 直映射 → `addRoute('layout', r)`；快照与注册表**同数组**（菜单/落地页/404/守卫四消费方同源，结构上不分叉）
- 守卫时序：刷新直达动态路由 → catch-all 先重定向 /404 → 守卫 fetch + 注册 → `to.redirectedFrom` 取回原目标 → `router.resolve` 重判可达 → replace 重放；注册后仍不可达：原目标 = lastVisited → 回退落地页（R15 保留），其余 → 404 信息隐藏
- 登出：`removeFns`（addRoute 返回的移除函数）物理摘除 + 快照清空——换账号看不到上个账号的菜单
- HMR 兜底：userInfo 在而注册丢 → 用内存 `userInfo.routes` 重建（不重发请求）

### 8.4 403 自愈

request.ts 403 分支（`/auth/` 豁免、`isHandling403` 去重）：弹一次文案 → 静默重拉 fetchUserInfo（buildRoutes 先摘后建，路由/菜单收敛，按钮经 v-permission updated 钩子随 perms 纠正）→ 当前页不可达（含 /screen 收权）→ `replace(落地页)`（/home 静态无接口，无循环）。

### 8.5 行为变化（对照 v1）

| 项 | v1 | v2 |
|---|---|---|
| 只勾大屏角色落地 | /screen（R29） | **/home**（home 人人可达） |
| 大屏权限门 | screen:view 三处判权（守卫/入口卡/接口） | **2026-10-18 放开判权定案**：静态页人人可见，三处判权全移除，种子 /home /screen perms 置空 |
| fail-open（网络错误） | 全静态注册天然页面可达 | **不注册**，直连落 404 页（评审：兜底镜像价值薄、维护成本实） |
| 权限变更生效 | 需刷新 | 下一个请求 403 → 自愈收敛 |
| 面包屑 | hidden 页不显示 | 显示隐藏页（hidden 只管菜单） |

### 8.6 关键取舍（面试可讲）

1. **权限树 = 路由树**：SKU 与 SPU 平级（若依 C 菜单无子菜单），免"组件节点子级上提"归一化
2. **path 用绝对路径**：单层分组免拼接（若依相对路径的简化）
3. **perms 保持唯一**：若依无约束，但前端指令按字符串匹配需无歧义（部分索引实现"非空才唯一"）
4. **全表内存聚合保留**：36 节点 KB 级，固定 3 次查询 + 快照一致性；表大且授权稀疏时逐层上溯/$graphLookup 是升级路径
5. **vue-router 5 类型坑**：`RawRouteComponent` 已改名 `RouteComponent`；Vue Component 类型过宽（FunctionalComponent 返回 any），懒函数会被误认成函数式组件——类型检查通过 ≠ 语义正确
6. **Mongoose update 严格模式**：schema 移除的字段，`$unset` 会被静默剥掉，legacy 字段删除需 `{ strict: false }`

---

## 变更记录

| 版本 | 日期 | 内容 |
|---|---|---|
| v1.0 | 2026-09-27 | 初稿：四层防线、code 体系、后端聚合/中间件/特权保护、前端闭环、四里程碑 |
| v1.1 | 2026-09-27 | 吸收评审 R1~R16：祖先补全改全表内存上溯；GET 多 code 挂载；特权保护扩至六条（assign 落点/提权闭环/最后一名超管）；根 id 静默剔除 + 洗存量；种子显式 sortIndex 与 $set 改挂；守卫 fail-open 与 lastVisited 回退；buildMenuRoutes 触发点收口 store；指令 display 切换；Set 边界约定；service 显式 operatorCodes；启动 warn 断言；404 理由入权衡 |
| v1.2 | 2026-09-30 | 实施期补记两条：① **默认角色 user 的改名契约**——user 角色不标 builtin（可改可删，普通角色给灵活性），代价是改名后注册报 500「默认角色缺失」，重跑 seed:admin 即恢复；只有静默塌陷的系统契约（super_admin）才上 builtin 硬保护（曾考虑过「启动时自修复」方案 B，最终定案保持现状）；② **存量角色形状修复**——权限模块落地前创建的旧角色文档没有 `permissions` 键，读取侧三处（hadGrant/聚合/toRoleDTO）必须 `?? []` 防御 undefined，seed 加 `$exists: false` 补空数组。教训：默认值只保证「新建时」有，读 DB 文档永不假定形状。 |
| v1.3 | 2026-09-30 | 实施后问答审查批次的修订汇总：① **同名提交放行**——builtin 改名拦截改为「值真的变了才拦」（前端表单恒带 roleName）；② **最后一名超管保护收窄**——只拦「新 roles 不再产出 grant-super」，追加普通角色放行；③ **祖先上溯 visited 防环**（rbac 聚合 + validateParentFor 双处，成环脏数据不再死循环）；④ **种子跨父恢复重排**（parentChanged 时重排到目标父级末尾，11000 免疫）；⑤ **商品页按钮 code 铺开**（12 按钮 + 6 组路由挂载 + v-permission）；⑥ 菜单过滤空分组整组剔除（children: [] 不再渲染成可点叶子）；⑦ 登录落地与 404 返回入口动态化（routeAccess 工具三处共用）；⑧ 401 分支带 redirect + 去重 + auth 豁免；⑨ RouteMeta 声明 code 去除 as 断言；⑩ 体验层禁用（内置角色行按钮与分配选项按 grant-super 禁用）与 fail-open 提示。 |
| v2.0 | 2026-10-17 | **动态路由改造（对齐若依）**：code 拆分为 perms/path/component/icon/hidden；后端下发授权路由树 + 前端 addRoute 动态注册（静态壳保留）；403 自愈；边界测试 163→168 全绿；数据原位迁移保角色引用。详见 §8。 |

## 评审意见与处置

| # | 问题摘要 | 处置 |
|---|---|---|
| R1 | 祖先补全按已查集合上溯查不到半选父级 | 采纳：全表一次取 + 内存 Map 上溯 |
| R2 | 页面 code 当读权限切断跨页依赖 | 采纳：GET /permission、GET /role 改多 code some，挂载表加消费方列 |
| R3 | assign code 无落点 + 提权闭环断 | 采纳：§4.4 第 1/4/6 条 |
| R4 | 唯一超管可自我降权锁死系统 | 采纳：§4.4 第 5 条 |
| R5 | 根 id 抛 400 使存量角色永久保存失败 | 采纳：静默剔除 + $pull 洗存量 |
| R6 | 种子裸 upsert 撞 sortIndex 唯一索引 | 采纳：显式递增 sortIndex |
| R7 | 守卫判权与网络错误不误伤冲突 | 采纳：userInfo 存在为前提，fail-open |
| R8 | buildMenuRoutes 只挂守卫 → 登录后空菜单 | 采纳：触发点收口 user store |
| R9 | 指令 mounted+removeChild 不可逆 | 采纳：mounted/updated + display 切换 |
| R10 | Set 与数组边界混乱 | 采纳：§4.1 数据形态约定 |
| R11 | service 读 req 隐式依赖中间件 | 采纳：显式 operatorCodes，undefined fail-closed |
| R12 | $addToSet 改挂只追加 | 采纳：$set 覆盖 |
| R13 | 种子没跑时 builtin 保护静默失效 | 采纳：M2 验收 + 启动 warn 断言 |
| R14 | 404 承接越权未入权衡 | 采纳：§7 第 3 条 |
| R15 | lastVisited 送回无权限页 | 采纳：§5.4 第 3 条回退链 |
| R16 | 悬空引用 + 缺两张惯例表 | 采纳：文档自包含 + 变更记录 + 本表 |
