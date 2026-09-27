import { Router } from 'express'
import { auth } from '../middlewares/auth.js'
import * as userController from '../controllers/user.js'

// 接线层：中间件装配（所有用户接口需登录）+ 路由声明
const router = Router()

router.use(auth)

// /info、/password 必须先注册：否则会被下方的 /:id 吞掉
router.get('/info', userController.getInfo)
router.patch('/info', userController.updateInfo)
router.patch('/password', userController.changePassword)

// 用户管理
router.get('/', userController.listUsers)
router.post('/', userController.createUser)
router.patch('/:id', userController.updateUser)
router.delete('/:id', userController.deleteUser)

export default router
