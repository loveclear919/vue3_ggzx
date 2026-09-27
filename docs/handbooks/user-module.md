# 用户管理模块实现手册（手机号登录 + CRUD + 角色分配 + 个人资料）

> 本手册记录用户体系（前端 `/acl/user`、登录页 `/login`、顶栏个人资料，后端 `/api/auth`、`/api/user`）的完整实现：
> **手机号是登录凭据（创建后不改），username 是可自由修改的展示名** —— 登录名不可改的成立前提是「一次性慎重选择」，手机号天然满足；灵活性交给展示名。
> 涵盖：注册/登录、JWT、用户管理 CRUD、角色分配、个人资料头像、最小权限与引用完整性保护。

## 一、模块总览

| 功能 | 前端入口 | 后端接口 |
|------|----------|----------|
| 注册（手机号 + 密码） | 登录页翻转卡正面 | `POST /api/auth/register` |
| 登录（手机号 + 密码） | 登录页翻转卡背面 | `POST /api/auth/login` |
| 当前用户信息（刷新恢复） | 路由守卫自动拉取 | `GET /api/user/info` |
| 修改个人资料（展示名 / 头像） | 顶栏头像下拉「个人资料」弹窗 | `PATCH /api/user/info` |
| 修改密码 | 顶栏头像下拉「修改密码」弹窗 | `PATCH /api/user/password` |
| 用户列表 / 双字段搜索 | 用户管理页 | `GET /api/user?page&pageSize&keyword` |
| 新增用户（手机号 + 初始密码） | 用户管理弹窗 | `POST /api/user` |
| 编辑用户（展示名 / 描述） | 用户管理弹窗 | `PATCH /api/user/:id` |
| 角色分配 | 用户管理抽屉（多选框组） | `PATCH /api/user/:id` |
| 删除用户 | 用户管理二次确认 | `DELETE /api/user/:id` |

核心数据流：**登录 → JWT(token 存 localStorage) + userInfo(只存 Pinia 内存) → 刷新后路由守卫用 token 重拉 userInfo → 管理端按白名单操作**。

## 二、登录凭据设计：phone vs username

| 字段 | 定位 | 唯一索引 | 修改权限 |
|------|------|----------|----------|
| `phone` | **登录凭据（身份）** | ✅ | 创建后不改（白名单不含 phone） |
| `username` | **展示名** | ✅（防撞名，409 友好提示） | 本人（个人资料）+ 管理端均可改（3-20 字符） |
| `avatar` | 头像 | — | 本人可改（个人资料弹窗，默认图仅展示不进库） |
| `password` | 凭证 | — | 本人可改（独立端点，原密码校验） |

**为什么 username 保留唯一索引却「可自由修改」：**
- 展示名重复会让管理端列表失去辨识度，唯一性给出确定语义（改撞名 → 409「用户名已存在」，而不是静默撞名）；
- 「可修改」与「唯一」不冲突 —— GitHub handle 同样可改且唯一。

**默认用户名生成**（`backend/src/utils/defaultUsername.ts`）：注册/管理端创建时不要求填用户名，自动生成「用户 + 6 位随机数字」。
- 碰撞概率 1/10⁶ 量级，且靠唯一索引兜底：创建失败时用 `isDuplicateKeyError(err, 'username')` 区分冲突字段，撞 username 则**重新生成再试（上限 3 次）**，撞 phone 则直接 409。
- 区分靠 `keyPattern`：`isDuplicateKeyError(err, key?)` 的 key 参数只认「该字段上的唯一索引」冲突（`backend/src/utils/mongoError.ts`）。

**手机号严格正则**（后端定义在 `models/User.ts`（规则与字段同文件），前端 `utils/phone.ts` 一份同值副本，修改必须两边同步）：`/^1[3-9]\d{9}$/`
- 用户明确要求「严格规定输入，不做 SKU 式清洗」——格式不对直接 400「手机号格式不正确」；
- 四层防线：前端 el-form pattern 规则 → 服务层显式 400 → 模型 `match` validator（绕过前端直调 API 也被拦）→ 错误处理中间件兜底。

## 三、后端分层实现

### 1. 数据模型 `models/User.ts`

```ts
username: { unique, trim, minlength: 3, maxlength: 20 }   // 展示名
phone:    { unique, trim, match: [PHONE_REGEX, '手机号格式不正确'] }  // 登录凭据
password: { select: false }                                // 永不默认查出
// timestamps: true → createdAt/updatedAt 进 DTO（前端展示用 formatDateTime）
```

### 2. 业务层 `services/auth.ts` + `services/user.ts`

**注册复用用户创建的唯一入口**（关键决策）：`auth.register = userService.createUser(phone, password, '', ['user']) + 签发 token`。
注册不自写一套创建逻辑，避免两个入口的校验规则漂移 —— 手机号校验、默认用户名、重复手机号 409 全部只在 `createUser` 一处。

**登录防枚举**：用户不存在与密码错误共用同一文案「手机号或密码错误」，不泄露「该手机号是否已注册」。

**更新白名单与最小权限**（三个 PATCH 接口对比）：

