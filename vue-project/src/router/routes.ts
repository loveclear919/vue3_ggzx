export const menuRoutes = [
  {
    path: '/home',
    name: 'home',
    component: () => import('@/views/home/index.vue'),
    meta: { title: '首页', icon: 'HomeFilled', hidden: false },
  },
  {
    path: '/screen',
    name: 'screen',
    component: () => import('@/views/screen/index.vue'),
    meta: { title: '数据大屏', icon: 'Monitor', hidden: false },
  },
  {
    path: '/acl',
    name: 'acl',
    redirect: '/acl/users',
    meta: { title: '权限管理', icon: 'Lock', hidden: false },
    children: [
      {
        path: '/acl/users',
        name: 'users',
        component: () => import('@/views/acl/user/index.vue'),
        meta: { title: '用户管理', icon: 'User', hidden: false },
      },
      {
        path: '/acl/roles',
        name: 'roles',
        component: () => import('@/views/acl/role/index.vue'),
        meta: { title: '角色管理', icon: 'UserFilled', hidden: false },
      },
      {
        path: '/acl/menus',
        name: 'menus',
        component: () => import('@/views/acl/permission/index.vue'),
        meta: { title: '菜单管理', icon: 'Menu', hidden: false },
      },
    ],
  },
  {
    path: '/product',
    name: 'product',
    redirect: '/product/trademark',
    meta: { title: '商品管理', icon: 'Goods', hidden: false },
    children: [
      {
        path: '/product/trademark',
        name: 'trademark',
        component: () => import('@/views/product/trademark/index.vue'),
        meta: { title: '品牌管理', icon: 'CollectionTag', hidden: false },
      },
      {
        path: '/product/attr',
        name: 'attr',
        component: () => import('@/views/product/attr/index.vue'),
        meta: { title: '属性管理', icon: 'ChromeFilled', hidden: false },
      },
      {
        path: '/product/spu',
        name: 'spu',
        component: () => import('@/views/product/spu/index.vue'),
        meta: { title: 'SPU管理', icon: 'Management', hidden: false },
      },
      {
        path: '/product/sku',
        name: 'sku',
        component: () => import('@/views/product/sku/index.vue'),
        meta: { title: 'SKU管理', icon: 'List', hidden: false },
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
