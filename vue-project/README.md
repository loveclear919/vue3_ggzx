# Vue 3 项目

## 技术栈

| 类别     | 技术                   |
| -------- | ---------------------- |
| 框架     | Vue 3.5 + TypeScript 6 |
| 构建     | Vite 8                 |
| 状态管理 | Pinia 4                |
| 路由     | Vue Router 5           |
| 包管理器 | pnpm 11                |
| Node     | ^22.18 \|\| >=24.12    |

---

## 环境配置总结

### 一、代码格式化 — Prettier

**为什么要配置？**

团队每个人代码风格不同（有人加逗号有人不加，有人用单引号有人用双引号），导致 PR diff 混乱、Code Review 困难。Prettier 统一格式化规则，一键搞定。

**配置文件：** [.prettierrc.json](./.prettierrc.json)

**格式化规则：** 单引号、无分号、100 字符宽度

**使用方法：**

```bash
pnpm run format
```

---

### 二、代码检查 — oxlint + ESLint

**为什么要配置？**

格式化只管"长什么样"，不管"写得对不对"。oxlint 负责抓未用变量、类型错误等正确性问题，速度是 ESLint 的 50-100 倍。

**配置文件：** [.oxlintrc.json](./.oxlintrc.json)、[eslint.config.ts](./eslint.config.ts)

**使用方法：**

```bash
pnpm run lint           # oxlint + ESLint 一起跑
pnpm run lint:oxlint    # 只跑 oxlint（超快）
pnpm run lint:eslint    # 只跑 ESLint（补充规则）
```

---

### 三、Git 提交门禁 — Husky + lint-staged

**为什么要配置？**

开发者可能忘记跑 lint 就提交了脏代码。Husky 在 `git commit` 时自动拦截，lint-staged 只检查本次改的文件。

**配置文件：** [仓库根 .husky/pre-commit](../.husky/pre-commit)、[package.json](./package.json) 中的 `lint-staged` 字段（lint-staged 留在本包，由根钩子 `pnpm --filter vue-project exec lint-staged` 调用）

**触发规则：**
| 文件类型 | 自动执行
| `*.{vue,ts,tsx,mts}` | oxlint → Prettier
| `*.{json,md,css,html}` | Prettier

配置项（写在 workspace 根 package.json）
"scripts": { "prepare": "husky" }
prepare 是 pnpm 的生命周期脚本：在 pnpm install 之后自动执行。
⚠️ pnpm workspace 只会执行根包的 prepare，所以 husky 依赖与 .husky/ 必须放在仓库根。

链条
你提交到 git 的文件： .husky/pre-commit ← 你写的钩子逻辑（团队共享，仓库根）
↓
prepare 时 husky 生成：.husky/_/pre-commit ← 一个"垫片"，负责调用上面那个
↓
git 执行钩子时： core.hooksPath 指向 .husky/_ → 找到垫片 → 执行你的脚本

---

### 四、提交信息规范 — commitlint

**为什么要配置？**

`git log` 看到一堆"修改"、"fix bug"根本不知道改了啥。Conventional Commits 强制写前缀，配合工具能自动生成 Changelog。

**配置文件：** [仓库根 commitlint.config.ts](../commitlint.config.ts)、[仓库根 .husky/commit-msg](../.husky/commit-msg)

**Commit 格式：**

```bash
feat: 新增登录页       ✅
fix: 修复导航栏高度     ✅
chore: 升级依赖        ✅
修了一下               ❌ 被拦截
```

**允许的 type：**

| type | 含义
| `feat` | 新功能
| `fix` | 修 Bug
| `docs` | 文档变更
| `style` | 格式调整
| `refactor` | 重构
| `perf` | 性能优化
| `test` | 测试
| `chore` | 杂项（依赖、构建）
| `ci` | CI/CD 变更
| `build` | 构建系统变更
| `revert` | 回滚

---

### 五、推送门禁 — pre-push 类型检查

**为什么要配置？**

即使格式对、lint 过、commit 规范，TypeScript 类型错误也可能漏网。pre-push 在 `git push` 前跑类型检查，防止错误进入远程仓库。

