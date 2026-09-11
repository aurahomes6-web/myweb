import { isDateString, nightsBetween, todayKey } from './dateUtils.js'

export const MAX_STAY_NIGHTS = 90

/** Validate a [checkIn, checkOut) date range. Returns an error message or null. */
export function validateRange(checkIn: unknown, checkOut: unknown): string | null {
  const from = checkIn
  const to = checkOut
  if (!from || !to || !isDateString(from) || !isDateString(to)) {
    return 'checkIn and checkOut must be valid YYYY-MM-DD dates'
  }
  const nights = nightsBetween(from, to)
  if (nights <= 0) return 'checkOut must be after checkIn'
  if (nights > MAX_STAY_NIGHTS) return `Requested stay exceeds the ${MAX_STAY_NIGHTS}-night limit`
  if (from < todayKey()) return 'checkIn cannot be in the past'
  return null
}

/**
 * Half-open range overlap predicate shared by unit tests and documentation of
 * the SQL used in availability checks: two stays collide when a1 < b2 &&
 * b1 < a2. Adjacent stays (a2 === b1) do NOT overlap.
 */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd
}