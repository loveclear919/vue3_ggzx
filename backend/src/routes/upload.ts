import { Router } from 'express'
import { auth } from '../middlewares/auth.js'
import { upload } from '../utils/upload.js'
import { uploadFile } from '../controllers/upload.js'

// 接线层：文件上传
const router = Router()

router.use(auth)
router.post('/', upload.single('file'), uploadFile)

export default router
