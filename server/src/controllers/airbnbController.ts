import { Request, Response } from 'express'
import { validateAirbnbDetails } from '../lib/airbnbValidation.js'
import { buildAirbnbWhatsAppMessage, getWhatsAppStatus } from '../services/notificationService.js'

/**
 * Airbnb reservation details → WhatsApp (Phase 7).
 *
 * Stateless: validates the customer's Airbnb reservation information and
 * returns the masked WhatsApp message for the click-to-chat flow. This NEVER
 * creates a website booking, never generates an AURA booking ID, and never
 * checks availability.
 */
export function submitAirbnbDetailsHandler(req: Request, res: Response): void {
  const result = validateAirbnbDetails(req.body)

  if (!result.ok) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Please review the highlighted fields.',
      details: result.issues,
    })
    return
  }

  const message = buildAirbnbWhatsAppMessage(result.value)
  const notification = getWhatsAppStatus()

  res.status(200).json({
    status: 'ok',
    reservationNumber: result.value.reservationNumber,
    message,
    recipient: notification.status === 'NOT_CONFIGURED' ? undefined : notification.recipient,
  })
}