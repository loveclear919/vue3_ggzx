# 动态菜单方案 —— 后端驱动 RBAC + 递归菜单组件

## 一、背景与目标

**现状**：

- [layout/menu/index.vue](../vue-project/src/layout/menu/index.vue) 是占位组件（"你好"）
- 路由是静态的 [routes.ts](../vue-project/src/router/routes.ts)，只有 login / layout+home / 404
- [router/index.ts](../vue-project/src/router/index.ts) 没有路由守卫

**目标**：登录后由**后端按用户权限码返回菜单树**，前端用递归组件渲染侧边菜单，同时把菜单树转成路由 `router.addRoute` 动态注册。换角色菜单自动变、改菜单不用发前端版本 —— 企业级 RBAC（若依 / vben 同款）。

**明确不采用**：前端全量路由表 + 权限码过滤（硅谷甄选模式：routes 存 localStorage、前端 filterAsyncRoutes）。权限数据必须以后端为准，刷新重取。

## 二、技术决策

| 决策点 | 选型 | 理由 |
| --- | --- | --- |
| 菜单数据源 | 后端菜单树，按 `User.routes` 权限码递归过滤后下发 | 权限只存在于后端一处；换角色菜单即时生效 |
| 动态图标 | `@iconify/vue`（新增运行时依赖，约 5KB）+ 已装的 `@iconify-json/ep` 离线数据 | 图标名字符串直接渲染（vben / soybean 同款），不依赖 Iconify CDN |
| 菜单接口 | 独立 `GET /api/user/menus`，不并入 `/info` | 菜单是路由守卫消费的权限数据，用户档案是 UI 数据，缓存粒度/变化频率不同；守卫里与 `/info` 并行 `Promise.all` 不慢 |
| 刷新恢复 | 守卫里重新拉菜单，**不落 localStorage** | 权限变更即时生效，无脏数据 |
| 路由 path | 后端直接下发**绝对路径**（如 `/system/user`） | 省去前端父子路径拼接三种错误源；与现有 routes.ts 绝对子路径写法一致 |

## 三、前后端契约（一次定稿）

```
MenuNode {
  name: string          // 路由 name，全局唯一（addRoute / removeRoute / keep-alive 都靠它）
  path: string          // 绝对路径，如 '/system/user'
  component?: string    // 相对 src/views 的字符串，如 'system/user/index'；纯目录节点省略
  permission?: string   // 【后端内部字段】权限码，出站前 strip，前端类型无此字段
  meta: { title: string; icon?: string; hidden?: boolean; keepAlive?: boolean }
  children?: MenuNode[]
}
```

响应示例（`request.ts` 拦截器 `code === 200` 返回 `res.data`，前端直接拿到数组）：

```json
[
  {
    "name": "home",
    "path": "/home",
    "component": "home/index",
    "meta": { "title": "首页", "icon": "ep:home", "keepAlive": true }
  },
  {
    "name": "system",
    "path": "/system",
    "meta": { "title": "系统管理", "icon": "ep:setting" },
    "children": [
      {
        "name": "systemUser",
        "path": "/system/user",
        "component": "system/user/index",
        "meta": { "title": "用户管理", "icon": "ep:user", "keepAlive": true }
      },
      {
        "name": "systemRole",
        "path": "/system/role",
        "component": "system/role/index",
        "meta": { "title": "角色管理", "icon": "ep:avatar" }
      }
    ]
  }
]
```

## 四、后端改动

### 文件清单

| 文件 | 动作 | 职责 |
| --- | --- | --- |
| `backend/src/config/menus.ts` | 新增 | 菜单树单一数据源 + `MenuNode` 类型 + `DEFAULT_USER_ROUTES` |
| `backend/src/utils/menu.ts` | 新增 | 按权限码递归过滤纯函数，出站 strip `permission` |
| `backend/src/routes/user.ts` | 修改 | 新增 `GET /api/user/menus`（`router.use(auth)` 已覆盖鉴权） |
| `backend/src/routes/auth.ts` | 修改 | 注册时落 `DEFAULT_USER_ROUTES`，否则新用户菜单全空 |
| `backend/src/scripts/seed.ts` | 新增 | seed 一个 `routes: ['*']` 的 admin，验证"全量 vs 受限"对比 |
| `backend/package.json` | 修改 | 加 `"seed": "tsx src/scripts/seed.ts"`（tsx 已在 devDeps） |

