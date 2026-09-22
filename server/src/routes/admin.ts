import { Router } from 'express'
import { adminConfig, requireConfiguredAdmin, requireCsrfHeader } from '../lib/adminAuth.js'
import {
  cancelAirbnbHandler,
  cancelBookingHandler,
  clearAirbnbBlockedDatesHandler,
  clearAirbnbHandler,
  clearAllBookingDataHandler,
  clearBookingsHandler,
  createAirbnbHandler,
  createCouponHandler,
  deleteAirbnbHandler,
  deleteCouponHandler,
  deletePropertyHandler,
  deletePropertyImageHandler,
  getAirbnbHandler,
  getBookingHandler,
  listAirbnbHandler,
  listBookingsHandler,
  listCouponsHandler,
  listPropertiesHandler,
  login,
  logout,
  me,
  setCouponActiveHandler,
  updateAirbnbHandler,
  updateBookingHandler,
  updatePropertyHandler,
  uploadPropertyImageHandler,
  uploadImageMiddleware,
} from '../controllers/adminController.js'

const config = adminConfig(process.env)
const auth = requireConfiguredAdmin(config)
const router = Router()

// Public entry point: exchange admin credentials for a session cookie.
router.post('/login', requireCsrfHeader, login(config))

// Everything below requires a valid admin session.
router.post('/logout', requireCsrfHeader, auth, logout(config))
router.get('/me', auth, me)

router.get('/bookings', auth, listBookingsHandler)
router.get('/bookings/:id', auth, getBookingHandler)
router.patch('/bookings/:id', requireCsrfHeader, auth, updateBookingHandler)
router.post('/bookings/:id/cancel', requireCsrfHeader, auth, cancelBookingHandler)

router.get('/airbnb', auth, listAirbnbHandler)
router.get('/airbnb/:id', auth, getAirbnbHandler)
router.post('/airbnb', requireCsrfHeader, auth, createAirbnbHandler)
router.patch('/airbnb/:id', requireCsrfHeader, auth, updateAirbnbHandler)
router.post('/airbnb/:id/cancel', requireCsrfHeader, auth, cancelAirbnbHandler)
router.delete('/airbnb/:id', requireCsrfHeader, auth, deleteAirbnbHandler)

router.get('/properties', auth, listPropertiesHandler)
router.patch('/properties/:id', requireCsrfHeader, auth, updatePropertyHandler)
router.delete('/properties/:id', requireCsrfHeader, auth, deletePropertyHandler)

// Phase 5: photo upload/delete + promo coupons (auth + CSRF everywhere).
router.post(
  '/properties/:id/images',
  requireCsrfHeader,
  auth,
  uploadImageMiddleware,
  uploadPropertyImageHandler
)
router.delete(
  '/properties/:id/images/:imageId',
  requireCsrfHeader,
  auth,
  deletePropertyImageHandler
)

router.get('/coupons', auth, listCouponsHandler)
router.post('/coupons', requireCsrfHeader, auth, createCouponHandler)
router.patch('/coupons/:id', requireCsrfHeader, auth, setCouponActiveHandler)
router.delete('/coupons/:id', requireCsrfHeader, auth, deleteCouponHandler)

// Destructive maintenance. Auth + CSRF + an explicit confirmation phrase are
// all required before any data is removed. Properties are always preserved.
router.post('/cleanup/bookings', requireCsrfHeader, auth, clearBookingsHandler)
router.post('/cleanup/airbnb', requireCsrfHeader, auth, clearAirbnbHandler)
router.post('/cleanup/blocked-dates', requireCsrfHeader, auth, clearAirbnbBlockedDatesHandler)
router.post('/cleanup/all', requireCsrfHeader, auth, clearAllBookingDataHandler)

export default router