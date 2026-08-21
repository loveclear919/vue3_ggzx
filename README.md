# vue3_ggzx 单仓库（Monorepo）改造手册

> 本手册记录如何把「前端独立仓库 + 后端无版本管理」的散装项目，改造成根级 pnpm workspace 单仓库，实现**一条命令启动前后端**。
> 新接触的朋友按下面的步骤顺序执行即可复现，每一步都附有「为什么这么做」。

---

## 一、改造前后对比

| | 改造前 | 改造后 |
|--|--------|--------|
| 版本管理 | 只有 vue-project 有 git，backend 无版本管理 | 根目录一个仓库管全栈 |
| 依赖管理 | 前后端各自 `pnpm install`，两份锁文件 | 一份根级锁文件，依赖提升共享 |
| 启动方式 | 开两个终端、跑两条命令 | 根目录 `pnpm dev` 一条命令 |
| 目录结构 | 嵌套 .git，根目录无法整体管理 | 标准 workspace 布局 |

最终结构：

```
vue3_ggzx/
├── .gitignore              # 忽略 node_modules / .env / dist 等
├── package.json            # 根 package（private），统一脚本入口
├── pnpm-workspace.yaml     # workspace 成员 + allowBuilds 构建白名单
├── pnpm-lock.yaml          # 根级统一锁文件
├── vue-project/            # 前端：Vue 3 + Vite
└── backend/                # 后端：Express 5 + Mongoose
```

**核心概念**：pnpm workspace 通过根目录的 `pnpm-workspace.yaml` 声明哪些目录是工作区成员，所有成员的依赖统一安装到根目录的 `node_modules/.pnpm` 虚拟仓库，成员之间硬链接共享，因此只需一份锁文件。

---

## 二、前置条件

| 环境 | 要求 | 检查命令 |
|------|------|---------|
| Node.js | `^22.18.0 \|\| >=24.12.0` | `node -v` |
| pnpm | `11.21.0` | `pnpm -v` |
| MongoDB | 本地已启动 | `netstat -ano \| grep 27017` |

---

## 三、操作步骤

### 第 1 步：备份旧仓库的 git 历史（最关键的一步）

```bash
cd vue-project
git status -sb                            # 看有没有未推送的提交
git log origin/master..HEAD --oneline     # 列出所有未推送的提交
git stash list                            # 确认没有暂存的工作
git push origin master                    # 把历史全部推到远程
```

**为什么**：后面要删除 `vue-project/.git`，远程仓库是旧历史的唯一保底。必须确认「未推送提交为空 + 无 stash」之后，才能执行删除。本仓库当时有 2 个未推送提交（`10f8ec0`、`d74c715`），先推到了远程（`bb7f4a4..d74c715`）才开始动结构。

### 第 2 步：删除嵌套 .git

```bash
rm -rf vue-project/.git
```

**为什么**：根目录 `git init` 之后，如果子目录里还残留自己的 .git，`git add` 时 git 会把该子目录记录成 **gitlink**（类似 submodule 的指针），里面的文件**根本不会入库**，根仓库就失去了「保存现状」的意义。

### 第 3 步：删除子项目的锁文件和 workspace 配置

```bash
rm vue-project/pnpm-lock.yaml backend/pnpm-lock.yaml
rm vue-project/pnpm-workspace.yaml backend/pnpm-workspace.yaml
```

**为什么**：
- **锁文件**：workspace 模式下锁文件只能有一份、必须在根目录。子项目残留自己的锁文件会被忽略，还会误导后来者。
- **嵌套 pnpm-workspace.yaml**：workspace 成员目录内不允许再有自己的 workspace 声明，否则会被 pnpm 当成「嵌套 workspace」，成员被排除或直接报错。
- ⚠️ 删除前先打开这两个文件，**记录里面的 `allowBuilds` 内容**（第 5 步要合并到根级）。

### 第 4 步：删除旧的 node_modules

```bash
rm -rf vue-project/node_modules backend/node_modules
```

**为什么**：workspace 模式下依赖统一提升到根目录的虚拟仓库，旧的子项目 node_modules 是旧布局的符号链接，保留可能与新布局冲突。node_modules 是纯派生产物，放心删，装回来就行。

### 第 5 步：创建根级配置（3 个文件）

**① `.gitignore`**

```gitignore
node_modules/
dist/
.env
.env.local
*.local
*.log
```

**为什么**：`backend/.env` 里有 `JWT_SECRET` 等敏感信息绝不能入库；node_modules 体积巨大不入库。注意 `.env.development` 这类**不含敏感信息**的配置可以入库（本项目前端三份 env 文件就是随仓库提交的），密钥请放 `.env.local`。

