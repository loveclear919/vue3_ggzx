import { Router } from 'express'
import { auth } from '../middlewares/auth.js'
import { requirePermission } from '../middlewares/requirePermission.js'
import * as attrController from '../controllers/attr.js'

// 接线层：平台属性（需登录）
const router = Router()

router.use(auth)

router.get('/', requirePermission('/product/attr'), attrController.listAttrs)
router.post('/', requirePermission('attr:create'), attrController.createAttr)
router.patch('/:id', requirePermission('attr:update'), attrController.updateAttr)
router.delete('/:id', requirePermission('attr:delete'), attrController.deleteAttr)

export default router
