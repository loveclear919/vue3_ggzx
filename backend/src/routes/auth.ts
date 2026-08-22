import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { User, toUserDTO } from '../models/User.js'
import bcrypt from 'bcryptjs'
import { AppError } from '../utils/AppError.js'

const router = Router()

// 注册
router.post('/register', async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    throw AppError.badRequest('用户名和密码不能为空')
  }

  try {
    const user = await User.create({ username, password })
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET!, { expiresIn: '7d' })

    res.json({
      code: 200,
      data: { token, user: toUserDTO(user) },
      message: '注册成功',
    })
  } catch (err: unknown) {
    // Mongo 11000 重复键错误 → 转成预期错误
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000) {
      throw AppError.conflict('用户名已存在')
    }
    throw err
  }
})

// 登录
router.post('/login', async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    throw AppError.badRequest('用户名和密码不能为空')
  }

  // select('+password') 因为模型里设了 select: false
  const user = await User.findOne({ username }).select('+password')
  // 用户不存在与密码错误用同一文案，防止用户枚举
  if (!user) {
    throw AppError.unauthorized('用户名或密码错误')
  }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    throw AppError.unauthorized('用户名或密码错误')
  }

  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET!, { expiresIn: '7d' })

  res.json({
    code: 200,
    data: { token, user: toUserDTO(user) },
    message: '登录成功',
  })
})

export default router
