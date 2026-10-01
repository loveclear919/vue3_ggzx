# vue3_ggzx

基于 Vue 3 + Express 5 的全栈运营管理后台（前端为主），pnpm monorepo 单仓库管理前后端。

## ✨ 已实现功能

**用户认证**

- 手机号注册 / 登录（bcrypt 加盐哈希 + JWT，7 天有效期）；username 为可改展示名，注册自动生成「用户+随机编码」
- 登录态持久化：token 存 localStorage（唯一事实源），刷新不丢失；个人资料（头像 / 展示名）+ 自助改密

**RBAC 权限闭环**

- 权限树（菜单/按钮两级，自引用 + 环校验 + 同层排序交换）；角色管理（内置角色保护）；用户-角色-权限三级聚合
- 四层防线：后端 `requirePermission` 403（安全边界）/ 前端守卫判权（fail-open）/ 菜单过滤（静态路由 ∩ codes）/ `v-permission` 按钮显隐
- 特权体系：`role:grant-super` 统一判据（授予撤销、最后一名超管保护、提权闭环、防自我锁死）
- 权限变更即时生效（每次请求实时聚合，无需重登）

**商品域**

- 品牌 / 三级分类下钻 / 平台属性管理
- SPU 管理（平台属性 + 销售属性、跨分类校验、SKU 存在时销售属性冻结）
- SKU 笛卡尔积生成（combinationKey 唯一索引防重、防 OOM、上架闸门 I11、完整性提示）

**体验与工程**

- 暗黑模式（Element Plus 暗色变量 + 三态切换 + 首帧防闪烁）
- helmet / 认证限流 / 防用户名枚举 / 统一错误处理（AppError → 状态码信封）
- 数据体检脚本（17 项引用完整性检查）、158 例边界测试、双端类型检查 + pre-push 门禁

## 🛠 技术栈

| 层      | 技术                                                                            |
| ------- | ------------------------------------------------------------------------------- |
| 前端    | Vue 3.5 / TypeScript / Vite 8 / Pinia / Vue Router 5 / Element Plus / Sass      |
| 后端    | Node.js / Express 5 / Mongoose 9 / JWT / bcryptjs / multer                      |
| 工程化  | pnpm monorepo / oxlint + ESLint / Prettier / Husky + lint-staged / Commitlint   |

## 📦 目录结构

```
vue3_ggzx
├── backend/                    # Express 5 后端（端口 3000）
│   ├── src/
│   │   ├── config/             #   MongoDB 连接
│   │   ├── models/             #   9 个模型（唯一索引 / 校验 / DTO 脱敏）
│   │   ├── routes/             #   接线层：URL → controller + requirePermission 挂载
│   │   ├── controllers/        #   处理层：解析参数、组装响应
│   │   ├── services/           #   业务层：规则单入口（含 rbac 聚合与特权六条）
│   │   ├── middlewares/        #   auth / requirePermission / 统一错误处理 / 限流
│   │   ├── utils/              #   AppError、响应封装、分页 clamp、错误码识别
│   │   └── index.ts            #   入口（helmet / cors / 路由挂载 / 启动断言）
│   ├── scripts/                #   种子（分类/销售属性/权限树/管理员）、边界测试、数据体检
│   └── .env.example            #   环境变量模板（复制为 .env 使用）
├── vue-project/                # Vue 3 前端（端口 5173，/api 代理到后端）
│   ├── src/
│   │   ├── api/                #   接口层（按页面域拆分 + 类型化）
│   │   ├── router/             #   路由（meta.code 对账）+ 守卫（认证/判权/fail-open）
│   │   ├── stores/             #   Pinia（user / permission / setting）
│   │   ├── directives/         #   v-permission 按钮级显隐
│   │   ├── composables/        #   usePagedList / useLatestRequest
│   │   ├── utils/              #   axios 封装、可达性判定、listToTree、storage 收口
│   │   ├── views/              #   login / home / screen / acl / product
│   │   ├── components/         #   分页、分类下钻、图片上传器
│   │   └── styles/             #   全局样式 + 暗色主题
│   ├── env.d.ts                #   ImportMetaEnv 声明（strictImportMetaEnv 严格模式）
│   └── .env.example            #   环境变量模板
├── docs/                       # 设计文档（design/）+ 模块手册（handbooks/）+ 架构复盘（reviews/）
├── .husky/                     # git 钩子（pre-commit lint-staged / commit-msg / pre-push 双端类型检查）
├── commitlint.config.ts        # commit 信息规范（仓库级）
├── pnpm-workspace.yaml         # workspace 定义
└── package.json                # 根：统一脚本（dev / check 等）
```

