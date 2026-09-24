import { GuestGender, PaymentStatus } from '../generated/prisma/enums.js'
import { maskAadhaar } from '../lib/bookingValidation.js'
import type { AirbnbDetailsInput } from '../lib/airbnbValidation.js'
import { formatDateKey, nightsBetween } from '../lib/dateUtils.js'
import { formatINR } from './pricingService.js'

/**
 * Booking notifications.
 *
 * The WhatsApp recipient number is configured via AURA_WHATSAPP_NUMBER in
 * server/.env. A real WhatsApp Business / messaging provider is NOT wired up
 * yet, so this module NEVER fakes a send: it reports the true configuration
 * status and opens the door for a real provider later.
 *
 * Security rules:
 *   - The MASKED Aadhaar (last 4 digits) is the default everywhere, including
 *     any server-side notification message. The full number is only placed in
 *     a message body when the caller explicitly requests it with
 *     `{ fullAadhaar: true }` — and that is done exclusively for the customer's
 *     own WhatsApp pre-fill, which is returned in the submission response and
 *     put straight into a wa.me click-to-chat link.
 *   - The full number is never written to logs, console output, booking codes,
 *     URL paths, query parameters (other than that intended pre-fill), or any
 *     response that is not that WhatsApp pre-fill.
 *   - API credentials stay in server/.env only and are never returned to the
 *     frontend. Only the recipient number (a public value) is exposed so the
 *     client can offer a manual WhatsApp click-to-chat action.
 */

export interface GuestForNotification {
  fullName: string
  aadhaarNumber: string
  gender: GuestGender
  age: number
}

export interface BookingNotificationPayload {
  code: string
  propertyName: string
  checkIn: string
  checkOut: string
  guestCount: number
  primaryPhone: string
  guests: GuestForNotification[]
  /** Present when a coupon was applied at booking time (Phase 5). */
  pricing?: {
    originalPricePaise: number
    discountPaise: number
    finalPricePaise: number
    couponCode?: string
  }
  /**
   * Present for direct-UPI bookings. The UTR is the only place the transaction
   * reference leaves the server outside of the admin panel, and the message is
   * delivered to the configured recipient (the AURA HOMES admin).
   */
  payment?: {
    status: PaymentStatus
    utr: string
    finalPricePaise: number
  }
}

export type NotificationStatus =
  | 'NOT_CONFIGURED' // no recipient number set
  | 'PROVIDER_PENDING' // recipient set, provider not wired up
  | 'SENT' // delivered by a real provider
  | 'FAILED' // provider attempted and failed

export interface NotificationResult {
  status: NotificationStatus
  sent: boolean
  /** Recipient phone as digits only (for the manual wa.me action). */
  recipient?: string
}

const RECIPIENT_ENV = 'AURA_WHATSAPP_NUMBER'

const GENDER_DISPLAY: Record<GuestGender, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
  PREFER_NOT_TO_SAY: 'Prefer not to say',
}

/**
 * Compose the fully-formatted WhatsApp booking message.
 *
 * By default Aadhaar numbers are masked to the last 4 digits. Pass
 * `{ fullAadhaar: true }` ONLY to produce the customer's own WhatsApp pre-fill
 * — that single message is delivered straight into a wa.me click-to-chat link
 * and is never written to logs or stored anywhere.
 */
