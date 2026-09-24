import { Router } from 'express'
import {
  createBookingHandler,
  getBookingHandler,
  trackBookingHandler,
} from '../controllers/bookingController.js'

const router = Router()

router.post('/', createBookingHandler)
// Public tracking lookup must be registered before the parametric `/:id` route
// so "track" is never captured as a booking id/code.
router.get('/track/:bookingId', trackBookingHandler)
router.get('/:id', getBookingHandler)

export default router