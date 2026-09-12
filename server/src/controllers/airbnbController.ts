import { Request, Response } from 'express'
import { validateAirbnbDetails } from '../lib/airbnbValidation.js'
import { buildAirbnbWhatsAppMessage, getWhatsAppStatus } from '../services/notificationService.js'
import { createAirbnb } from '../services/adminService.js'
import { prisma } from '../lib/db.js'

/**
 * Airbnb reservation details → WhatsApp (Phase 7).
 *
 * Validates the customer's Airbnb reservation information, records an
 * UNASSIGNED AirbnbReservation for the admin dashboard (propertyId null — no
 * nights are blocked until the admin assigns a home), and returns the WhatsApp
 * message for the click-to-chat flow. The full Aadhaar is included ONLY inside
 * that message (the customer's own pre-fill) — it is never exposed anywhere
 * else. This NEVER creates a website booking, never generates an AURA booking
 * ID, and never checks availability. The reservation number is optional.
 */
export async function submitAirbnbDetailsHandler(req: Request, res: Response): Promise<void> {
  const result = validateAirbnbDetails(req.body)

  if (!result.ok) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Please review the highlighted fields.',
      details: result.issues,
    })
    return
  }

  // Record the submission so it shows in Admin → Airbnb. The stored guest
  // Aadhaar numbers (like booking storage) are private Database-only details;
  // they only ever surface to the authenticated admin in the detail view.
  await createAirbnb(prisma, { ...result.value, propertyId: null })

  const message = buildAirbnbWhatsAppMessage(result.value, { fullAadhaar: true })
  const notification = getWhatsAppStatus()

  res.status(200).json({
    status: 'ok',
    reservationNumber: result.value.reservationNumber,
    message,
    recipient: notification.status === 'NOT_CONFIGURED' ? undefined : notification.recipient,
  })
}