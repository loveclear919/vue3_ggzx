import { Router } from 'express'
import { auth } from '../middlewares/auth.js'
import { requirePermission } from '../middlewares/requirePermission.js'
import * as brandController from '../controllers/brand.js'

// 接线层：品牌管理接口（全部需要登录）
const router = Router()

router.use(auth)

router.get('/', requirePermission('/product/trademark'), brandController.listBrands)
router.get(
  '/all',
  requirePermission('/product/trademark', '/product/spu'),
  brandController.listAllBrands,
)
router.post('/', requirePermission('brand:create'), brandController.createBrand)
router.patch('/:id', requirePermission('brand:update'), brandController.updateBrand)
router.delete('/:id', requirePermission('brand:delete'), brandController.deleteBrand)

export default router
