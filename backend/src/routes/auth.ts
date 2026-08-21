import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { User, toUserDTO } from '../models/User.js'
import bcrypt from 'bcryptjs'

const router = Router()

// 注册
router.post('/register', async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    res.status(400).json({ code: 400, message: '用户名和密码不能为空' })
    return
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
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000) {
      res.status(409).json({ code: 409, message: '用户名已存在' })
      return
    }
    throw err
  }
})

// 登录
router.post('/login', async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    res.status(400).json({ code: 400, message: '用户名和密码不能为空' })
    return
  }

  // select('+password') 因为模型里设了 select: false
  const user = await User.findOne({ username }).select('+password')
  if (!user) {
    res.status(401).json({ code: 401, message: '用户名或密码错误' })
    return
  }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    res.status(401).json({ code: 401, message: '用户名或密码错误' })
    return
  }

  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET!, { expiresIn: '7d' })

  res.json({
    code: 200,
    data: { token, user: toUserDTO(user) },
    message: '登录成功',
  })
})

export default router