| 接口 | 白名单 | 说明 |
|------|--------|------|
| `PATCH /user/info`（本人） | `avatar` / `username` | 展示名与头像本人可改（撞名 409）；不能改自己的 roles（防自我提权）、不能改 phone（身份） |
| `PATCH /user/password`（本人） | `oldPassword` + `newPassword` | 独立端点：旧密码 bcrypt 比对（错误 → 400「原密码不正确」），新密码走模型 pre('save') 钩子加密；不并入资料白名单（密码 select: false + 独立生命周期） |
| `PATCH /user/:id`（管理端） | `username` / `desc` / `roles` | phone 被忽略；密码重置留待独立流程 |

**删除的三重保护**（`services/user.ts:170`）：不能删自己（400）、删除最后一名管理员被拒（409「系统至少保留一名管理员」）、operatorId 来自 JWT（不是请求参数，防止伪造他人身份）。

### 3. 搜索与分页

- `keyword` 双字段搜索：`$or: [{ username: re }, { phone: re }]`，正则先 `escapeRegExp`（用户输入不破坏正则）；
- 分页走 `normalizePage`（NaN/Infinity/越界 clamp，`utils/pagination.ts`）。

## 四、前端实现

### 1. 登录态分层（`stores/user.ts` + `router/guards.ts`）

- **token 存 localStorage**（身份凭证，刷新不丢），**userInfo 只存 Pinia 内存**（派生数据，随时可重查）；
- 刷新后守卫发现 `userInfo` 为空 → `fetchUserInfo()` 用 token 换最新信息（权限数据以后端为权威，不缓存成第二份真相）；
- 只有 401 才踢出登录，网络类错误不误伤用户。

### 2. 用户管理页（`views/acl/user/index.vue`）

- 列表：序号 / 用户名 / **手机号** / 描述 / 角色标签 / 创建时间 / 更新时间，`usePagedList` + `AppPagination`（通用分页组合）；
- 新增弹窗：手机号 + 密码 + 描述（用户名自动生成，表单不出现）；
- 编辑弹窗：手机号只回显（disabled）、展示名可改 + 描述；`formRules` 用 `computed` 按新增/编辑切换规则集；
- 角色分配抽屉独立于编辑（el-drawer + el-checkbox-group，destroy-on-close），只走 roles 白名单。

### 3. 个人资料与修改密码入口（`layout/tabbar/avatar/index.vue`）

- 顶栏头像下拉：个人资料 / 修改密码 / 退出登录；
- **个人资料** el-dialog（destroy-on-close）：用户名可编辑（3-20 规则）+ 手机号只读回显 + 头像 `ImageUploader`（max=1，「数组 ↔ 单值」桥接）+ 即时预览（待上传图 > 当前头像 > 默认图，默认图仅展示不进库）；
- **修改密码**独立 el-dialog：原密码 + 新密码 + 确认密码（一致校验），成功后不强制下线（token 仍有效）；
- 保存走 `updateUserInfo` 后 `fetchUserInfo()` 以服务端为准刷新 store，顶栏头像与用户名随之更新；
- 顶栏头像展示自定义头像，无则回退默认图（v-if/v-else，不做资源 import）；
- ⚠️ 组件必须显式 import：本项目 `Components` 插件 `dirs: []` 无目录自动注册（components.d.ts 是旧配置残留），漏 import 时 vue-tsc 不报错、运行时组件不渲染 —— 个人资料初版头像上传器因此不显示，已修复。

## 五、边界测试覆盖（`scripts/boundary-test.ts`，共 114 例）

- 注册：手机号格式错误（非 1[3-9] 开头 / 位数不足）→ 400；密码过短 → 400；正常 → 200（断言用户名自动生成）；重复手机号 → 409
- 登录：错误密码 / 不存在手机号 → 401（同文案防枚举）
- 个人资料：avatar 更新 200、username 过短 400、username 更新且可改回 200
- 修改密码：原密码错误 400、新密码过短 400、成功 200（旧密码失效、新密码可登录，测完改回）
- 用户管理：新增（按手机号可搜到）、重复手机号 409、手机号格式 400、密码过短 400、**更新 username/desc 生效且 phone 被忽略**、删除自己 400、删除非最后一名 admin 200、重复删除 404
- 测试手机号统一 `199123` 前缀 + 时间戳后 4 位（每次运行唯一），cleanup 按「boundary_ 用户名前缀 + 199123 手机号前缀」直连库清扫（注册用户名自动生成，只能靠手机号定位）

## 六、本地开发数据迁移（重要）

登录字段从 username 换成 phone **不可平滑迁移**，旧数据需清空重来：

```bash
pnpm --filter backend run sync:indexes   # 重建索引（username_1 + phone_1）
pnpm --filter backend run seed:admin     # 幂等种子管理员：13800138000 / admin123
```

清空 users 集合后跑上面两条；`seed:admin` 幂等（已存在则只补 admin 角色，不动密码）。

## 七、如果重构，我会改进…

- **角色数据源**：角色分配抽屉目前是静态 options（admin/user），角色模块落地后换成接口数据，后端同时加 roles 值域校验（白名单值枚举）。
- **改密后 token 失效策略**：目前改密后旧 token 仍有效（JWT 无版本号），若要求「改密后全端下线」，可加 token 版本号（jti）配合 Redis 黑名单。
- **管理端重置密码**：目前管理员设初始密码 + 用户自助改密；管理员直接重置他人密码的流程可后续独立（用户明确不做「首次登录强制改密」）。
