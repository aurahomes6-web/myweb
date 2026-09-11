import { GuestGender } from '../generated/prisma/enums.js'
import { maskAadhaar } from '../lib/bookingValidation.js'
import { nightsBetween } from '../lib/dateUtils.js'

/**
 * Booking notifications.
 *
 * The WhatsApp recipient number is configured via AURA_WHATSAPP_NUMBER in
 * server/.env. A real WhatsApp Business / messaging provider is NOT wired up
 * yet, so this module NEVER fakes a send: it reports the true configuration
 * status and opens the door for a real provider later.
 *
 * Security rules:
 *   - The WhatsApp message body only ever contains the MASKED Aadhaar (last 4
 *     digits). The full number is never placed in a message body, and must
 *     never be written to logs, responses, console output, URLs or any other
 *     channel.
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
 * Compose the fully-formatted WhatsApp booking message. Aadhaar numbers are
 * always masked to the last 4 digits here — this is the single source of truth
 * for the message body so a later real provider cannot leak them either.
 */
export function buildWhatsAppMessage(payload: BookingNotificationPayload): string {
  const primary = payload.guests[0]
  const nights = nightsBetween(payload.checkIn, payload.checkOut)

  const guestLines = payload.guests
    .map(
      (guest, index) =>
        `${index + 1}. ${guest.fullName} | Aadhaar: ${maskAadhaar(guest.aadhaarNumber)} | ${GENDER_DISPLAY[guest.gender]} | Age ${guest.age}`
    )
    .join('\n')

  return [
    `AURA HOMES — NEW BOOKING`,
    ``,
    `Booking ID: ${payload.code}`,
    `Property: ${payload.propertyName}`,
    `Check-in: ${payload.checkIn}`,
    `Check-out: ${payload.checkOut}`,
    `Guests: ${payload.guestCount}`,
    `Nights: ${nights}`,
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