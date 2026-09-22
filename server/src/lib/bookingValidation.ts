import { GuestGender } from '../generated/prisma/enums.js'
import { validateRange } from './dateRange.js'
import { normalizeCouponCode } from './couponValidation.js'
import { asTrimmed, parsePositiveInt } from './validation.js'

/**
 * Booking-payload validation for Phase 5. Every check here is mirrored by the
 * client so expectations fail fast, but the server is always the source of
 * truth.
 */

const GENDER_LABELS: Record<GuestGender, string> = {
  MALE: 'male',
  FEMALE: 'female',
  OTHER: 'other',
  PREFER_NOT_TO_SAY: 'prefer not to say',
}

const ACCEPTED_GENDERS = new Set<string>(
  (Object.keys(GENDER_LABELS) as GuestGender[]).map((key) => GENDER_LABELS[key])
)

export interface ValidationIssue {
  field: string
  message: string
}

export interface BookingGuestInput {
  fullName: string
  aadhaarNumber: string
  gender: GuestGender
  age: number
  phone?: string
}

export interface CreateBookingInput {
  propertyId: string
  checkIn: string
  checkOut: string
  guestCount: number
  primaryPhone: string
  guests: BookingGuestInput[]
  notes?: string
  /** Optional referral/offer code. Server validates + applies the discount. */
  couponCode?: string
}

export type BookingInputResult =
  | { ok: true; value: CreateBookingInput }
  | { ok: false; issues: ValidationIssue[] }

/** Exactly 12 digits; whitespace/hyphen grouping is allowed on input. */
export function isAadhaarNumber(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const digits = value.replace(/[\s-]/g, '')
  return /^\d{12}$/.test(digits)
}

export function normalizeAadhaar(value: string): string {
  return value.replace(/[\s-]/g, '')
}

/**
 * Mask an Aadhaar number so only the last 4 digits are visible.
 * Example: "123456789012" → "********9012". This is the default for every
 * public-facing representation — the full number is never exposed except
 * inside the customer's own WhatsApp pre-fill message (see notificationService
 * `{ fullAadhaar: true }`), which is returned only in the submission response
 * and placed straight into a click-to-chat link.
 */
export function maskAadhaar(aadhaar: string): string {
  const digits = normalizeAadhaar(aadhaar)
  if (digits.length === 0) return ''
  const last4 = digits.slice(-4)
  return `${'*'.repeat(digits.length - last4.length)}${last4}`
}

/** Indian mobile: optional +91 prefix followed by a 10-digit [6-9] number. */
export function isIndianPhone(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const compact = value.replace(/[\s-]/g, '')
  if (/^\+?91\d{10}$/.test(compact)) return /^[6-9]\d{9}$/.test(compact.slice(-10))
  return /^[6-9]\d{9}$/.test(compact)
}

/** Accepts enum keys (MALE) or display labels ("Male", "Prefer not to say"). */
export function parseGender(value: unknown): GuestGender | null {
  if (typeof value !== 'string') return null
  const key = value.toUpperCase()
  const known = Object.keys(GENDER_LABELS) as GuestGender[]
  if (known.includes(key as GuestGender)) return key as GuestGender
  const label = value.trim().toLowerCase()
  if (ACCEPTED_GENDERS.has(label)) {
    const entry = (Object.entries(GENDER_LABELS) as [GuestGender, string][]).find(
      ([, text]) => text === label
    )
    return entry ? entry[0] : null
  }
  return null
}

/** Age must be a whole number with a reasonable human range: 1 to 120. */
export function parseAge(value: unknown): number | null {
  const age = parsePositiveInt(value)
  if (age === null || age < 1 || age > 120) return null
  return age
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateGuest(raw: unknown, index: number): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const prefix = `guests[${index}]`

  if (!isRecord(raw)) {
    return [{ field: prefix, message: 'Each guest must be an object with a full name, Aadhaar, gender and age.' }]
  }

  const fullName = asTrimmed(raw.fullName, 120)
  const aadhaar = isAadhaarNumber(raw.aadhaarNumber)
  const gender = parseGender(raw.gender)
  const age = parseAge(raw.age)
  const phone = raw.phone === undefined || raw.phone === null || raw.phone === ''
    ? undefined
    : asTrimmed(raw.phone, 40)

  if (!fullName) {
    issues.push({ field: `${prefix}.fullName`, message: 'Full name is required.' })
  }
  if (!aadhaar) {
    issues.push({
      field: `${prefix}.aadhaarNumber`,
      message: 'Aadhaar must be exactly 12 digits.',
    })
  }
  if (!gender) {
    issues.push({
      field: `${prefix}.gender`,
      message: 'Please choose a gender.',
    })
  }
  if (!age) {
    issues.push({
      field: `${prefix}.age`,
      message: 'Age must be a whole number between 1 and 120.',
    })
  }
  if (phone !== undefined && phone !== null && !isIndianPhone(phone)) {
    issues.push({
      field: `${prefix}.phone`,
      message: 'Guest phone looks invalid. Use a 10-digit Indian mobile number.',
    })
  }

  return issues
}

