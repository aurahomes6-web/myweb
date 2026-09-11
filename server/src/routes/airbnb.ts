import { Router } from 'express'
import { submitAirbnbDetailsHandler } from '../controllers/airbnbController.js'

const router = Router()

router.post('/details', submitAirbnbDetailsHandler)

export default router