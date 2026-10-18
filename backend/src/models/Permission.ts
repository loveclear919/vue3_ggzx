import mongoose from 'mongoose'

export interface IPermission {
  name: string
  perms: string // 权限标识（非空值唯一）：菜单页 'spu:list'、按钮 'spu:create'；分组菜单与根节点为 ''
  type: 'menu' | 'button' // 同一棵树里区分「能看到的页面」和「能点的按钮」
  parentId: mongoose.Types.ObjectId | null // 自引用父级 —— 树形结构的基础
  sortIndex: number // 兄弟间排序
  path: string // menu 专用：路由地址（绝对路径 '/acl/users'）；按钮与根节点为 ''
  component: string // menu 叶子专用：页面组件路径（'acl/user/index'）；分组/按钮为 ''
  icon: string // menu 专用：Element Plus 图标名（'Lock'）；按钮为 ''
  hidden: boolean // menu 专用：true = 不渲染菜单但可直达（SKU 语义）
  createdAt: Date
  updatedAt: Date
}

const permissionSchema = new mongoose.Schema<IPermission>(
  {
    name: {
      type: String,
      required: [true, '权限名称不能为空'],
      trim: true,
      minlength: [3, '权限名称不能小于 3 个字符'],
      maxlength: [20, '权限名称长度不超过 20 个字符'],
    },
    perms: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [64, '权限标识长度不超过 64 个字符'],
      // 允许空串（分组菜单/根节点）；正则与旧 code 一致但去掉 '/' 路径形态（路径职责已拆给 path 字段）
      match: [/^[a-z0-9_:-]*$/, '权限标识只能包含小写字母、数字、_ : -'],
    },
    type: {
      type: String,
      enum: ['menu', 'button'],
      required: true,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Permission',
      default: null,
    },
    sortIndex: {
      type: Number,
      default: 0,
    },
    path: {
      type: String,
      default: '',
      trim: true,
      maxlength: 64,
      // 空串或 '/' 开头的绝对路径
      match: [/^(\/[a-z0-9/_-]*)?$/, '路由地址需以 / 开头，只能包含小写字母、数字、/ _ -'],
    },
    component: {
      type: String,
      default: '',
      trim: true,
      maxlength: 64,
      match: [/^[a-z0-9_/-]*$/, '组件路径只能包含小写字母、数字、_ / -'],
    },
    icon: {
      type: String,
      default: '',
      trim: true,
      maxlength: 32,
      match: [/^[A-Za-z0-9_-]*$/, '图标名只能包含字母、数字、_ -'],
    },
    hidden: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // 自动生成 createdAt、updatedAt
  },
)

// 复合唯一索引
permissionSchema.index({ parentId: 1, sortIndex: 1 }, { unique: true })

// perms 唯一性：必须是「非空才唯一」的部分索引 —— MongoDB 的 unique 索引把 '' 当普通值，
// 根节点与分组菜单都是 perms:''（多个空串会互撞），需用部分索引排除空串。
// 注意：部分索引不支持 $ne（"Expression not supported in partial index: $not"），
// 用 $gt: '' 等价表达「非空」——perms 只含小写字符，空串是最小值
permissionSchema.index(
  { perms: 1 },
  { unique: true, partialFilterExpression: { perms: { $gt: '' } } },
)

export const Permission = mongoose.model<IPermission>('Permission', permissionSchema)

export function toPermissionDTO(permission: IPermission & { _id: unknown }) {
  return {
    permissionId: String(permission._id),
    name: permission.name,
    perms: permission.perms ?? '',
    type: permission.type,
    parentId: permission.parentId ? String(permission.parentId) : null,
    sortIndex: permission.sortIndex,
    path: permission.path ?? '',
    component: permission.component ?? '',
    icon: permission.icon ?? '',
    hidden: permission.hidden ?? false,
    createdAt: permission.createdAt,
    updatedAt: permission.updatedAt,
  }
}
