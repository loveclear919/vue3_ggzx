import type { Component } from 'vue'
import {
  HomeFilled,
  Lock,
  Menu,
  User,
  UserFilled,
  Monitor,
  Goods,
  CollectionTag,
  ChromeFilled,
  Management,
  List,
} from '@element-plus/icons-vue'

export const iconMap: Record<string, Component> = {
  HomeFilled, // 首页
  Lock, // 权限管理
  User, // 用户管理
  UserFilled, // 角色管理
  Menu, // 菜单管理
  Monitor, // 数据大屏
  Goods, // 商品管理
  CollectionTag, // 品牌管理
  ChromeFilled, // 属性管理
  Management, // SPU管理
  List, // SKU管理
}

/** 取图标组件：未登记或空值回退到 Menu，避免渲染时报错 */
export function getMenuIcon(icon?: string): Component {
  return (icon && iconMap[icon]) || Menu
}
