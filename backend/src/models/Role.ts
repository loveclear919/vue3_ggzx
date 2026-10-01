import mongoose from 'mongoose'

export interface IRole {
  roleName: string
  remark: string
  permissions: mongoose.Types.ObjectId[]
  // 内置角色标记：特权保护的模型事实（不可改名/删除、授予/撤销需持 role:grant-super），不依赖名字约定
  builtin: boolean
  createdAt: Date
  updatedAt: Date
}

const roleSchema = new mongoose.Schema<IRole>(
  {
    roleName: {
      type: String,
      required: [true, '角色名不能为空'],
      unique: true,
      trim: true,
      minlength: [3, '角色名长度 3-20 个字符'],
      maxlength: [20, '角色名长度 3-20 个字符'],
    },
    remark: {
      type: String,
      default: '',
      trim: true,
      maxlength: [200, '描述不能超过200个字符'],
    },
    permissions: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Permission',
      default: [],
    },
    builtin: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
)

export const Role = mongoose.model<IRole>('Role', roleSchema)

export function toRoleDTO(role: IRole & { _id: unknown }) {
  return {
    roleId: String(role._id),
    roleName: role.roleName,
    remark: role.remark,
    // ?? []：存量角色文档可能没有 permissions 键（权限模块落地前创建），不能假定形状
    permissions: (role.permissions ?? []).map(String),
    builtin: role.builtin,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  }
}

// 默认角色名：注册 / 管理端新增用户未指定角色时兜底分配
export const DEFAULT_ROLE_NAME = 'user'