**② `pnpm-workspace.yaml`**

```yaml
packages:
  - 'vue-project'
  - 'backend'

allowBuilds:
  esbuild: true
  '@parcel/watcher': true
```

- `packages`：声明 workspace 成员目录。
- `allowBuilds`：**pnpm 11 的新字段**（旧版 `onlyBuiltDependencies` / `ignoredBuiltDependencies` 已移除）。pnpm 出于安全默认跳过依赖的安装构建脚本，但 `esbuild` 这类需要下载原生二进制的包被跳过后**安装不报错、运行时才报错**。判断哪些包要进白名单的方法：
  1. `pnpm why <包名>` 查依赖链，确认谁在用；
  2. 安装日志里出现 `xxx postinstall` / `xxx install` 即说明有构建脚本；
  3. 迁移时**继承原项目里的既有决定**——本仓库 `esbuild: true` 来自原 backend 的配置；`@parcel/watcher` 原值是个占位符（`set this to true or false`），因其处于 `sass → vite` 依赖链上（前端 scss 编译需要），补为 `true`。

**③ `package.json`**

```json
{
  "name": "ggzx",
  "private": true,
  "packageManager": "pnpm@11.21.0",
  "engines": { "node": "^22.18.0 || >=24.12.0" },
  "scripts": {
    "dev": "pnpm -r --parallel --stream run dev",
    "dev:frontend": "pnpm --filter vue-project run dev",
    "dev:backend": "pnpm --filter backend run dev"
  }
}
```

`dev` 脚本拆解：

| 参数 | 作用 |
|------|------|
| `-r`（递归） | 对 workspace 里**每个声明了该脚本的成员**执行 |
| `--parallel`（并行） | 两个 dev 都是长驻进程，**必须并行**，否则后端会一直阻塞前端 |
| `--stream` | 流式输出子进程日志，每条带包名前缀（`vue-project dev:` / `backend dev:`） |
| `--filter <包名>` | 只对指定成员执行（用于单独启动） |

其他字段：`private: true` 防止误发布到 npm；`packageManager` 固定 pnpm 版本，配合 corepack 保证团队环境一致。

### 第 6 步：初始化根仓库并提交

```bash
git init -b main
git add -A
git status --short        # ⚠️ 检查：确认 node_modules / .env 没有被 add 进来
git commit -m "chore: 建立 pnpm workspace 根级配置与统一锁文件"
```

**为什么**：提交前的 `git status` 检查不能省，这是验证 .gitignore 是否生效的唯一手段。

### 第 7 步：根目录安装依赖

```bash
pnpm install
```

预期结果：

- 根目录生成 `pnpm-lock.yaml`（子项目不再有锁文件）
- 安装日志中 `esbuild postinstall`、`@parcel/watcher install` 正常执行（allowBuilds 生效）
- **锁文件必须提交入库**，保证团队所有人安装结果一致

### 第 8 步：验证

```bash
pnpm dev
```

预期输出：前端 `VITE ready`（http://127.0.0.1:5173）+ 后端 `✅ MongoDB 连接成功` / `服务已启动: http://localhost:3000`。

---

## 四、常见问题（FAQ）

1. **后端起不来**：本仓库后端代码是「先连上 MongoDB 才监听端口」，启动 `pnpm dev` 前先启动本地 MongoDB，否则后端直接退出（前端不受影响）。
2. **安装成功但运行时报找不到原生模块/二进制**：该包的构建脚本被 pnpm 静默跳过了。用 `pnpm why <包名>` 确认依赖链后加入 `allowBuilds: true`，重新 `pnpm install`。
3. **新增依赖后提示 `Ignored build scripts`**：同问题 2，按安装日志提示把需要的包加入 `allowBuilds`。
4. **子项目的 husky 提交钩子失效了**：旧钩子路径存在子项目 `.git/config` 里（`core.hooksPath`），嵌套 .git 删除后自然失效。如需保留提交规范，可在**根级**重装 husky。
5. **为什么根仓库里看不到子项目的提交历史**：这是新仓库，旧历史保留在改造前的远程仓库里（见第 1 步）。

---

## 五、本仓库实际执行记录

| 提交 | 说明 |
|------|------|
| `31c97ce` | 根仓库初始化（first commit，改造前现状） |
| `6450afe` | 根级 workspace 配置 + 统一锁文件 |
| `8f508ab` | 运行后重新生成的 auto-imports 类型声明 |
| `873bbd4` | 本手册 |

改造日期：2026-08-21；pnpm 11.21.0，Node v26.6.0，安装耗时 38.8s / 564 个包。
