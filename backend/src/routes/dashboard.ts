import { Router } from 'express'
import { auth } from '../middlewares/auth.js'
import { getStats } from '../controllers/dashboard.js'

const router = Router()

router.use(auth)
router.get('/stats', getStats)

export default router
