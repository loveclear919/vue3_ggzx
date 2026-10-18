import { Router } from 'express'
import { auth } from '../middlewares/auth.js'
import { requirePermission } from '../middlewares/requirePermission.js'
import * as permissionController from '../controllers/permission.js'

const router = Router()

router.use(auth)

// 权限管理
router.get(
  '/',
  requirePermission('permission:list', 'role:assign-perm'),
  permissionController.listPermissions,
)
router.post('/', requirePermission('permission:create'), permissionController.createPermission)
router.patch('/:id', requirePermission('permission:update'), permissionController.updatePermission)
// 同层交换排序（上移/下移）
router.patch(
  '/:id/swap',
  requirePermission('permission:swap'),
  permissionController.swapPermissionSort,
)
router.delete('/:id', requirePermission('permission:delete'), permissionController.deletePermission)

export default router