**配置文件：** [仓库根 .husky/pre-push](../.husky/pre-push)

**使用方法：** `git push` 时自动触发，类型报错则阻止 push。

---

### 六、包管理器锁定 — packageManager

**为什么要配置？**

团队里不同人用不同包管理器（pnpm / npm / yarn），同一个依赖可能解析出不同版本，导致"我这能跑啊"的幽灵 bug。

**配置：** [根 package.json](../package.json) 中的 `packageManager` 字段（monorepo 只需在根声明一次，子包无需重复）

**效果：**

- Corepack 环境下按声明自动启用 pnpm@11.21.0，使用 npm/yarn 会被拦截
- 非 Corepack 环境（如全局独立安装的 pnpm）仅作版本声明

---

### 七、SVG 图标管理 — unplugin-icons + unplugin-vue-components

**为什么要配置？**

传统方式需要手动下载 SVG 文件放到项目中，管理麻烦。这套方案提供 20 万+ 在线图标，模板里直接写组件标签即可，零 import、按需加载。

**依赖：**

```bash
pnpm add -D unplugin-icons unplugin-vue-components @iconify/json
```

**配置文件：** [vite.config.ts](./vite.config.ts) + [env.d.ts](./env.d.ts)

**使用方法 — 三步走：**

```bash
# 1. 打开 https://icones.js.org
# 2. 左侧搜索图标集（如 Element Plus），鼠标悬停复制图标名
# 3. 模板中直接使用
```

```vue
<template>
  <!-- 规则：{prefix}-{图标集}-{图标名} -->
  <icon-ep-search />
  <!-- Element Plus 搜索 -->
  <icon-ep-delete />
  <!-- Element Plus 删除 -->
  <icon-mdi-home />
  <!-- Material Design 首页（需删除 enabledCollections 限制） -->
</template>

<script setup lang="ts">
// 什么都不用 import，零行代码
</script>
```

**修改图标样式：**

```vue
<template>
  <icon-ep-search class="icon" style="color: blue" />
</template>

<style scoped>
.icon {
  width: 32px; /* 尺寸 */
  height: 32px;
  color: #409eff; /* 颜色 */
}
.icon:hover {
  color: #66b1ff; /* 悬停变色 */
}
</style>
```

| 效果 | 属性                              |
| ---- | --------------------------------- |
| 大小 | `width` / `height` 或 `font-size` |
| 颜色 | `color`                           |
| 旋转 | `transform: rotate(90deg)`        |

---

## 全局流程图

```
git add 改的文件
     │
     ▼
git commit
     │
     ├── pre-commit → lint-staged → oxlint + prettier
     │                    │
     │               ┌───┴───┐
     │              ✅      ❌ → 拦截
     │                │
     ├── commit-msg → commitlint（feat:/fix:/chore:）
     │                    │
     │               ┌───┴───┐
     │              ✅      ❌ → 拦截
     │                │
     ▼
 ✅ commit 成功
     │
     ▼
git push
     │
     ├── pre-push → vue-tsc（类型检查）
     │                    │
     │               ┌───┴───┐
     │              ✅      ❌ → 拦截
     │                │
     ▼
 ✅ push 成功
```

---

## 配置文件速查

### 全部配置一览

