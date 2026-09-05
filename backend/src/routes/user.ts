import { Router } from 'express'
import { auth } from '../middlewares/auth.js'
import * as userController from '../controllers/user.js'

// 接线层：中间件装配（所有用户接口需登录）+ 路由声明
const router = Router()

router.use(auth)

router.get('/info', userController.getInfo)
router.patch('/info', userController.updateInfo)

export default router
