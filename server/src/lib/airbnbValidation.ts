import { GuestGender } from '../generated/prisma/enums.js'
import {
  findDuplicateGuests,
  isAadhaarNumber,
  isIndianPhone,
  maskAadhaar,
  normalizeAadhaar,
  normalizePhone,
  parseAge,
  parseGender,
  validateGuest,
  type BookingGuestInput,
  type ValidationIssue,
} from './bookingValidation.js'
import { isDateString, nightsBetween } from './dateUtils.js'
import { asTrimmed, parsePositiveInt } from './validation.js'

/**
 * Airbnb reservation-details payload validation (Phase 7).
 *
 * This flow is purely an information-sharing step: customers send their AIRBNB
 * reservation to the Aura WhatsApp number. No website booking is created, no
 * AURA booking ID is generated, and no availability is checked here.
 */

export const MAX_AIRBNB_GUESTS = 12

/** Airbnb confirmation numbers after normalisation: 4–24 alphanumeric chars. */
const AIRBNB_NUMBER_RE = /^[A-Z0-9]{4,24}$/

export interface AirbnbGuestInput {
  fullName: string
  aadhaarNumber: string
  gender: GuestGender
  age: number
}

export interface AirbnbDetailsInput {
  reservationNumber: string
  guestName: string
  primaryPhone: string
  checkIn: string
  checkOut: string
  guestCount: number
  guests: AirbnbGuestInput[]
}

export type AirbnbDetailsResult =
  | { ok: true; value: AirbnbDetailsInput }
  | { ok: false; issues: ValidationIssue[] }

export function normalizeReservationNumber(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]/g, '')
}

export function isAirbnbNumber(value: unknown): value is string {
  if (typeof value !== 'string') return false
  return AIRBNB_NUMBER_RE.test(normalizeReservationNumber(value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateAirbnbDetails(body: unknown): AirbnbDetailsResult {
  const issues: ValidationIssue[] = []
  if (!isRecord(body)) {
    return { ok: false, issues: [{ field: 'body', message: 'A JSON request body is required.' }] }
  }

  const reservationNumberRaw = asTrimmed(body.reservationNumber, 64)
  const guestName = asTrimmed(body.guestName, 120)
  const primaryPhone = asTrimmed(body.primaryPhone, 40)
  const checkIn = asTrimmed(body.checkIn)
  const checkOut = asTrimmed(body.checkOut)
  const guestCount = parsePositiveInt(body.guestCount)

  if (!reservationNumberRaw) {
    issues.push({ field: 'reservationNumber', message: 'Airbnb reservation number is required.' })
  } else if (!isAirbnbNumber(reservationNumberRaw)) {
    issues.push({
      field: 'reservationNumber',
      message: 'Airbnb reservation number looks invalid. Use 4 to 24 letters and numbers.',
    })
  }

  if (!guestName) {
    issues.push({ field: 'guestName', message: 'Reservation name is required.' })
  }

  if (!primaryPhone) {
    issues.push({ field: 'primaryPhone', message: 'A primary contact phone is required.' })
  } else if (!isIndianPhone(primaryPhone)) {
    issues.push({
      field: 'primaryPhone',
      message: 'Primary phone looks invalid. Use a 10-digit Indian mobile number.',
    })
  }

  if (!checkIn || !checkOut || !isDateString(checkIn) || !isDateString(checkOut)) {
    issues.push({ field: 'checkIn/checkOut', message: 'checkIn and checkOut must be valid YYYY-MM-DD dates.' })
  } else if (nightsBetween(checkIn, checkOut) <= 0) {
    issues.push({ field: 'checkIn/checkOut', message: 'Check-out must be after check-in.' })
  }

  if (guestCount === null) {
    issues.push({ field: 'guestCount', message: 'Number of guests is required.' })
  } else if (guestCount < 1 || guestCount > MAX_AIRBNB_GUESTS) {
    issues.push({ field: 'guestCount', message: `Number of guests must be between 1 and ${MAX_AIRBNB_GUESTS}.` })
  }

  if (issues.length > 0) {
    return { ok: false, issues }
  }

  const guestsRaw = body.guests
  if (!Array.isArray(guestsRaw)) {
    return { ok: false, issues: [{ field: 'guests', message: 'guests must be an array of per-guest details.' }] }
  }

  if (guestCount !== null && guestsRaw.length !== guestCount) {
    return {
      ok: false,
      issues: [{
        field: 'guests',
        message: `Guest count mismatch: form lists ${guestsRaw.length} guest(s) but guestCount is ${guestCount}.`,
      }],
    }
  }

  const guestIssues = guestsRaw.flatMap((raw, index) => validateGuest(raw, index))
  if (guestIssues.length > 0) {
    return { ok: false, issues: guestIssues }
  }

  const guests: BookingGuestInput[] = guestsRaw.map((raw, index) => {
    const record = raw as Record<string, unknown>
    return {
      fullName: (record.fullName as string).trim(),
      aadhaarNumber: normalizeAadhaar(record.aadhaarNumber as string),
      gender: parseGender(record.gender) as GuestGender,
      age: parseAge(record.age) as number,
    }
  })

  const duplicateIssues = findDuplicateGuests(guests)
  if (duplicateIssues.length > 0) {
    return { ok: false, issues: duplicateIssues }
  }

  return {
    ok: true,
    value: {
      reservationNumber: normalizeReservationNumber(reservationNumberRaw as string),
      guestName: guestName as string,
      primaryPhone: normalizePhone(primaryPhone as string),
      checkIn: checkIn as string,
      checkOut: checkOut as string,
      guestCount: guestCount as number,
      guests: guests as AirbnbGuestInput[],
    },
  }
}

/** Mask helper re-exported so the Airbnb guest view stays consistent. */
export { maskAadhaar }