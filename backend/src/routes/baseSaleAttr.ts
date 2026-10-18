import { Router } from 'express'
import { auth } from '../middlewares/auth.js'
import { requirePermission } from '../middlewares/requirePermission.js'
import * as baseSaleAttrController from '../controllers/baseSaleAttr.js'

// 接线层：基础销售属性（需登录，只读）
const router = Router()

router.use(auth)

router.get('/', requirePermission('spu:list'), baseSaleAttrController.listBaseSaleAttrs)

export default router
