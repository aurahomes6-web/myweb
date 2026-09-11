import { Router } from 'express'
import {
  createBookingHandler,
  getBookingHandler,
} from '../controllers/bookingController.js'

const router = Router()

router.post('/', createBookingHandler)
router.get('/:id', getBookingHandler)

export default router