### `backend/src/config/menus.ts`

```ts
export interface MenuNode {
  name: string
  path: string          // 绝对路径
  component?: string    // 相对 src/views，如 'system/user/index'；纯目录节点省略
  permission?: string   // 权限码；目录节点未配置时只要有可见子项即保留
  meta: {
    title: string
    icon?: string       // Iconify 图标名，如 'ep:home'
    hidden?: boolean
    keepAlive?: boolean
  }
  children?: MenuNode[]
}

// 新注册用户的默认权限码 —— 模型默认 [] 会让新账号菜单全空、无处可去
export const DEFAULT_USER_ROUTES = ['home']

export const menuTree: MenuNode[] = [
  {
    name: 'home',
    path: '/home',
    component: 'home/index',
    permission: 'home',
    meta: { title: '首页', icon: 'ep:home', keepAlive: true },
  },
  {
    name: 'system',
    path: '/system',
    permission: 'system',
    meta: { title: '系统管理', icon: 'ep:setting' },
    children: [
      {
        name: 'systemUser',
        path: '/system/user',
        component: 'system/user/index',
        permission: 'system:user:list',
        meta: { title: '用户管理', icon: 'ep:user', keepAlive: true },
      },
      {
        name: 'systemRole',
        path: '/system/role',
        component: 'system/role/index',
        permission: 'system:role:list',
        meta: { title: '角色管理', icon: 'ep:avatar' },
      },
    ],
  },
]
```

两层树即可验证递归、子菜单展开、过滤、keep-alive 四件事。

### `backend/src/utils/menu.ts`

```ts
import type { MenuNode } from '../config/menus.js'

export function filterMenusByRoutes(nodes: MenuNode[], routes: string[]): MenuNode[] {
  // 管理员通配：整树放行
  if (routes.includes('*')) return nodes.map(stripPermission)

  const result: MenuNode[] = []

  for (const node of nodes) {
    // 目录：自身权限码命中（未配置则不限制），且过滤后仍有可见子项
    if (node.children) {
      const children = filterMenusByRoutes(node.children, routes)
      const permitted = !node.permission || routes.includes(node.permission)
      if (permitted && children.length > 0) {
        result.push({ ...stripPermission(node), children })
      }
      continue
    }
    // 叶子：自身权限码命中
    if (!node.permission || routes.includes(node.permission)) {
      result.push(stripPermission(node))
    }
  }

  return result
}

// 显式重建节点（避免解构残留变量触发 lint）；children 递归剥离
function stripPermission(node: MenuNode): Omit<MenuNode, 'permission'> {
  const result: Omit<MenuNode, 'permission'> = {
    name: node.name,
    path: node.path,
    meta: node.meta,
  }
  if (node.component) result.component = node.component
  if (node.children) result.children = node.children.map(stripPermission)
  return result
}
```

### `backend/src/routes/user.ts` 新增接口

```ts
// 获取当前用户可见菜单树（按权限码过滤）—— 独立于 /info：菜单是路由守卫消费的权限数据
router.get('/menus', async (req: AuthRequest, res) => {
  const user = await User.findById(req.userId)
  if (!user) throw AppError.notFound('用户不存在')
  res.json({ code: 200, data: filterMenusByRoutes(menuTree, user.routes) })
})
```

### `backend/src/routes/auth.ts` 注册默认权限码

```ts
// 新用户落默认权限码，否则登录后菜单全空
const user = await User.create({ username, password, routes: DEFAULT_USER_ROUTES })
```

### `backend/src/scripts/seed.ts`

```ts
// 初始化全量权限的 admin 账号（密码 admin123，routes: ['*']）
const existing = await User.findOne({ username: 'admin' })
if (existing) {
  existing.routes = ['*']
  await existing.save()          // 走 save() 而不是 findOneAndUpdate，触发 pre-save 密码哈希
} else {
  await User.create({ username: 'admin', password: 'admin123', routes: ['*'] })
}
```

## 五、前端改动

### 文件清单

