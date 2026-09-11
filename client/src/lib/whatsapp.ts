import type { BookingResponse, GuestGenderValue } from '@/types'
import { nightsBetween } from './date'

const GENDER_LABEL: Record<GuestGenderValue, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
  PREFER_NOT_TO_SAY: 'Prefer not to say',
}

export { GENDER_LABEL }

/**
 * Build the pre-filled WhatsApp booking message. Aadhaar is always masked
 * (last 4 digits only) — the full number is never placed in a URL.
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
 * Build a WhatsApp click-to-chat URL for the Aura number with the masked
 * booking message. Returns null if the recipient number is not configured
 * in the server response.
 */
export function buildWhatsAppUrl(booking: BookingResponse): string | null {
  const digits = (booking.notification?.recipient ?? '').replace(/\D/g, '')
  if (!digits) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(buildWhatsAppMessage(booking))}`
}
