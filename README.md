# vue3_ggzx 单仓库（Monorepo）

前后端统一由根目录 pnpm workspace 管理，一条命令启动全栈。

## 项目结构

```
vue3_ggzx/
├── .gitignore              # 忽略 node_modules / .env / dist 等
├── package.json            # 根 package（private），统一脚本入口
├── pnpm-workspace.yaml     # workspace 成员 + allowBuilds 构建白名单
├── pnpm-lock.yaml          # 根级统一锁文件（子项目不再有锁文件）
├── vue-project/            # 前端：Vue 3 + Vite + Element Plus + Pinia
└── backend/                # 后端：Express 5 + Mongoose + tsx
```

## 环境要求

| 项 | 版本 |
|----|------|
| Node.js | `^22.18.0 \|\| >=24.12.0`（当前 v26.6.0） |
| pnpm | `11.21.0`（packageManager 已锁定，可用 corepack 自动切换） |
| MongoDB | 本地需先启动（后端连接成功后才监听端口） |

## 常用命令

在**根目录**执行：

```bash
pnpm install           # 安装全部依赖（锁文件统一到根）
pnpm dev               # 一条命令同时启动前后端
pnpm dev:frontend      # 只启动前端（vite，http://127.0.0.1:5173）
pnpm dev:backend       # 只启动后端（express，http://localhost:3000）
```

> `pnpm dev` 实际执行 `pnpm -r --parallel --stream run dev`：并行递归运行所有子项目的 `dev` 脚本，输出带包名前缀。

## allowBuilds 配置依据

pnpm 11 移除了旧版 `onlyBuiltDependencies`，统一使用 `pnpm-workspace.yaml` 顶层的 `allowBuilds` 映射（`true` = 允许执行安装构建脚本；`false` = 忽略）。**不在白名单里的原生包会被静默跳过构建，安装不报错、运行时才报错**。

| 包 | 值 | 依据 |
|----|----|------|
| `esbuild` | `true` | `tsx`（后端）与 `vite`（前端）的底层依赖；postinstall 下载平台二进制，不允许则启动报错 |
| `@parcel/watcher` | `true` | 依赖链 `sass → vite`（前端 scss 编译）；原生模块，install 脚本编译原生绑定 |
| ~~`msw`~~ | ~~`false`~~ | 原 vue-project 配置中遗留，经 `pnpm why msw` 确认不在依赖图中，已移除 |

> 迁移前 `@parcel/watcher` 的值是 pnpm 生成的占位符 `set this to true or false`（非法值），迁移时补齐为 `true`。

## 迁移记录（2026-08-21）

将「vue-project 独立 git 仓库 + backend 无仓库」迁移为根级 pnpm workspace 单仓库。

### 操作步骤

1. **备份旧 git 历史**：vue-project 当时有 2 个未推送提交（`10f8ec0`、`d74c715`），先 `git push` 到 gitee（`bb7f4a4..d74c715`），确认历史安全后才动本地仓库
2. **移除嵌套 .git**：删除 `vue-project/.git`（根仓库接管版本管理；不删会被当作 gitlink，文件存不进根仓库）
3. **删除子项目锁文件与 workspace 配置**：`vue-project/pnpm-lock.yaml`、`backend/pnpm-lock.yaml` 及各自的 `pnpm-workspace.yaml`（其中 allowBuilds 内容先合并到根级再删）
4. **删除旧 node_modules**：避免与根级虚拟仓库（`node_modules/.pnpm`）布局冲突，全新安装
5. **创建根级配置**：`.gitignore`（忽略 node_modules / .env——backend/.env 含 JWT_SECRET，不入库）、`package.json`（private + dev 脚本）、`pnpm-workspace.yaml`（packages + allowBuilds）
6. **初始化根仓库**：git init（main 分支，远程 GitHub），初始提交 `31c97ce`
7. **根目录 pnpm install**：38.8s，564 个包，生成根级 `pnpm-lock.yaml`；esbuild 与 @parcel/watcher 构建脚本按白名单执行
8. **验证**：`pnpm dev` 实测 vite（5173）与 express（3000）同时启动、MongoDB 连接成功

### 提交记录

| 提交 | 说明 |
|------|------|
| `31c97ce` | first commit（迁移前现状） |
| `6450afe` | 根级 workspace 配置 + 统一锁文件 |
| `8f508ab` | 运行后重新生成的 auto-imports 类型声明 |

### 遗留事项

- [ ] 根仓库当时有 2 个提交未推送，需 `git push -u origin main`
- [ ] vue-project 的 husky 钩子（pre-commit / commit-msg / pre-push）随旧 .git 失效，如需保留提交规范可在**根级**重装 husky
- [ ] `@types/bcryptjs` 已废弃、peer 依赖冲突待处理（`pnpm peers check` 查看）
- [ ] `vue-project prepare` 脚本因嵌套 .git 删除而报 `.git can't be found`，属预期，可忽略或上移 husky 时一并处理

## 注意事项

- 后端逻辑为「先连 MongoDB 成功才监听端口」，启动 `pnpm dev` 前务必先启动本地 MongoDB，否则后端直接退出（前端不受影响）
- 前端各环境的 `.env.development` / `.env.production` / `.env.test` 不含敏感信息，随仓库提交；本地密钥类配置请使用 `.env.local`（已被忽略）