| 文件 | 动作 | 职责 |
| --- | --- | --- |
| `vue-project/package.json` | 修改 | `pnpm --filter vue-project add @iconify/vue` |
| `vue-project/src/main.ts` | 修改 | `addCollection(ep 离线数据)` + 全局注册 `<Icon>` |
| `vue-project/src/api/menu/type.ts` | 新增 | `MenuMeta` / `MenuNode` 类型（无 permission），与后端响应对齐 |
| `vue-project/src/api/menu/index.ts` | 新增 | `getMenus()` |
| `vue-project/src/types/router.d.ts` | 新增 | `RouteMeta` 类型增强 |
| `vue-project/src/types/global-components.d.ts` | 新增 | 全局 `<Icon>` 组件声明 |
| `vue-project/src/utils/loadView.ts` | 新增 | `component` 字符串 → `import.meta.glob` 懒加载函数 |
| `vue-project/src/router/dynamic.ts` | 新增 | 菜单树 → `RouteRecordRaw[]` |
| `vue-project/src/stores/permission.ts` | 新增 | 菜单状态 + 动态路由注册/重置（**核心**） |
| `vue-project/src/router/routes.ts` | 修改 | 移除 `/home` 静态子路由；layout 加 `redirect: '/home'`；catch-all 改具名导出 |
| `vue-project/src/router/index.ts` | 修改 | 路由守卫 + 文档标题 |
| `vue-project/src/stores/user.ts` | 修改 | `logout()` 里追加 `permissionStore.reset()` |
| `vue-project/src/layout/menu/menu-item.vue` | 新增 | **递归菜单项组件** |
| `vue-project/src/layout/menu/index.vue` | 重写 | 读 permission store 渲染菜单树 |
| `vue-project/src/layout/index.vue` | 修改 | `default-active` 高亮 + main 区 keep-alive |
| `vue-project/src/views/system/user/index.vue` | 新增 | demo 页面（验证 keep-alive 缓存） |
| `vue-project/src/views/system/role/index.vue` | 新增 | demo 页面 |
| `vue-project/src/views/home/index.vue` | 修改 | 加 `defineOptions({ name: 'home' })` |

### main.ts —— 图标离线注册

```ts
import { Icon, addCollection } from '@iconify/vue'
// 已核实：@iconify-json/ep 的 package exports 提供该命名导出（index.mjs 内 re-export icons）
import { icons as epIcons } from '@iconify-json/ep'

addCollection(epIcons)
app.component('Icon', Icon)
```

### `types/router.d.ts` —— RouteMeta 增强

```ts
import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    icon?: string
    hidden?: boolean
    keepAlive?: boolean
  }
}
```

### `types/global-components.d.ts` —— 全局 Icon 声明

```ts
import type { Icon } from '@iconify/vue'

// ⚠️ 不能写进 components.d.ts —— 那是 unplugin-vue-components 自动生成的，会被覆盖
declare module 'vue' {
  export interface GlobalComponents {
    Icon: typeof Icon
  }
}
```

### `utils/loadView.ts`

```ts
import type { Component } from 'vue'

// 收集 src/views 下所有页面 —— key 形如 /src/views/home/index.vue（不是 @/views/...）
const viewModules = import.meta.glob('@/views/**/*.vue') as Record<string, () => Promise<Component>>

export function loadView(component: string) {
  const key = `/src/views/${component}.vue`
  const loader = viewModules[key]
  // noUncheckedIndexedAccess 已开启，loader 可能是 undefined —— 显式 throw 防懒加载白屏无报错
  if (!loader) throw new Error(`菜单 component 没有对应的视图文件: ${component}`)
  return loader
}
```

### `router/dynamic.ts`

```ts
// 菜单树 → 可 addRoute('layout') 的路由记录：目录节点不注册，有 component 的才注册
export function buildDynamicRoutes(nodes: MenuNode[]): RouteRecordRaw[] {
  const records: RouteRecordRaw[] = []
  for (const node of nodes) {
    if (node.component) {
      records.push({
        path: node.path,
        name: node.name,
        component: loadView(node.component),
        meta: node.meta,
      })
    }
    if (node.children?.length) records.push(...buildDynamicRoutes(node.children))
  }
  return records
}
```

### `stores/permission.ts`（核心）

