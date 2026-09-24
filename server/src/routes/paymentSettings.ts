import { Router } from 'express'
import { publicPaymentSettingsHandler } from '../controllers/paymentSettingsController.js'

const router = Router()

// Public Direct-UPI payment details for the customer payment page. Returns ONLY
// { upiName, upiId, upiPhone, qrCodeUrl } — never admin/session data or secrets.
router.get('/', publicPaymentSettingsHandler)

export default router