import { Router } from 'express'
import { auth } from '../middlewares/auth.js'
import * as brandController from '../controllers/brand.js'

// 接线层：品牌管理接口（全部需要登录）
const router = Router()

router.use(auth)

router.get('/', brandController.listBrands)
router.get('/all', brandController.listAllBrands)
router.post('/', brandController.createBrand)
router.patch('/:id', brandController.updateBrand)
router.delete('/:id', brandController.deleteBrand)

export default router
