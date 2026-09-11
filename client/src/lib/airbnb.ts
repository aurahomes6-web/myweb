import type { GuestGenderValue } from '@/types'

/**
 * Airbnb details form state (Phase 7), mirroring the guest form of the direct
 * booking flow. Server-side validation in `airbnbValidation.ts` is the source
 * of truth — this module fails fast with the same messages for inline errors.
 */

export interface AirbnbGuestRow {
  fullName: string
  aadhaar: string
  gender: '' | GuestGenderValue
  age: string
}

export interface AirbnbFormState {
  reservationNumber: string
  guestName: string
  primaryPhone: string
  checkIn: string
  checkOut: string
  guestCount: number
  guests: AirbnbGuestRow[]
}

export const MAX_AIRBNB_GUESTS = 12

function normalizeDigits(value: string): string {
  return value.replace(/[\s-]/g, '')
}

export function normalizeReservationNumber(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]/g, '')
}

function isIndianPhone(value: string): boolean {
  const compact = value.replace(/[\s-]/g, '')
  if (/^\+?91\d{10}$/.test(compact)) return /^[6-9]\d{9}$/.test(compact.slice(-10))
  return /^[6-9]\d{9}$/.test(compact)
}

function isISO(key: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && !Number.isNaN(Date.parse(`${key}T00:00:00.000Z`))
}

export function validateAirbnbForm(form: AirbnbFormState): Record<string, string> {
  const errors: Record<string, string> = {}

  if (!form.reservationNumber.trim()) {
    errors.reservationNumber = 'Airbnb reservation number is required.'
  } else if (!/^[A-Z0-9]{4,24}$/.test(normalizeReservationNumber(form.reservationNumber))) {
    errors.reservationNumber = 'Use 4 to 24 letters and numbers (e.g. ABC123456).'
  }

  if (!form.guestName.trim()) {
    errors.guestName = 'Reservation name is required.'
  } else if (form.guestName.trim().length > 120) {
    errors.guestName = 'Name is too long.'
  }

  if (!form.primaryPhone.trim()) {
    errors.primaryPhone = 'A primary contact phone is required.'
  } else if (!isIndianPhone(form.primaryPhone)) {
    errors.primaryPhone = 'Enter a valid 10-digit Indian mobile number.'
  }

  if (!isISO(form.checkIn)) {
    errors.checkIn = 'Check-in is required.'
  }

  if (!isISO(form.checkOut)) {
    errors.checkOut = 'Check-out is required.'
  } else if (isISO(form.checkIn) && form.checkOut <= form.checkIn) {
    errors.checkOut = 'Check-out must be after check-in.'
  }

  if (!Number.isInteger(form.guestCount) || form.guestCount < 1 || form.guestCount > MAX_AIRBNB_GUESTS) {
    errors.guestCount = `Number of guests must be between 1 and ${MAX_AIRBNB_GUESTS}.`
  }

  form.guests.forEach((row, index) => {
    const key = `g${index}`

    if (!row.fullName.trim()) {
      errors[`${key}.fullName`] = 'Full name is required.'
    } else if (row.fullName.trim().length > 120) {
      errors[`${key}.fullName`] = 'Full name is too long.'
    }

    const aadhaar = normalizeDigits(row.aadhaar)
    if (!aadhaar) {
      errors[`${key}.aadhaar`] = 'Aadhaar number is required.'
    } else if (!/^\d{12}$/.test(aadhaar)) {
      errors[`${key}.aadhaar`] = 'Aadhaar must be exactly 12 digits.'
    }

    if (!row.gender) {
      errors[`${key}.gender`] = 'Please choose a gender.'
    }

    if (!row.age) {
      errors[`${key}.age`] = 'Age is required.'
    } else {
      const age = Number(row.age)
      if (!Number.isInteger(age) || age < 1 || age > 120) {
        errors[`${key}.age`] = 'Age must be a whole number between 1 and 120.'
      }
    }
  })

  const aadhaarOwners = new Map<string, number>()
  const validAadhaar = new Set<string>()
  form.guests.forEach((row) => {
    const aadhaar = normalizeDigits(row.aadhaar)
    if (/^\d{12}$/.test(aadhaar)) validAadhaar.add(aadhaar)
  })
  form.guests.forEach((row, index) => {
    const key = `g${index}`
    const aadhaar = normalizeDigits(row.aadhaar)
    if (!validAadhaar.has(aadhaar)) return
    const owner = aadhaarOwners.get(aadhaar)
    if (owner !== undefined) {
      errors[`${key}.aadhaar`] = `Each guest must have a unique Aadhaar number. Guest ${owner + 1} already uses it.`
    } else {
      aadhaarOwners.set(aadhaar, index)
    }
  })

  const seenIdentical = new Map<string, number>()
  form.guests.forEach((row, index) => {
    const key = `g${index}`
    const aadhaar = normalizeDigits(row.aadhaar)
    if (!/^\d{12}$/.test(aadhaar)) return
    const identity = [row.fullName.trim().toLowerCase(), aadhaar, row.gender, row.age].join('|')
    const owner = seenIdentical.get(identity)
    if (owner !== undefined && !errors[`${key}.fullName`]) {
      errors[`${key}.fullName`] = `This guest is identical to Guest ${owner + 1}. Enter each guest only once.`
    } else {
      seenIdentical.set(identity, index)
    }
  })

  return errors
}