import { Router } from 'express'
import * as authController from '../controllers/auth.js'

// 接线层：只声明 URL / 方法 → 处理函数，不含任何业务
const router = Router()

router.post('/register', authController.register)
router.post('/login', authController.login)

export default router
