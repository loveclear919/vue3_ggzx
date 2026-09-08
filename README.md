# vue3_ggzx

基于 Vue 3 + Express 5 的全栈运营管理后台（前端为主），pnpm monorepo 单仓库管理前后端。

## ✨ 已实现功能

**用户认证**

- 注册 / 登录（bcrypt 加盐哈希 + JWT，7 天有效期）
- 登录态持久化：token 存 localStorage，刷新页面不丢失
- 获取当前用户信息 / 更新用户信息（服务端白名单字段 + 长度校验）

**安全加固**

- helmet 安全响应头、认证接口限流（express-rate-limit）
- 防用户名枚举（登录失败统一错误文案）、密码字段 DTO 脱敏，任何接口不返回密码哈希
- 统一错误处理中间件，前端 axios 拦截器统一提示，401 自动清登录态跳转登录页

**前端体验**

- 登录 / 注册双表单卡片翻转切换，表单校验 + 操作结果通知
- Element Plus 按需引入 + 中文语言包、图标自动引入、多环境构建（dev / test / prod）

> 首页等业务页面开发中，边开发边更新本清单。

## 🛠 技术栈

|层      |技术
----------------------------------------------------------------------------- 
| 前端   | Vue 3.5 / TypeScript / Vite 8 / Pinia / Vue Router 5 / Element Plus / Sass    |
| 后端   | Node.js / Express 5 / Mongoose / JWT / bcryptjs                               |
| 工程化 | pnpm monorepo / oxlint + ESLint / Prettier / Husky + lint-staged / Commitlint |

## 📦 目录结构

```
vue3_ggzx
├── backend/                    # Express 5 后端（端口 3000）
│   ├── src/
│   │   ├── config/             #   MongoDB 连接
│   │   ├── models/             #   User 模型（bcrypt 加盐、DTO 脱敏）
│   │   ├── routes/             #   接线层：URL/方法 → controller（不含业务）
│   │   ├── controllers/        #   处理层：解析参数、组装响应
│   │   ├── services/           #   业务层：查库、bcrypt、JWT、业务规则
│   │   ├── middlewares/        #   JWT 鉴权、统一错误处理、限流
│   │   ├── utils/              #   AppError 业务错误、统一响应封装
│   │   └── index.ts            #   入口（helmet/cors/路由挂载）
│   └── .env.example            #   环境变量模板（复制为 .env 使用）
├── vue-project/                # Vue 3 前端（端口 5173，/api 代理到后端）
│   ├── src/
│   │   ├── api/                #   接口层（enum 统一管理 + 类型化）
│   │   ├── router/             #   路由（login / home / 404）
│   │   ├── stores/             #   Pinia（user store：token 持久化）
│   │   ├── utils/              #   axios 封装（token 注入、统一错误、401 处理）
│   │   ├── views/              #   login / home / 404
│   │   ├── components/         #   公共组件
│   │   └── styles/             #   全局样式（reset + 变量）
│   └── .env.example            #   环境变量模板（另有 .env.development/production/test）
├── .husky/                     # git 钩子（pre-commit lint-staged / commit-msg / pre-push）
├── commitlint.config.ts        # commit 信息规范（仓库级）
├── pnpm-workspace.yaml         # workspace 定义 + 构建脚本白名单
└── package.json                # 根：统一脚本、包管理器锁定、husky 依赖
```

## 🚀 快速开始

1. **环境要求**：Node `^22.18.0 || >=24.12.0`、pnpm 11、本地 MongoDB
2. **安装依赖**：`pnpm install`
3. **配置后端环境变量**：`cp backend/.env.example backend/.env`，填入 `MONGODB_URI` 与随机 `JWT_SECRET`（生成命令见模板内注释）
4. **启动**：`pnpm dev`（并行启动前后端）
5. 打开 http://127.0.0.1:5173 （前端），后端接口 http://localhost:3000/api

## 📸 截图

## 📄 常用命令

在仓库根目录执行：

| 命令                                     | 作用                   |
| ---------------------------------------- | ---------------------- |
| `pnpm dev`                               | 并行启动前后端开发服务 |
| `pnpm dev:frontend` / `pnpm dev:backend` | 单独启动前端 / 后端    |
| `pnpm --filter backend run seed`         | 写入商品三级分类种子数据（幂等，先清空再写入） |

在前端包（`vue-project/`）内：

| 命令                                  | 作用                     |
| ------------------------------------- | ------------------------ |
| `pnpm build`                          | 类型检查 + 生产构建      |
| `pnpm build:prod` / `pnpm build:test` | 按生产 / 测试环境构建    |
| `pnpm lint`                           | oxlint + ESLint 代码检查 |
| `pnpm type-check`                     | TypeScript 类型检查      |

提交即触发门禁：pre-commit 自动 lint + 格式化本次改动文件，commit-msg 校验 Conventional Commits 规范（`feat:` / `fix:` / `chore:` …）。

## 📚 更多
工程配置细节（格式化规则、hook 机制、环境变量说明等）见 [vue-project/README.md](vue-project/README.md)。
