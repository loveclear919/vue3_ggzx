import { Router } from 'express'
import { auth } from '../middlewares/auth.js'
import { requirePermission } from '../middlewares/requirePermission.js'
import * as spuController from '../controllers/spu.js'

// 接线层：SPU 管理（全部需要登录）
const router = Router()

router.use(auth)

router.get('/', requirePermission('spu:list'), spuController.listSpus)
router.get('/:id', requirePermission('spu:list', 'sku:list'), spuController.getSpuById)
router.post('/', requirePermission('spu:create'), spuController.createSpu)
router.patch('/:id', requirePermission('spu:update'), spuController.updateSpu)
router.delete('/:id', requirePermission('spu:delete'), spuController.deleteSpu)

export default router
