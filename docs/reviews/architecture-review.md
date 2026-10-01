# 项目整体架构复盘（RBAC 收官后）

> 审查视角：agent.md 首席架构师框架。范围：全栈整体架构 + user/role/permission（RBAC 系）。
> 商品系模块（brand/category/attr/spu/sku）已有专项 review，本文只补 RBAC 落地后的交叉影响。

## 一、业务全景

一个面向简历演示的电商后台：**商品域**（品牌/分类/属性/SPU/SKU 笛卡尔积生成）与**权限域**（用户/角色/权限树）双域并行，由 RBAC 的 code 对账机制把它们拧在一起——「谁能看见什么、能操作什么」全部由权限树数据驱动，后端 403 是唯一安全边界。

核心数据流：

```
浏览器 ──token(Bearer JWT)──► 中间件链 auth → requirePermission ──► controller → service → model → Mongo
   ▲                                                                        │
   │  login/register/getInfo 响应 ┌────────────── 聚合链 ─────────────┐     │
   └────── codes: string[] ◄─────┤ User.roles → Role.permissions ─────┼─────┘
                                 └→ Permission 全表 Map 祖先补全 → Set ┘
   codes 分流三处：菜单过滤（静态路由 ∩ codes）/ v-permission 显隐 / 守卫 404
```

## 二、技术实现链路（以「分配权限」为例的全调用栈）

1. 角色页点「分配权限」→ `v-permission="'role:assign-perm'"` 先行显隐（体验层）；
2. 打开抽屉 → `GET /permission` 挂 `requirePermission('/acl/menus', 'role:assign-perm')` → 聚合查库（3 次索引查询）→ 平铺树返回；
3. 前端 `listToTree` 组树 → 勾选提交 → `PATCH /role/:id`（挂 `role:update`）→ service 层另验 `role:assign-perm` + 提权闭环特判（`grantSuperPermissionId` 比对）→ 根节点 id 静默剔除 → 入库；
4. 用户下次任意请求 → 中间件重新聚合 → 新权限即时生效（**无需重登**）。

链路中的关键节点作用：`auth`（JWT 解 userId）、`requirePermission`（聚合 + some 裁决 + 挂 req.permissionCodes）、`errorHandler`（AppError→状态码 / Mongoose 校验→400 / CastError→400）、前端拦截器（401 统一踢出 + 动态 import 清状态）、守卫（登录态恢复 + fail-open 判权）。

## 三、架构决策分析

### 1. 后端四层 + 四层校验（分层原因）

`routes（接线）→ controllers（形状）→ services（规则）→ models（schema + 索引）`。**规则单入口**是核心收益：注册复用 `userService.createUser`、权限父级校验 `validateParentFor` 共享、角色 id 校验 `validateRoleIds` 共享——任何入口（HTTP/种子/测试）走同一套规则，不会漂移。

四层校验各司其职：controller 验请求形状 → service 验业务规则与特权 → model validator 兜底（`runValidators` 是开关式兜底，不开就静默失效）→ 唯一索引 11000 → 409。每层拦自己那一类错误，越界就是 500。

### 2. RBAC 四层防线（扩展性核心）

后端 403 = 安全边界；前端菜单过滤/守卫/指令 = 体验层。**每个新接口的开发顺序被固化**：先想「挂哪个 requirePermission」，再想前端入口。多 code some 挂载解决跨页消费（GET /role 三 code），数据级权限未来在 service 层裁剪，不往中间件塞。

### 3. 前端登录态分层（为什么这么分）

token 存 localStorage（凭证，刷新不丢）；userInfo 只存内存（派生数据，守卫用 token 重拉）——**单一事实源**原则：拦截器和守卫都读 localStorage，杜绝 401 死循环类事故（历史事故驱动）。codes 随之收口：login/fetchUserInfo 尾部构建菜单、logout 统一清三处状态、401 拦截器动态 import 同口径。

### 4. 种子即基线（运维模型）

幂等种子（按 code/roleName upsert）承担「恢复基线」职责：权限树全量、角色权限基线、管理员挂靠、洗存量、形状修复。配套哲学：**种入节点放开可改可删，玩坏重跑种子恢复**；只有静默塌陷的系统契约（super_admin、根节点）上硬保护。跨父移动后的种子恢复已做重排处理（11000 免疫）。

### 5. 错误处理分工（谁生产谁判断）

后端生产 code + 文案，前端拦截器只消费：401 统一踢出、其余弹后端文案。业务错误全是预期错误（AppError），未知错误统一 500 + 服务端日志——前端永远看不到堆栈。

### 6. 测试策略

158 例边界测试（HTTP 层端到端 + 直连库清理）：认证、CRUD 边界、RBAC 403 矩阵、特权六条、根节点、祖先补全、SKU 上架闸门、权限树成环防御。配 `audit:data` 数据体检（17 项）与 `type-check`（src + scripts 双配置，根目录 `pnpm check` 一键双端）。

