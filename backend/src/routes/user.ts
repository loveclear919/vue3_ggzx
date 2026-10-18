import { Router } from 'express'
import { auth } from '../middlewares/auth.js'
import { requirePermission } from '../middlewares/requirePermission.js'
import * as userController from '../controllers/user.js'

// 接线层：中间件装配（所有用户接口需登录）+ 路由声明
// 权限：GET 挂菜单 code（能进页面即能看列表）；写接口挂操作 code（对应 v-permission 按钮）
// 特权特判（roles 变更需 user:assign-role、涉及 builtin 需 role:grant-super）在 service 层，见 rbac-design §4.4
const router = Router()

router.use(auth)

// /info、/password 必须先注册：否则会被下方的 /:id 吞掉
router.get('/info', userController.getInfo)
router.patch('/info', userController.updateInfo)
router.patch('/password', userController.changePassword)

// 用户管理
router.get('/', requirePermission('user:list'), userController.listUsers)
router.post('/', requirePermission('user:create'), userController.createUser)
router.patch('/:id', requirePermission('user:update'), userController.updateUser)
router.delete('/:id', requirePermission('user:delete'), userController.deleteUser)

export default router