```ts
export const usePermissionStore = defineStore('permission', () => {
  const menuTree = ref<MenuNode[]>([])
  const isLoaded = ref(false)
  const registeredNames: string[] = []   // 已注册的动态路由 name，reset 用

  // 渲染层过滤 hidden；路由注册用完整树（hidden 页面仍可被直接访问）
  const visibleMenuTree = computed(() => stripHidden(menuTree.value))
  // keep-alive include 列表 —— 匹配的是组件 name，页面需 defineOptions({ name }) 与路由 name 一致
  const keepAliveNames = computed(() => collectKeepAlive(menuTree.value))

  function generateRoutes(): Promise<void> {
    if (isLoaded.value) return Promise.resolve()
    if (generating) return generating   // 并发单飞：刷新后首帧可能触发多次 beforeEach

    generating = (async () => {
      try {
        const myEpoch = epoch
        menuTree.value = await getMenus()
        if (myEpoch !== epoch) return    // 拉取期间被 reset（登出），丢弃结果
        const records = buildDynamicRoutes(menuTree.value)
        records.forEach((record) => router.addRoute('layout', record))
        // 动态路由就位后再挂 catch-all，保证兜底 404 永远最后匹配
        router.removeRoute('not-found')
        router.addRoute(catchAllRoute)
        registeredNames.push(...records.map((record) => String(record.name)))
        isLoaded.value = true
      } finally {
        generating = null
      }
    })()

    return generating
  }

  function reset() {
    epoch++
    registeredNames.forEach((name) => router.removeRoute(name))
    registeredNames.length = 0
    menuTree.value = []
    isLoaded.value = false
  }

  return { menuTree, visibleMenuTree, keepAliveNames, isLoaded, generateRoutes, reset }
})

// 模块级：并发单飞 promise + reset 代际计数（登出竞态防护）
let generating: Promise<void> | null = null
let epoch = 0
```

### `router/routes.ts`

```ts
export const constantRoutes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: () => import('@/views/login/index.vue') },
  {
    path: '/',
    name: 'layout',
    component: () => import('@/layout/index.vue'),
    redirect: '/home',   // 首页改由后端菜单下发，这里重定向到默认落地页
    children: [],
  },
  { path: '/404', name: '404', component: () => import('@/views/404/index.vue') },
]

// catch-all 单独导出：动态路由注册完成后由 permission store 挂载，
// 保证兜底 404 永远在动态路由之后匹配
export const catchAllRoute: RouteRecordRaw = {
  path: '/:pathMatch(.*)*',
  name: 'not-found',
  redirect: '/404',
}
```

### `router/index.ts` —— 守卫 + 文档标题

```ts
const WHITE_LIST = ['/login', '/404']

router.beforeEach(async (to) => {
  const userStore = useUserStore()
  const permissionStore = usePermissionStore()

  // 未登录：白名单放行，其余去登录页并记录 redirect
  if (!userStore.token) {
    if (WHITE_LIST.includes(to.path)) return true
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  // 已登录访问登录页 → 回首页
  if (to.path === '/login') return { path: '/' }

  // 动态路由已就绪，放行
  if (permissionStore.isLoaded) return true

  try {
    // 并行拉取用户信息与菜单，注册动态路由
    await Promise.all([userStore.fetchUserInfo(), permissionStore.generateRoutes()])
    // 关键：重新导航让新注册的路由参与本次匹配（否则首跳会落进 404）
    return { ...to, replace: true }
  } catch {
    // 拉取失败 = 登录态失效，清空状态回登录页（提示已由 request 拦截器弹出，不重复弹）
    userStore.logout()
    return { path: '/login', query: { redirect: to.fullPath } }
  }
})

router.afterEach((to) => {
  const base = import.meta.env.VITE_APP_TITLE || '管理后台'
  document.title = to.meta.title ? `${to.meta.title} - ${base}` : base
})
```

### `stores/user.ts` —— logout 联动 reset

```ts
function logout() {
  token.value = ''
  userInfo.value = null
  localStorage.removeItem('token')
  // 清除已注册的动态路由和菜单 —— 否则同会话换账号残留旧路由/菜单，
  // 且 isLoaded 短路导致守卫不再重拉
  usePermissionStore().reset()
}
```

### 递归菜单组件

