import { Router } from 'express'
import { auth } from '../middlewares/auth.js'
import * as roleController from '../controllers/role.js'

const router = Router()

router.use(auth)

// 角色管理
router.get('/', roleController.listRole)
router.post('/', roleController.createRole)
router.patch('/:id', roleController.updateRole)
router.delete('/:id', roleController.deleteRole)

export default router
