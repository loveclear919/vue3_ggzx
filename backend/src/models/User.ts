import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

// phone 字段的校验规则：规则与字段定义同文件（按域归并，而非按「正则」技术归类），改字段时规则就在眼前。
// 前端 vue-project/src/utils/phone.ts 有一份同值副本（语言不同无法共享），修改必须两边同步
export const PHONE_REGEX = /^1[3-9]\d{9}$/

export interface IUser {
  username: string
  phone: string
  password: string
  avatar: string
  desc: string
  roles: mongoose.Types.ObjectId[]
  createdAt: Date
  updatedAt: Date
}

const userSchema = new mongoose.Schema<IUser>(
  {
    username: {
      type: String,
      required: [true, '用户名不能为空'],
      unique: true,
      trim: true,
      minlength: [3, '用户名长度 3-20 个字符'],
      maxlength: [20, '用户名长度 3-20 个字符'],
    },

    phone: {
      type: String,
      required: [true, '手机号不能为空'],
      unique: true,
      trim: true,
      match: [PHONE_REGEX, '手机号格式不正确'],
    },

    password: {
      type: String,
      required: [true, '密码不能为空'],
      minlength: [6, '密码至少 6 位'],
      select: false,
    },

    avatar: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },

    desc: {
      type: String,
      default: '',
      trim: true,
      maxlength: 200,
    },

    roles: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Role',
      default: [],
    },
  },
  {
    timestamps: true,
  },
)

// 保存前自动加密密码
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return

  this.password = await bcrypt.hash(this.password, 10)
})

export const User = mongoose.model<IUser>('User', userSchema)

// 对外返回的用户数据 — 隐藏 password，_id 映射为 userId
// 权限 perms 不在这里：由 controller 调用 rbac 聚合后合并（列表接口不需要逐个聚合，避免 N 次查询）
export function toUserDTO(user: IUser & { _id: unknown }) {
  return {
    userId: String(user._id),
    username: user.username,
    phone: user.phone,
    avatar: user.avatar,
    desc: user.desc,
    roles: user.roles.map(String),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}