`layout/menu/menu-item.vue` —— 有 children 渲染 `el-sub-menu` 并递归自身，否则渲染 `el-menu-item`：

```vue
<script setup lang="ts">
import { useRouter } from 'vue-router'
import type { MenuNode } from '@/api/menu/type'

defineProps<{ node: MenuNode }>()

const router = useRouter()
</script>

<template>
  <!-- 目录节点：子菜单 + 递归（script setup 按文件名隐式自引用） -->
  <el-sub-menu v-if="node.children?.length" :index="node.path">
    <template #title>
      <el-icon v-if="node.meta.icon"><Icon :icon="node.meta.icon" /></el-icon>
      <span>{{ node.meta.title }}</span>
    </template>
    <MenuItem v-for="child in node.children" :key="child.path" :node="child" />
  </el-sub-menu>

  <!-- 叶子节点：菜单项 -->
  <el-menu-item v-else :index="node.path" @click="router.push(node.path)">
    <el-icon v-if="node.meta.icon"><Icon :icon="node.meta.icon" /></el-icon>
    <template #title>{{ node.meta.title }}</template>
  </el-menu-item>
</template>
```

`layout/menu/index.vue` —— 读 store 渲染树（hidden 过滤在 `visibleMenuTree` 里完成）：

```vue
<script setup lang="ts">
import { usePermissionStore } from '@/stores/permission'
import MenuItem from './menu-item.vue'

const permissionStore = usePermissionStore()
</script>

<template>
  <template v-for="item in permissionStore.visibleMenuTree" :key="item.path">
    <MenuItem :node="item" />
  </template>
</template>
```

### `layout/index.vue` —— 高亮 + keep-alive

```vue
<script setup lang="ts">
import { useRoute } from 'vue-router'
import { usePermissionStore } from '@/stores/permission'
import Logo from '@/layout/logo/logo.vue'
import Menu from '@/layout/menu/index.vue'

const route = useRoute()
const permissionStore = usePermissionStore()
</script>

<template>
  <!-- el-menu 加 default-active（index 全链路用绝对 path，高亮/展开才生效） -->
  <el-menu class="menu" :default-active="route.path">
    <Menu></Menu>
  </el-menu>

  <!-- main 区：接 keep-alive（注意 slot 解构的 route 改名，避免与上面的 route 冲突） -->
  <router-view v-slot="{ Component, route: currentRoute }">
    <keep-alive :include="permissionStore.keepAliveNames">
      <component :is="Component" :key="currentRoute.path" />
    </keep-alive>
  </router-view>
</template>
```

### demo 页面

```vue
<!-- views/system/user/index.vue —— keep-alive 按组件 name 缓存，必须与路由 name 一致 -->
<script setup lang="ts">
import { ref } from 'vue'

defineOptions({ name: 'systemUser' })

const keyword = ref('')
</script>

<template>
  <div>
    <h2>用户管理</h2>
    <el-input v-model="keyword" placeholder="输入后切走再切回，验证 keep-alive 缓存" style="width: 320px" />
  </div>
</template>
```

`views/system/role/index.vue` 同结构（`defineOptions({ name: 'systemRole' })`）；`views/home/index.vue` 加 `defineOptions({ name: 'home' })`。

## 六、实现顺序

1. **契约定稿**：前后端 `MenuNode` 类型一次定死
2. **后端先行**：menus.ts → utils/menu.ts → /menus → auth.ts 默认码 → seed；完成后用 curl 独立验收，不需要前端参与
3. **前端基础设施**：装 @iconify/vue、main.ts 注册、三个类型声明文件、api/menu
4. **前端路由闭环**（先跑通再美化）：loadView → dynamic.ts → permission store → 守卫。此时登录应能看到菜单、点击跳转、刷新深链正常
5. **UI 细节**：menu-item 递归组件 + layout 高亮/keep-alive + 文档标题 + demo 页面

后端先行的理由：菜单响应形状是整个前端链路（守卫/store/组件）的输入，一旦 shape 定死且可独立 curl 验证，前端联调失败时可以立刻二分定位到前端。

## 七、坑清单（按踩中概率排序）

