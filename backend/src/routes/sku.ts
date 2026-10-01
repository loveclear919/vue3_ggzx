import { Router } from 'express'
import { auth } from '../middlewares/auth.js'
import { requirePermission } from '../middlewares/requirePermission.js'
import * as skuController from '../controllers/sku.js'

// 接线层：SKU 管理（全部需要登录）
const router = Router()

router.use(auth)

router.get('/', requirePermission('/product/spu/sku'), skuController.listSkus)
router.post('/', requirePermission('sku:generate'), skuController.generateSkus)
router.patch('/:id', requirePermission('sku:update'), skuController.updateSku)
router.delete('/', requirePermission('sku:clear'), skuController.clearSkus)

export default router
