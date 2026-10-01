import type { RouteRecordRaw } from 'vue-router'

// 菜单路由（挂在 layout 下）：meta.code 与后端权限树 code 对账（RBAC 三消费方之一），
// 菜单显隐 = 静态路由 ∩ 登录聚合 codes（permission store 过滤，不 addRoute）
// 契约：分组 = children 非空数组；children: [] 视同叶子（保留为可点击项）；叶子 = 无 children 字段。
// 三个消费方（permission store 过滤 / menu 渲染 / 守卫可达性）都按此判定，改一处需三处同步
export const menuRoutes: RouteRecordRaw[] = [
  {
    path: '/home',
    name: 'home',
    component: () => import('@/views/home/index.vue'),
    meta: { title: '首页', icon: 'HomeFilled', hidden: false, code: '/home' },
  },
  {
    path: '/screen',
    name: 'screen',
    component: () => import('@/views/screen/index.vue'),
    meta: { title: '数据大屏', icon: 'Monitor', hidden: false, code: '/screen' },
  },
  {
    path: '/acl',
    name: 'acl',
    redirect: '/acl/users',
    meta: { title: '权限管理', icon: 'Lock', hidden: false, code: '/acl' },
    children: [
      {
        path: '/acl/users',
        name: 'users',
        component: () => import('@/views/acl/user/index.vue'),
        meta: { title: '用户管理', icon: 'User', hidden: false, code: '/acl/users' },
      },
      {
        path: '/acl/roles',
        name: 'roles',
        component: () => import('@/views/acl/role/index.vue'),
        meta: { title: '角色管理', icon: 'UserFilled', hidden: false, code: '/acl/roles' },
      },
      {
        path: '/acl/menus',
        name: 'menus',
        component: () => import('@/views/acl/permission/index.vue'),
        meta: { title: '菜单管理', icon: 'Menu', hidden: false, code: '/acl/menus' },
      },
    ],
  },
  {
    path: '/product',
    name: 'product',
    redirect: '/product/trademark',
    meta: { title: '商品管理', icon: 'Goods', hidden: false, code: '/product' },
    children: [
      {
        path: '/product/trademark',
        name: 'trademark',
        component: () => import('@/views/product/trademark/index.vue'),
        meta: {
          title: '品牌管理',
          icon: 'CollectionTag',
          hidden: false,
          code: '/product/trademark',
        },
      },
      {
        path: '/product/attr',
        name: 'attr',
        component: () => import('@/views/product/attr/index.vue'),
        meta: { title: '属性管理', icon: 'ChromeFilled', hidden: false, code: '/product/attr' },
      },
      {
        path: '/product/spu',
        name: 'spu',
        component: () => import('@/views/product/spu/index.vue'),
        meta: { title: 'SPU管理', icon: 'Management', hidden: false, code: '/product/spu' },
      },
      {
        path: '/product/spu/sku',
        name: 'sku',
        component: () => import('@/views/product/sku/index.vue'),
        // hidden：不渲染菜单但可直达（SPU 页跳转），守卫仍按 code 拦截
        meta: { title: 'SKU管理', hidden: true, code: '/product/spu/sku' },
      },
    ],
  },
]

export const constantRoutes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录', hidden: true },
  },
  {
    path: '/',
    name: 'layout',
    component: () => import('@/layout/index.vue'),
    meta: { title: 'layout', hidden: true },
    children: menuRoutes,
    redirect: '/home',
  },
  {
    path: '/404',
    name: '404',
    component: () => import('@/views/404/index.vue'),
    meta: { title: '404', hidden: true },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    redirect: '/404',
    meta: { title: '未知', hidden: true },
  },
]
