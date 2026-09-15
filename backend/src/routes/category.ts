import { Router } from 'express'
import { auth } from '../middlewares/auth.js'
import * as categoryController from '../controllers/category.js'

// 接线层：商品分类（需登录）
const router = Router()

router.use(auth)

router.get('/', categoryController.listCategories)

export default router