export function buildWhatsAppMessage(
  payload: BookingNotificationPayload,
  options: { fullAadhaar?: boolean } = {}
): string {
  const primary = payload.guests[0]
  const nights = nightsBetween(payload.checkIn, payload.checkOut)

  const guestLines = payload.guests
    .map((guest, index) => {
      const aadhaar = options.fullAadhaar ? guest.aadhaarNumber : maskAadhaar(guest.aadhaarNumber)
      return `${index + 1}. ${guest.fullName} | Aadhaar: ${aadhaar} | ${GENDER_DISPLAY[guest.gender]} | Age ${guest.age}`
    })
    .join('\n')

  const pricingLines: string[] = []
  if (payload.pricing !== undefined) {
    pricingLines.push(
      ``,
      `Pricing:`,
      `- Original: ${formatINR(payload.pricing.originalPricePaise)}`,
    )
    if (payload.pricing.discountPaise > 0) {
      pricingLines.push(`- Discount: – ${formatINR(payload.pricing.discountPaise)}`)
    }
    pricingLines.push(`- Total: ${formatINR(payload.pricing.finalPricePaise)}`)
    if (payload.pricing.couponCode) {
      pricingLines.push(`- Coupon: ${payload.pricing.couponCode}`)
    }
  }

  const paymentLines: string[] = []
  if (payload.payment !== undefined) {
    // A submitted UTR means the customer paid (the transaction reference was
    // shared), not that the system verified the transfer. "PAID" is always
    // accurate for that; the admin verification state is reported separately.
    const verification =
      payload.payment.status === PaymentStatus.ACCEPTED
        ? 'CONFIRMED'
        : payload.payment.status === PaymentStatus.REJECTED
          ? 'REJECTED'
          : 'PENDING ADMIN VERIFICATION'
    paymentLines.push(
      ``,
      `Payment: PAID`,
      `Amount Paid: ${formatINR(payload.payment.finalPricePaise)}`,
      `UTR: ${payload.payment.utr}`,
      `Verification: ${verification}`,
    )
  }

  return [
    `AURA HOMES — NEW BOOKING`,
    ``,
    `Booking ID: ${payload.code}`,
    `Property: ${payload.propertyName}`,
    `Check-in: ${payload.checkIn}`,
    `Check-out: ${payload.checkOut}`,
    `Guests: ${payload.guestCount}`,
    `Nights: ${nights}`,
    ...pricingLines,
    ...paymentLines,
    ``,
    `Primary guest:`,
    `- ${primary?.fullName ?? '—'}`,
    `- +91 ${payload.primaryPhone}`,
    ``,
    `All guests:`,
    guestLines,
    ``,
    `Please carry a valid Government-issued ID for all guests at check-in.`,
  ].join('\n')
}

/**
 * Compose the Airbnb reservation message for WhatsApp (Phase 7).
 *
 * By default Aadhaar numbers are masked to the last 4 digits; pass
 * `{ fullAadhaar: true }` ONLY for the customer's own WhatsApp pre-fill. The
 * reservation number is optional — when it is empty the line is omitted.
 */
export function buildAirbnbWhatsAppMessage(
  payload: AirbnbDetailsInput,
  options: { fullAadhaar?: boolean } = {}
): string {
  const lines: string[] = ['🏠 AURA HOMES', 'AIRBNB RESERVATION', '']

  const flight: string[] = []
  if (payload.reservationNumber) {
    flight.push(`Airbnb Reservation No: ${payload.reservationNumber}`)
  }
  flight.push(
    `Guest Name: ${payload.guestName}`,
    `Phone: ${payload.primaryPhone}`,
    '',
    `Check-in: ${formatDateKey(payload.checkIn)}`,
    `Check-out: ${formatDateKey(payload.checkOut)}`,
    `Guests: ${payload.guestCount}`,
    '',
    'GUEST DETAILS',
    ''
  )
  lines.push(...flight)

  payload.guests.forEach((guest, index) => {
    const aadhaar = options.fullAadhaar ? guest.aadhaarNumber : maskAadhaar(guest.aadhaarNumber)
    lines.push(
      `Guest ${index + 1}`,
      `Name: ${guest.fullName}`,
      `Aadhaar: ${aadhaar}`,
      `Gender: ${GENDER_DISPLAY[guest.gender]}`,
      `Age: ${guest.age}`,
      ''
    )
  })

  lines.push(
    '────────────────',
    'AURA HOMES',
    'Airbnb reservation details submitted.'
  )

  return lines.join('\n')
}

/** Current WhatsApp configuration without sending anything. */
export function getWhatsAppStatus(): NotificationResult {
  const recipient = process.env[RECIPIENT_ENV]?.trim()

  if (!recipient) {
    return { status: 'NOT_CONFIGURED', sent: false }
  }

  // Recipient is configured, but there is no messaging provider (token/API)
  // in this project yet. Until one exists we never claim a message was sent.
  return { status: 'PROVIDER_PENDING', sent: false, recipient: recipient.replace(/\D/g, '') }
}

/**
 * Deliver the booking confirmation to the configured WhatsApp number.
 * Never throws: a notification problem must never block or fail a booking.
 */
export async function sendBookingNotification(
  payload: BookingNotificationPayload
): Promise<NotificationResult> {
  const config = getWhatsAppStatus()

  if (config.status === 'NOT_CONFIGURED') {
    console.info(
      `[notification] WhatsApp skipped — AURA_WHATSAPP_NUMBER not configured (booking ${payload.code})`
    )
    return config
  }

  // Provider not wired up yet. Do not log message content.
  console.info(
    `[notification] WhatsApp recipient configured but no provider wired up (booking ${payload.code}) — nothing was sent.`
  )
  return config
}