1. **glob key 规范化**：`import.meta.glob('@/views/**/*.vue')` 返回的 key 形如 `/src/views/home/index.vue`（相对项目根），不是 `@/views/...`。拼错时 loader 为 undefined，懒加载白屏且无直观报错 —— loadView 里显式 throw 兜底
2. **addRoute 时机**：动态路由注册完必须 `return { ...to, replace: true }` 重新导航，否则首次导航仍按旧路由表匹配（走 catch-all 进 404）
3. **并发导航重入**：redirect 链可能在首帧触发多个 beforeEach → permission store 用 `generating` promise 单飞（`isLoaded` 短路 + 生成中复用同一 promise），否则重复 addRoute 同名路由
4. **catch-all 顺序**：generateRoutes 里固定 `removeRoute('not-found')` 再 `addRoute(catchAllRoute)`，显式保证动态静态路由在兜底之前匹配
5. **el-menu index 必须绝对 path**：`default-active` 用 `route.path`，子菜单和菜单项 index 都用 `node.path`，否则高亮/展开双双失效
6. **keep-alive include 匹配组件 name**：`include` 数组是路由 name，但匹配的是组件 `name` option → keepAlive 页面必须 `defineOptions({ name })` 与路由 name 一致，否则缓存静默不生效
7. **目录节点不注册路由**：`component` 省略的节点只渲染 `el-sub-menu`，跳过 addRoute；绝对 path 保证其 children 独立可匹配
8. **登出必须 reset**：`userStore.logout()` 里调 `permissionStore.reset()`（removeRoute 全部动态记录 + 清 menuTree + isLoaded=false），否则换账号残留旧菜单和路由，且 `isLoaded` 为 true 导致守卫不再重拉；reset 用 epoch 代际计数防止"登出时拉取还在路上，结果晚到又写回"的竞态
9. **新注册用户默认权限码**：模型默认 `routes: []` 会让新账号空白菜单 → auth.ts register 写 `DEFAULT_USER_ROUTES`
10. **Icon 全局声明别写进 components.d.ts**：该文件由 unplugin-vue-components 每次构建覆盖，单独建 `src/types/global-components.d.ts`
11. **401 双跳转无害**：request.ts 拦截器 401 时自己 `router.push('/login')`，守卫 catch 分支再 return login —— 同一目标 replace，不重复渲染，无需改拦截器；但 catch 里不要再 ElMessage（拦截器已弹）
12. **响应解包**：拦截器 `code === 200` 时返回 `res.data`，`getMenus()` 直接返回数组，别再 `.data.data`
13. **seed 用 save() 不用 findOneAndUpdate upsert**：显式走 pre-save 中间件，避免 upsert 是否触发密码哈希的歧义

## 八、验证清单

### 后端

```bash
pnpm --filter backend dev        # 启动
pnpm --filter backend seed       # 造 admin（admin / admin123，routes: ['*']）
```

```bash
# 分别用 admin 与新注册用户（默认 ['home']）的 token 对比菜单树过滤与 permission 剥离
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/user/menus
```

预期：admin 返回两层完整树；新用户只返回 home；响应里无 `permission` 字段。

### 前端

`pnpm --filter vue-project dev` 手测清单：

1. 登录 → 侧边菜单渲染（图标/标题），admin 见两层树，新用户只见首页
2. 点击菜单跳转、`default-active` 高亮跟随、子菜单自动展开
3. 深链刷新（如 /system/user）不 404、菜单正常
4. keep-alive：user 页输入内容 → 切走 → 切回内容还在
5. 无 token 访问 /home → 重定向登录且带 redirect；登录后回到原页面
6. 登出 → 再登另一个账号 → 菜单随之切换（无残留）
7. 乱输 URL → 404 页；标签页标题 = `页面 - 硅谷甄选运营平台`

### 门禁

```bash
pnpm --filter vue-project type-check   # pre-push 会拦
pnpm --filter vue-project lint
```

## 九、后续演进（不在本次范围）

- 菜单树迁入 MongoDB 集合 + 菜单管理界面（权限模型不变，只换数据源）
- 角色模型：`routes` 权限码挂到 Role，用户挂 Role（当前是权限码直接挂 User）
- 面包屑 / tabbar 联动（可从 `route.matched` + menuTree 推导）
- 侧边栏折叠（当前固定 260px）
