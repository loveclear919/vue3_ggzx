import { Router } from 'express'
import { auth } from '../middlewares/auth.js'
import { requirePermission } from '../middlewares/requirePermission.js'
import * as roleController from '../controllers/role.js'

const router = Router()

router.use(auth)

// 角色管理
// GET 多 perms（任一满足）：角色页、用户页的角色标签/分配选项都是消费方（rbac-design §4.3）
// 特权特判（permissions 变更需 role:assign-perm、builtin 角色需 role:grant-super）在 service 层，见 §4.4
router.get(
  '/',
  requirePermission('role:list', 'user:list', 'user:assign-role'),
  roleController.listRole,
)
router.post('/', requirePermission('role:create'), roleController.createRole)
router.patch('/:id', requirePermission('role:update'), roleController.updateRole)
router.delete('/:id', requirePermission('role:delete'), roleController.deleteRole)

export default router
