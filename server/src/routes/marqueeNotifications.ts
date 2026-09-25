import { Router } from 'express'
import { publicMarqueeNotificationsHandler } from '../controllers/marqueeNotificationController.js'

const router = Router()

router.get('/', publicMarqueeNotificationsHandler)

export default router