## 🚀 快速开始

1. **环境要求**：Node `^22.18.0 || >=24.12.0`、pnpm 11、本地 MongoDB
2. **安装依赖**：`pnpm install`
3. **配置后端环境变量**：`cp backend/.env.example backend/.env`，填入 `MONGODB_URI` 与随机 `JWT_SECRET`
4. **种子数据**（幂等，按序执行）：
   ```bash
   pnpm --filter backend run seed             # 商品三级分类 + 基础销售属性
   pnpm --filter backend run seed:permissions # 权限树全量（根 + 菜单 + 按钮）
   pnpm --filter backend run seed:admin       # 基础角色 + 权限基线 + 超管账号（13800138000 / 123456）
   ```
5. **启动**：`pnpm dev`（并行启动前后端），打开 http://127.0.0.1:5173
6. **验证**：`pnpm check`（双端类型检查）、`pnpm --filter backend run audit:data`（数据体检）、`pnpm --filter backend run test:boundary`（需后端已启动，158 例）

## 📸 截图

## 📄 常用命令

在仓库根目录执行：

| 命令                                     | 作用                         |
| ---------------------------------------- | ---------------------------- |
| `pnpm dev`                               | 并行启动前后端开发服务       |
| `pnpm dev:frontend` / `pnpm dev:backend` | 单独启动前端 / 后端          |
| `pnpm check`                             | 双端类型检查（前端 vue-tsc + 后端 src/scripts 双配置） |

后端包（`backend/`）：

| 命令                                | 作用                                       |
| ----------------------------------- | ------------------------------------------ |
| `pnpm build` / `pnpm start`         | 生产构建（tsc → dist）/ 启动构建产物       |
| `pnpm test:boundary`                | 边界测试（158 例，需 dev server 在跑）     |
| `pnpm audit:data`                   | 数据体检（17 项引用完整性，问题 exit 1）   |
| `pnpm type-check`                   | 类型检查（src + scripts 双配置）           |
| `pnpm clean:residue`                | 清理失败中断的测试残留（按前缀直连库清扫） |

提交即触发门禁：pre-commit 自动 lint + 格式化本次改动文件，commit-msg 校验 Conventional Commits 规范，pre-push 双端类型检查。

## 📚 更多

- 架构与决策：[docs/reviews/architecture-review.md](docs/reviews/architecture-review.md)（整体复盘）、[docs/design/rbac-design.md](docs/design/rbac-design.md)（RBAC 方案与变更记录）
- 模块手册：[docs/handbooks/](docs/handbooks/)（user / role / permission / attr / brand / spu / sku / monorepo）
- 前端工程细节见 [vue-project/README.md](vue-project/README.md)

## ⚠️ 部署注意（生产环境）

- **CORS**：当前 `app.use(cors())` 放行所有来源（开发便利），生产必须收紧 `origin` 白名单
- **上传静态**：`/uploads` 由 Express 静态服务（头像可公开），生产建议交给 nginx / 对象存储
- **限流与安全头**：helmet 与认证限流已内置；JWT_SECRET 必须用强随机值
- **种子账号**：`seed:admin` 的密码是 dev 基线明文，生产必须改密
- **HTTPS**：生产部署由反向代理终结 TLS
