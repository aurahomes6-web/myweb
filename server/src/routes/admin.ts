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
   createBookingDateBlockHandler,
   deleteBookingDateBlockHandler,
  deleteAirbnbHandler,
  deleteCouponHandler,
  deletePropertyHandler,
  deletePropertyImageHandler,
  getAirbnbHandler,
  getBookingHandler,
  getContactSettingsHandler,
  getPropertySpaceHandler,
   listAirbnbHandler,
   listBookingDateBlocksHandler,
   listBookingsHandler,
  listCouponsHandler,
  listPaymentsHandler,
  listPropertiesHandler,
  login,
  logout,
  me,
  bookingsReportHandler,
  rejectPaymentHandler,
  acceptPaymentHandler,
  setCouponActiveHandler,
  updateAirbnbHandler,
  updateBookingHandler,
  updateContactSettingsHandler,
  updatePropertyHandler,
  updatePropertySpaceHandler,
  uploadPropertyImageHandler,
  uploadImageMiddleware,
} from '../controllers/adminController.js'
import {
  adminGetPaymentSettingsHandler,
  adminUpdatePaymentSettingsHandler,
  adminUploadPaymentQrHandler,
} from '../controllers/paymentSettingsController.js'
import {
  adminDeleteHomepageVisualHandler,
  adminGetHomepageSettingsHandler,
  adminUpdateHomepageSettingsHandler,
  adminUploadHomepageVisualHandler,
} from '../controllers/homepageSettingsController.js'
import {
  adminCreateMarqueeNotificationHandler,
  adminDeleteMarqueeNotificationHandler,
  adminListMarqueeNotificationsHandler,
  adminReorderMarqueeNotificationsHandler,
  adminUpdateMarqueeNotificationHandler,
} from '../controllers/marqueeNotificationController.js'
import {
  exportDetailsExcelHandler,
  exportDetailsPdfHandler,
  listDetailsHandler,
} from '../controllers/detailsController.js'
import {
  createManagerChecklistItemHandler,
  deleteManagerChecklistItemHandler,
  listManagerChecklistHandler,
  reorderManagerChecklistHandler,
  updateManagerChecklistItemHandler,
} from '../controllers/adminManagerController.js'

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

// THE SPACE: per-property capacity range + ordered attribute cards.
router.get('/properties/:id/space', auth, getPropertySpaceHandler)
router.put('/properties/:id/space', requireCsrfHeader, auth, updatePropertySpaceHandler)

router.get('/properties/:id/date-blocks', auth, listBookingDateBlocksHandler)
router.post('/properties/:id/date-blocks', requireCsrfHeader, auth, createBookingDateBlockHandler)
router.delete(
  '/properties/:id/date-blocks/:blockId',
  requireCsrfHeader,
  auth,
  deleteBookingDateBlockHandler
)

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

// Direct-UPI payment review. Listing needs a session; accepting/rejecting
// additionally requires the CSRF header.
router.get('/payments', auth, listPaymentsHandler)
router.post('/payments/:id/accept', requireCsrfHeader, auth, acceptPaymentHandler)
router.post('/payments/:id/reject', requireCsrfHeader, auth, rejectPaymentHandler)

// Booking report download. The action is read-only but streams admin data
// (full Aadhaar), so it is gated behind the session AND the CSRF header so a
// cross-origin top-level navigation can never silently download it. Auth runs
// first so unauthenticated callers get 401 and only real admins hit CSRF.
router.get('/reports/bookings', auth, requireCsrfHeader, bookingsReportHandler)

// Admin → Details: a read-only reporting view over NORMAL bookings and AIRBNB
// reservations. Exposes full Aadhaar, so the downloads carry the same
// session + CSRF protection as the existing booking report.
router.get('/details', auth, listDetailsHandler)
router.get('/details/export/excel', auth, requireCsrfHeader, exportDetailsExcelHandler)
router.get('/details/export/pdf', auth, requireCsrfHeader, exportDetailsPdfHandler)

// Admin → Manager: checklist CONFIGURATION only. This configures the tasks
// managers tick; it is not a link or a door into the manager panel itself, which
// stays unlinked and is reached only by typing /manager.
router.get('/manager/checklist/:propertyId', auth, listManagerChecklistHandler)
router.post('/manager/checklist/:propertyId', requireCsrfHeader, auth, createManagerChecklistItemHandler)
router.put('/manager/checklist/:propertyId/reorder', requireCsrfHeader, auth, reorderManagerChecklistHandler)
router.patch(
  '/manager/checklist/:propertyId/:itemId',
  requireCsrfHeader,
  auth,
  updateManagerChecklistItemHandler
)
router.delete(
  '/manager/checklist/:propertyId/:itemId',
  requireCsrfHeader,
  auth,
  deleteManagerChecklistItemHandler
)

// Global contact configuration (single-row singleton shown in the public footer).
router.get('/contact', auth, getContactSettingsHandler)
router.put('/contact', requireCsrfHeader, auth, updateContactSettingsHandler)

router.get('/homepage-settings', auth, adminGetHomepageSettingsHandler)
router.put('/homepage-settings', requireCsrfHeader, auth, adminUpdateHomepageSettingsHandler)
router.post(
  '/homepage-settings/visual',
  requireCsrfHeader,
  auth,
  uploadImageMiddleware,
  adminUploadHomepageVisualHandler
)
router.delete('/homepage-settings/visual', requireCsrfHeader, auth, adminDeleteHomepageVisualHandler)

router.get('/marquee-notifications', auth, adminListMarqueeNotificationsHandler)
router.post(
  '/marquee-notifications',
  requireCsrfHeader,
  auth,
  adminCreateMarqueeNotificationHandler
)
router.put(
  '/marquee-notifications/reorder',
  requireCsrfHeader,
  auth,
  adminReorderMarqueeNotificationsHandler
)
router.patch(
  '/marquee-notifications/:id',
  requireCsrfHeader,
  auth,
  adminUpdateMarqueeNotificationHandler
)
router.delete(
  '/marquee-notifications/:id',
  requireCsrfHeader,
  auth,
  adminDeleteMarqueeNotificationHandler
)

// Direct-UPI payment settings (payee name/id/phone + QR asset) editable from
// the Admin panel. All three endpoints reuse the existing admin auth: reads
// need a valid session; mutations additionally need the CSRF header. The QR
// upload accepts an image (validated + size-capped by the shared multer
// middleware) and persists it to the existing Vercel Blob store.
router.get('/payment-settings', auth, adminGetPaymentSettingsHandler)
router.put('/payment-settings', requireCsrfHeader, auth, adminUpdatePaymentSettingsHandler)
router.post(
  '/payment-settings/qr',
  requireCsrfHeader,
  auth,
  uploadImageMiddleware,
  adminUploadPaymentQrHandler
)

// Destructive maintenance. Auth + CSRF + an explicit confirmation phrase are
// all required before any data is removed. Properties are always preserved.
router.post('/cleanup/bookings', requireCsrfHeader, auth, clearBookingsHandler)
router.post('/cleanup/airbnb', requireCsrfHeader, auth, clearAirbnbHandler)
router.post('/cleanup/blocked-dates', requireCsrfHeader, auth, clearAirbnbBlockedDatesHandler)
router.post('/cleanup/all', requireCsrfHeader, auth, clearAllBookingDataHandler)

export default router