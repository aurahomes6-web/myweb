import { Router } from 'express'
import { publicHomepageSettingsHandler } from '../controllers/homepageSettingsController.js'

const router = Router()

router.get('/', publicHomepageSettingsHandler)

export default router
