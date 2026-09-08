import { Router } from 'express'
import { auth } from '../middlewares/auth.js'
import * as attrController from '../controllers/attr.js'

// 接线层：平台属性（需登录）
const router = Router()

router.use(auth)

router.get('/', attrController.listAttrs)
router.post('/', attrController.createAttr)
router.patch('/:id', attrController.updateAttr)
router.delete('/:id', attrController.deleteAttr)

export default router
