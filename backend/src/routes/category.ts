import { Router } from 'express'
import { auth } from '../middlewares/auth.js'
import { requirePermission } from '../middlewares/requirePermission.js'
import * as categoryController from '../controllers/category.js'

// 接线层：商品分类（需登录）
const router = Router()

router.use(auth)

router.get(
  '/',
  requirePermission('attr:list', 'spu:list'),
  categoryController.listCategories,
)

export default router
