import { Router } from 'express'
import { auth } from '../middlewares/auth.js'
import { requirePermission } from '../middlewares/requirePermission.js'
import { getStats } from '../controllers/dashboard.js'

// 数据大屏聚合
const router = Router()

router.use(auth)
router.get('/stats', requirePermission('/screen'), getStats)

export default router
