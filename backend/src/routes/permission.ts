import { Router } from 'express'
import { auth } from '../middlewares/auth.js'
import * as permissionController from '../controllers/permission.js'

const router = Router()

router.use(auth)

// 权限管理
router.get('/', permissionController.listPermissions)
router.post('/', permissionController.createPermission)
router.patch('/:id', permissionController.updatePermission)
// 同层交换排序（上移/下移）：/:id/swap 与 /:id 段数不同，无匹配冲突
router.patch('/:id/swap', permissionController.swapPermissionSort)
router.delete('/:id', permissionController.deletePermission)

export default router
