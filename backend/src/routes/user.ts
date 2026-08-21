import { Router } from 'express'
import { auth, AuthRequest } from '../middlewares/auth.js'
import { User, toUserDTO } from '../models/User.js'

const router = Router()

// 所有用户接口都需要登录
router.use(auth)

// 获取当前用户信息
router.get('/info', async (req: AuthRequest, res) => {
  const user = await User.findById(req.userId)
  if (!user) {
    res.status(404).json({ code: 404, message: '用户不存在' })
    return
  }

  res.json({
    code: 200,
    data: toUserDTO(user),
  })
})

// 更新用户信息
router.patch('/info', async (req: AuthRequest, res) => {
  const allowed = ['avatar'] as const
  const updates: Record<string, string> = {}

  for (const key of allowed) {
    const val = req.body[key]
    if (val !== undefined) {
      if (typeof val !== 'string' || val.length > 500) {
        res.status(400).json({ code: 400, message: `${key} 格式不合法` })
        return
      }
      updates[key] = val
    }
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ code: 400, message: '没有需要更新的字段' })
    return
  }

  const user = await User.findByIdAndUpdate(req.userId, updates, {
    new: true,
    runValidators: true,
  })
  if (!user) {
    res.status(404).json({ code: 404, message: '用户不存在' })
    return
  }

  res.json({
    code: 200,
    data: toUserDTO(user),
    message: '更新成功',
  })
})

export default router