export function validateCreateBooking(body: unknown): BookingInputResult {
  const issues: ValidationIssue[] = []
  if (!isRecord(body)) {
    return { ok: false, issues: [{ field: 'body', message: 'A JSON request body is required.' }] }
  }

  const propertyId = asTrimmed(body.propertyId)
  const checkIn = asTrimmed(body.checkIn)
  const checkOut = asTrimmed(body.checkOut)
  const guestCount = parsePositiveInt(body.guestCount)
  const primaryPhone = asTrimmed(body.primaryPhone, 40)
  const notes = asTrimmed(body.notes, 1000)
  const couponProvided = body.couponCode !== undefined && body.couponCode !== null && body.couponCode !== ''
  const couponCode = couponProvided ? normalizeCouponCode(body.couponCode) : undefined
  if (couponProvided && couponCode === null) {
    issues.push({ field: 'couponCode', message: 'Coupon code looks invalid.' })
  }

  if (!propertyId) {
    issues.push({ field: 'propertyId', message: 'propertyId is required.' })
  }

  const rangeError = validateRange(checkIn, checkOut)
  if (rangeError) {
    issues.push({ field: 'checkIn/checkOut', message: rangeError })
  }

  if (guestCount === null) {
    issues.push({ field: 'guestCount', message: 'guestCount must be a positive integer.' })
  }

  if (!primaryPhone) {
    issues.push({ field: 'primaryPhone', message: 'A primary contact phone is required.' })
  } else if (!isIndianPhone(primaryPhone)) {
    issues.push({
      field: 'primaryPhone',
      message: 'Primary phone looks invalid. Use a 10-digit Indian mobile number.',
    })
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
    const phone = record.phone === undefined || record.phone === null || record.phone === ''
      ? undefined
      : normalizePhone(record.phone as string)
    return {
      fullName: (record.fullName as string).trim(),
      aadhaarNumber: normalizeAadhaar(record.aadhaarNumber as string),
      gender: parseGender(record.gender) as GuestGender,
      age: parseAge(record.age) as number,
      phone,
    }
  })

  guests[0] = { ...guests[0], phone: normalizePhone(primaryPhone as string) }

  const duplicateIssues = findDuplicateGuests(guests)
  if (duplicateIssues.length > 0) {
    return { ok: false, issues: duplicateIssues }
  }

  return {
    ok: true,
    value: {
      propertyId: propertyId as string,
      checkIn: checkIn as string,
      checkOut: checkOut as string,
      guestCount: guestCount as number,
      primaryPhone: normalizePhone(primaryPhone as string),
      guests,
      notes: notes ?? undefined,
      couponCode: couponCode ?? undefined,
    },
  }
}

/**
 * Reject duplicate guests within a single booking.
 *
 * Every guest must have a unique Aadhaar number (authoritative uniqueness
 * check — similar names are fine as long as Aadhaars differ), and a guest
 * record must not be completely identical to another guest.
 */
export function findDuplicateGuests(guests: BookingGuestInput[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  const aadhaarOwners = new Map<string, number>()
  guests.forEach((guest, index) => {
    const owner = aadhaarOwners.get(guest.aadhaarNumber)
    if (owner !== undefined) {
      issues.push({
        field: `guests[${index}].aadhaarNumber`,
        message: 'Each guest must have a unique Aadhaar number.',
      })
    } else {
      aadhaarOwners.set(guest.aadhaarNumber, index)
    }
  })

  const identicalOwners = new Map<string, number>()
  guests.forEach((guest, index) => {
    const key = identityKey(guest)
    const owner = identicalOwners.get(key)
    if (owner !== undefined) {
      issues.push({
        field: `guests[${index}].fullName`,
        message: `This guest is identical to Guest ${owner + 1}. Enter each guest only once.`,
      })
    } else {
      identicalOwners.set(key, index)
    }
  })

  return issues
}

function identityKey(guest: BookingGuestInput): string {
  return [
    guest.fullName.toLowerCase().trim(),
    guest.aadhaarNumber,
    guest.gender,
    String(guest.age),
  ].join('|')
}

export function normalizePhone(value: string): string {
  const compact = value.replace(/[\s-]/g, '')
  return /^\+?91\d{10}$/.test(compact) ? compact.slice(-10) : compact
}