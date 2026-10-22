# 角色管理模块实现手册

> 作为后续同类模块的参照模板。覆盖角色 CRUD、权限分配、RBAC 特权保护（六条）与内置角色语义。

## 一、模块总览

### 功能 ↔ 接口对照表

| 页面操作 | 前端入口 | 后端接口 | 权限 code（requirePermission） |
|---|---|---|---|
| 角色列表（分页+搜索） | role/index.vue | `GET /role` | `/acl/roles`、`/acl/users`、`user:assign-role`（任一） |
| 添加角色 | role-form-dialog | `POST /role` | `role:create` |
| 编辑角色（名/描述） | role-form-dialog | `PATCH /role/:id` | `role:update` |
| 分配权限（勾选树提交） | permission-drawer | `PATCH /role/:id`（permissions 字段） | `role:update` + service 另验 `role:assign-perm` |
| 删除角色 | index.vue | `DELETE /role/:id` | `role:delete` |

GET 多 code 的动机：用户页的角色标签/分配选项也是 `GET /role` 的消费方，单挂角色页 code 会切断跨页依赖（rbac-design §4.3）。

### 文件清单

| 文件 | 职责 |
|---|---|
| backend/src/models/Role.ts | roleName 唯一、permissions ref 数组、**builtin 标记**、DEFAULT_ROLE_NAME |
| backend/src/services/role.ts | CRUD + validatePermissionIds（根剔除）+ 特权六条特判 |
| backend/src/services/rbac.ts | 聚合 + hasCode/builtinRoleIds/grantSuperPermissionId/grantSuperHolderUserIds |
| backend/src/controllers/role.ts / routes/role.ts | 形状校验 + 透传 req.permissionCodes / 路由挂载 |
| backend/scripts/seed-admin.ts | 9 个基础角色幂等 upsert、权限基线、形状修复、洗存量 |
| vue-project/src/views/acl/role/… | 列表页 / 表单弹窗 / 分配抽屉 |

## 二、后端分层实现

### 1. Model：builtin 是「模型事实」而非名字约定

```ts
builtin: { type: Boolean, default: false }
```

**为什么**：早期特权判断用 `roleName === 'super_admin'`（改名即绕过）。builtin 让「机器识别内置角色」与名字脱钩；改名禁令保留但动机变了——保护的是**种子幂等锚点**（seed 按 roleName upsert，改名会造出第二个超管角色）而非安全。

**user 角色不标 builtin**（有意权衡）：它只是「注册默认角色」，改名 → 注册报 500「默认角色缺失」→ 重跑 seed:admin 恢复。故障响亮、有恢复手段，留给普通角色灵活性。

### 2. Service：特权六条（rbac-design §4.4）

| # | 规则 | 位置 |
|---|---|---|
| 1 | patch.roles 需 `user:assign-role`；涉及 builtin 需 `role:grant-super` | userService.updateUser |
| 2 | 同 #1（改角色 = 授予/撤销集合） | 同上 |
| 3 | 删持 builtin 用户需 `role:grant-super` | userService.deleteUser |
| 4 | builtin 角色：**真改名**/删除（硬 403）；其余修改需 grant-super；permissions 另需 assign-perm | roleService |
| 5 | 最后一名 grant-super 持有者（按聚合集合计数）：改 roles 只拦「新集合不再产出 grant-super」（追加普通角色属安全操作）；删除一律拦 | userService |
| 6 | 提权闭环：授予 grant-super 须自身持有它 | roleService.updateRole |

防自我锁死：builtin 角色 permissions 修改**不允许移除 grant-super**。

**关键约定（R11）**：service 不读 req——特权特判一律走显式参数 `operatorPerms?: Set<string>`，controller 透传 `req.permissionPerms`；`undefined` 按无特权 fail-closed。`hasPerm = (perms, perms) => perms?.has(perms) ?? false`。

**改名判定口径（踩过两次的坑）**：前端表单恒带全字段，后端拿「字段出现」当「意图变更」必误伤。拦截必须绑定**值的变化**——builtin 改名拦截是 `roleName.trim() !== target.roleName` 才 403；同源教训见权限模块「编辑名称不重排」（parentId 同值不触发跨父逻辑）。

### 3. validatePermissionIds：清理 → 形状 → 值域

