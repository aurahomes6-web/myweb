import type { BookingResponse } from '@/types'
import { nightsBetween } from './date'
import { GENDER_LABEL } from './gender'

export { GENDER_LABEL }

/**
 * Build the pre-filled WhatsApp booking message.
 *
 * Aadhaar entry: the live booking flow uses the server-composed message from
 * `booking.whatsAppMessage`, which contains each guest's FULL 12-digit Aadhaar
 * (required for the documentary WhatsApp flow). This local builder is only a
 * masked fallback for rendering a preview on a refreshed ticket page — it must
 * never be placed into a URL.
 */
export function buildWhatsAppMessage(booking: BookingResponse): string {
  const primary = booking.guests[0]
  const nights = nightsBetween(booking.checkIn, booking.checkOut)

  const guestLines = booking.guests
    .map(
      (g, i) =>
        `${i + 1}. ${g.fullName} | Aadhaar: ${g.aadhaarNumberMasked} | ${GENDER_LABEL[g.gender]} | Age ${g.age}`
    )
    .join('\n')

  return [
    'AURA HOMES — NEW BOOKING',
    '',
    `Booking ID: ${booking.code}`,
    `Property: ${booking.property.name}`,
    `Check-in: ${booking.checkIn}`,
    `Check-out: ${booking.checkOut}`,
    `Guests: ${booking.guestCount}`,
    `Nights: ${nights}`,
    '',
    'Primary guest:',
    `- ${primary?.fullName ?? '—'}`,
    `- +91 ${booking.primaryPhone}`,
    '',
    'All guests:',
    guestLines,
    '',
    'Please carry a valid Government-issued ID for all guests at check-in.',
  ].join('\n')
}

/**
 * Build the WhatsApp click-to-chat URL for the Aura number.
 *
 * The prefilled message MUST contain each guest's full Aadhaar when the
 * customer sends it. That full message only exists in `booking.whatsAppMessage`
 * (returned at booking time). If it is absent — e.g. a refreshed ticket page
 * served by the public lookup — the function returns null rather than ever
 * sending a masked substitute.
 */
export function buildWhatsAppUrl(booking: BookingResponse): string | null {
  const digits = (booking.notification?.recipient ?? '').replace(/\D/g, '')
  if (!digits) return null
  const message = booking.whatsAppMessage
  if (!message) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}
