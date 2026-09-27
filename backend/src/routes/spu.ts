import { Router } from 'express'
import { auth } from '../middlewares/auth.js'
import * as spuController from '../controllers/spu.js'

// 接线层：SPU 管理（全部需要登录）
const router = Router()

router.use(auth)

router.get('/', spuController.listSpus)
router.get('/:id', spuController.getSpuById)
router.post('/', spuController.createSpu)
router.patch('/:id', spuController.updateSpu)
router.delete('/:id', spuController.deleteSpu)

export default router