| 文件                                            | 管什么                 | 一句话                                                    |
| ----------------------------------------------- | ---------------------- | --------------------------------------------------------- |
| [package.json](./package.json)                  | 依赖、脚本             | 项目入口：装什么、跑什么（包管理器锁定在根 package.json） |
| [vite.config.ts](./vite.config.ts)              | Vite 构建配置          | 插件注册、路径别名 `@`、图标自动引入                      |
| [tsconfig.json](./tsconfig.json)                | TS 根配置              | 引用子配置 + IDE 类型提示                                 |
| [tsconfig.app.json](./tsconfig.app.json)        | TS 编译规则            | 实际编译 `src/` 的规则 + `@` 路径映射                     |
| [tsconfig.node.json](./tsconfig.node.json)      | TS Node 端规则         | `vite.config.ts` 等 Node 端文件编译                       |
| [eslint.config.ts](./eslint.config.ts)          | ESLint 规则            | Vue + TS + oxlint 代码质量检查                            |
| [.oxlintrc.json](./.oxlintrc.json)              | oxlint 规则            | 极速 Lint，pre-commit 时毫秒级通过                        |
| [.prettierrc.json](./.prettierrc.json)          | 格式化规则             | 单引号、无分号、100 宽                                    |
| [.prettierignore](./.prettierignore)            | 格式化黑名单           | dist、node_modules 不格式化                               |
| [.editorconfig](./.editorconfig)                | 编辑器行为             | 缩进、换行符、编码 —— 写代码时的第一道防线                |
| [.gitattributes](./.gitattributes)              | Git 换行符             | commit 时自动转 LF —— 第二道防线                          |
| [.gitignore](./.gitignore)                      | Git 忽略               | node_modules、dist 不进仓库                               |
| [commitlint.config.ts](../commitlint.config.ts) | Commit 规范（仓库根）  | `feat:`/`fix:`/`chore:` —— 乱写会被拦                     |
| [env.d.ts](./env.d.ts)                          | TS 类型声明            | 让 TS 认识 `.vue`、`~icons/`、`import.meta.env`           |
| [.env.development](./.env.development)          | 开发环境变量           | `pnpm dev` 时加载                                         |
| [.env.production](./.env.production)            | 生产环境变量           | `pnpm build` 时加载                                       |
| [.env.test](./.env.test)                        | 测试环境变量           | `pnpm build:test` 时加载                                  |
| [.husky/pre-commit](../.husky/pre-commit)       | 提交前钩子（仓库根）   | 自动跑 oxlint + prettier                                  |
| [.husky/commit-msg](../.husky/commit-msg)       | 提交信息钩子（仓库根） | 自动跑 commitlint                                         |
| [.husky/pre-push](../.husky/pre-push)           | 推送前钩子（仓库根）   | 自动跑类型检查                                            |

### 按工作流程

```
写代码时     .editorconfig  →  .prettierrc  →  eslint.config.ts + .oxlintrc.json
保存时       Prettier（VS Code 插件自动格式化）
git commit   pre-commit（lint-staged）→  commit-msg（commitlint）
git push     pre-push（type-check）
打包时       vite.config.ts  →  tsconfig.app.json  →  .env.production
```

### 按防线

| 防线      | 文件                                    | 拦截什么              |
| --------- | --------------------------------------- | --------------------- |
| 编辑器    | `.editorconfig`                         | 缩进混乱、编码问题    |
| Linter    | `.oxlintrc.json` `eslint.config.ts`     | 未用变量、语法错误    |
| Formatter | `.prettierrc.json`                      | 引号、分号、换行      |
| Git 提交  | `.husky/pre-commit` `.husky/commit-msg` | 脏代码、不规范 commit |
| Git 推送  | `.husky/pre-push`                       | 类型错误              |
| Git 存储  | `.gitattributes` `.gitignore`           | 换行符混乱、无用文件  |

---

## 新成员入职

```bash
# 1. 克隆仓库
git clone https://gitee.com/fool12138/vue3__.git

# 2. 安装依赖（自动启用 Git hooks）
pnpm install

# 3. 启动开发
pnpm run dev
```

无需手动配置任何东西，`pnpm install` 后一切就绪。

# 命令作用

"dev": "vite", // 启动开发服务器（热更新）
"build": "run-p type-check \"build-only {@}\" --", // 生产构建（先检查类型再打包）
"format": "prettier --write src/", // 格式化代码
"preview": "vite preview", // 预览生产构建结果
"build-only": "vite build", // 只打包，不检查类型
"type-check": "vue-tsc --build", // 只检查 TypeScript 类型
"lint": "run-s \"lint:*\"", // 依次跑 oxlint + eslint
"lint:oxlint": "oxlint . --fix", // 快速 lint 检查
"lint:eslint": "eslint . --fix --cache", // ESLint 补充检查
"prepare": "husky" // [自动] pnpm install 时激活 Git hooks
