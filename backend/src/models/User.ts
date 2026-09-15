import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

export interface IUser {
  username: string
  password: string
  avatar: string
  desc: string
  roles: string[]
  buttons: string[]
  routes: string[]
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
      // 长度边界与前端注册表单对齐（3-20）：后端兜底，绕过前端直调 API 也在模型层被拦
      minlength: [3, '用户名长度 3-20 个字符'],
      maxlength: [20, '用户名长度 3-20 个字符'],
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
      type: [String],
      default: ['user'],
    },

    buttons: {
      type: [String],
      default: [],
    },

    routes: {
      type: [String],
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
export function toUserDTO(user: IUser & { _id: unknown }) {
  return {
    userId: String(user._id),
    username: user.username,
    avatar: user.avatar,
    desc: user.desc,
    roles: user.roles,
    buttons: user.buttons,
    routes: user.routes,
  }
}