## 四、关键函数深度拆解（变量级）

### 1. `getPermissionCodesForUser(userId)` — RBAC 心脏（services/rbac.ts）

- **入参**：只收 userId（不信任任何前端传入的权限声明）——codes 只能由服务端推导；
- **实现**：User 查 roles → Role 查 permissions → **Permission 全表一次取**建 Map 内存上溯。全表取是硬约束：Role.permissions 只存勾选叶子（半选父级不入库，防回显漂移），按已存 id 过滤查询永远查不到父级；
- **边界**：用户不存在返回空 Set；无 code 节点与根 `/` 跳过但继续上溯；存量文档 `permissions ?? []` 防形状缺失（踩过 500）；
- **返回值**：Set（内部判重高效），DTO 边界才 `[...codes]` 转数组；
- **副作用**：无（纯读）。演进路径：Redis TTL 缓存 + 角色变更失效。

### 2. `requirePermission(...codes)` 工厂 — 裁决点（middlewares/requirePermission.ts）

- **入参**：rest 参数多 code，some 语义（任一命中放行）——只回答「能否调用此 API」，不回答「能看多少数据」；
- **边界**：`!req.userId` 先 401（防路由挂载顺序错误）；聚合结果挂 `req.permissionCodes` 供 controller 透传；
- **服务层不读 req**：特权特判走显式 `operatorCodes?: Set<string>`，undefined fail-closed——不隐式依赖「路由挂过中间件」；
- **副作用**：每请求 3 次索引查询（有意：改权即生效，不用重登）。

### 3. `buildMenuRoutes(codes)` — 菜单过滤（stores/permission.ts）

- **入参**：登录聚合 codes 数组，内部转 Set；
- **过滤规则**：`meta.code ∈ codes` 保留；**分组父级子级全灭时整组剔除**（否则 `children: []` 被菜单组件渲染成可点击叶子 → redirect 到无权限子级 → 404，踩过）；叶子与 `children: []` 视同（契约在 routes.ts 顶部注释立字）；
- **副作用**：写 store.routes（layout 菜单消费）；logout 时 reset 防跨账号残留。

## 五、各模块走查

| 模块 | 核心决策 | 已有 review |
|---|---|---|
| auth/user | 手机号凭证 + 用户名展示名；防枚举同文案；注册复用 createUser；登录态分层 | user-module 手册 |
| role | builtin 模型事实；特权六条收敛 grant-super；默认角色 name anchor 有意权衡 | 本文 §三.4 |
| permission | 自引用树 + 复合唯一索引；环校验共享；sortIndex 两种语义；swap 无事务三步 | 本文 §四.2 |
| RBAC 前端 | 静态路由过滤（不 addRoute）；fail-open 判权；display 切换指令 | 本文 §三.2 |
| brand/category/attr/spu/sku | 见既有 review；RBAC 后新增 requirePermission 挂载 + 按钮 code 对账 | [attr-module.md](attr-module.md) [category-drilldown.md](category-drilldown.md) [sku-module.md](sku-module.md) [spu-module.md](spu-module.md) |

## 六、【风险提示】

1. **前端零自动化测试**：守卫判权、菜单过滤、v-permission 全是纯逻辑却无单测，RBAC 前端回归全靠手工（后端 158 例覆盖不到前端逻辑）。R15/R7 这类分支再改就容易悄悄坏掉；
2. **边界测试与环境数据耦合**：测试前提（「唯一超管」「seed 基线」）依赖开发库干净——Loveclear 账号挂超管曾让最后一名超管用例静默跳过，是真实教训。建议测试前自检（audit:data 已可做前置）；
3. **前端权限不热更新**：改权限后要重登/刷新才反映到菜单与按钮（后端即时）。已文档化有意权衡；
4. **codes 每请求 3 次查询**：量级无压力，但所有带权限接口共享此成本。演进：Redis TTL + 失效；
5. **JWT 无版本号**：改密后旧 token 仍有效；登出纯前端（无服务端黑名单）。已记录于 user-module 手册；
6. **种子含明文密码**（dev 基线账号）：仅限本地开发使用，README 部署节需注明。

## 七、如果重构，我会改进…

1. **前端补 vitest**：`buildMenuRoutes`（空分组/叶子契约/整支剪除）、守卫判权分支（fail-open/lastVisited 回退）、v-permission toggle——三个纯函数化后即可测；
2. **边界测试前置基线自检**：跑测试前先 `audit:data` + 断言唯一超管，前提不成立直接失败而非静默跳过（把 ⏭️ 变成前置 gate）；
3. **聚合加内存 TTL 缓存**：`Map<userId, { codes, expireAt }>` + 角色/权限变更时失效（updateRole/updatePermission/updateUser 处主动清）；
4. **CI 一条流水线**：`type-check`（双端）→ `audit:data` → `test:boundary`，把今天分散的验证动作固化成一条命令；
5. **可选**：权限变更实时推送（SSE）让前端热更新；openapi 生成前端请求类型。
