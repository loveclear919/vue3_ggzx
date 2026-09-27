import { Router } from 'express'
import { auth } from '../middlewares/auth.js'
import * as skuController from '../controllers/sku.js'

// 接线层：SKU 管理（全部需要登录）
const router = Router()

router.use(auth)

router.get('/', skuController.listSkus)
router.post('/', skuController.generateSkus)
router.patch('/:id', skuController.updateSku)
router.delete('/', skuController.clearSkus)

export default router