根节点（code `/`）**静默剔除**而非 400：EP 的 `getCheckedKeys` 对 disabled 节点照常返回勾选值，存量角色若勾过根，抛 400 会让它们永久保存失败（R5）。配 seed 一次性 `$pull` 洗存量。

顺序即语义：剔根 → `isValidObjectId` 格式 → `countDocuments($in)` 一次验全存在性（`count !== length` 覆盖全部缺失情况）。

### 4. 踩过的坑

- **存量形状缺失**：权限模块落地前创建的旧角色文档没有 `permissions` 键——读取侧三处（updateRole 的 hadGrant、rbac 聚合 flatMap、toRoleDTO）必须 `?? []`，不能假定形状。seed 加形状修复：`updateMany({ permissions: { $exists: false } }, { $set: { permissions: [] } })`。**教训：读 DB 文档永远防御 undefined，默认值只保证「新建时」有。**
- roleName 唯一索引 → 11000 → 409「该角色名已被占用」。
- 删除保护两层：仍有用户持有 → 409；builtin → 403。

## 三、前端实现

### 1. 状态模型

- 列表走 `usePagedList`（通用分页组合，页号归零/空表回退已内建）；
- `permissionRows` 页面级持有（平铺数组）：列表页标签与分配抽屉共用同一数据源；
- **分配抽屉拉树失败就不打开**（`fetchPermission` 返回布尔）——空树点确认会把角色权限清空，fail fast 优于打开后禁用。

### 2. 分配抽屉的关键契约

- 提交 = `getCheckedKeys()`（**叶子 + 全选父级**），半选父级不入库——回显时 el-tree 从叶子推导父级状态；存了半选会造成回显级联漂移；
- 根节点禁用勾选（`props.disabled` 函数），但注意 EP 语义：disabled 节点的**已勾选状态**仍被 getCheckedKeys 返回 → 后端静默剔除是双保险；
- `default-checked-keys` 只在首渲生效 → 依赖 `destroy-on-close`；
- 提交前加空树守卫（`!root.value.length` → warning 不提交）。

### 3. 交互细节

- 编辑弹窗单变量 `props.role` 模式（role-form-dialog），watch 只拦 `!opened`（曾因提前 return 导致「点新增也是编辑表单」）；
- 提权演示场景：普通管理员勾「超级授权」→ 后端 403「授予超级授权需要超级授权」。

## 四、专项集成：RBAC 特权保护

聚合链（rbac.ts，共 3 次查询）：`User.roles → Role.permissions → Permission 全表内存 Map 祖先补全 → Set<code>`。查库而非 JWT 内嵌：改权限立即生效不用重登。

**数据形态约定**：后端内部 Set，DTO 边界 `[...perms]` 转数组；前端收数组，判权处转 Set。

## 五、错误处理全链路

| 场景 | 后端触发点 | 转换 | 前端消费 |
|---|---|---|---|
| 无 assign-perm 改权限 | requirePermission/特判 | 403 | 拦截器弹后端文案 |
| 给普通角色勾 grant-super | updateRole 特判 | 403「授予超级授权需要超级授权」 | 同上 |
| 改/删内置角色 | updateRole/deleteRole | 403 | 同上 |
| 改内置角色移除 grant-super | updateRole 特判 | 403 | 同上 |
| 删被引用角色 | countDocuments | 409 | 同上 |
| 重名 | 唯一索引 11000 | 409 | 同上 |
| 传根节点 id | validatePermissionIds | 静默剔除，200 | 无感 |

原则：后端生产 code（403/409/400 与文案），前端只消费文案——谁生产谁判断，各司其职。

## 六、验证清单

- [ ] 角色 CRUD 四接口边界测试（`pnpm --filter backend run test:boundary`，168 例含 RBAC 矩阵）
- [ ] 普通用户（仅 /home+/screen）调 `GET /role` → 403
- [ ] 无 assign-perm 的操作者 PATCH permissions → 403
- [ ] 勾 grant-super 给普通角色 → 403；超管操作 → 200
- [ ] 改/删 super_admin 角色 → 403（改名硬 403，超管也拦）
- [ ] 最后一名超管自我降级 → 403「系统至少保留一名超级管理员」
- [ ] 分配抽屉勾选菜单+按钮 → 回显正确（半选父级自动推导）
- [ ] 根节点勾选框禁用；旧数据提交时被静默剔除
- [ ] `pnpm run type-check`（src + scripts 双配置）
