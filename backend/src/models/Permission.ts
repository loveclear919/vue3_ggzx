import mongoose from 'mongoose'

export interface IPermission {
  name: string
  code: string // 权限标识（唯一索引）：路由 = 前端路径（/product/spu），按钮 = 资源:动作（user:delete）
  type: 'menu' | 'button' // 同一棵树里区分「能看到的页面」和「能点的按钮」
  parentId: mongoose.Types.ObjectId | null // 自引用父级 —— 树形结构的基础
  sortIndex: number // 兄弟间排序
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
    code: {
      type: String,
      required: [true, '权限code不能为空'],
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: [64, '权限 code 长度不超过 64 个字符'],
      match: [/^[a-z0-9_:/-]+$/, '权限code只能包含小写字母、数字、_ : / -'],
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
  },
  {
    timestamps: true, // 自动生成 createdAt、updatedAt
  },
)

// 复合唯一索引
permissionSchema.index({ parentId: 1, sortIndex: 1 }, { unique: true })
export const Permission = mongoose.model<IPermission>('Permission', permissionSchema)

export function toPermissionDTO(permission: IPermission & { _id: unknown }) {
  return {
    permissionId: String(permission._id),
    name: permission.name,
    code: permission.code,
    type: permission.type,
    parentId: permission.parentId ? String(permission.parentId) : null,
    sortIndex: permission.sortIndex,
    createdAt: permission.createdAt,
    updatedAt: permission.updatedAt,
  }
}
