import { Router } from 'express'
import {
  blockedDatesHandler,
  checkAvailabilityHandler,
} from '../controllers/availabilityController.js'

const router = Router()

router.get('/', checkAvailabilityHandler)
router.get('/blocked', blockedDatesHandler)

export default router