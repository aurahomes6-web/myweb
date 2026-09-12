import type { AdminGuest } from '@/types/admin'
import type { GuestGenderValue } from '@/types'

export interface GuestEditorValue {
  fullName: string
  aadhaarNumber: string
  gender: GuestGenderValue
  age: string
  phone?: string
}

export const GENDERS: ReadonlyArray<GuestGenderValue> = [
  'MALE',
  'FEMALE',
  'OTHER',
  'PREFER_NOT_TO_SAY',
]

export function emptyGuest(withPhone = false): GuestEditorValue {
  return { fullName: '', aadhaarNumber: '', gender: 'PREFER_NOT_TO_SAY', age: '', phone: withPhone ? '' : undefined }
}

export function fromAdminGuest(guest: AdminGuest): GuestEditorValue {
  return {
    fullName: guest.fullName,
    aadhaarNumber: guest.aadhaarNumber,
    gender: guest.gender,
    age: String(guest.age),
    phone: guest.phone ?? '',
  }
}

export function validateGuestsRows(rows: GuestEditorValue[]): string[] {
  const errors: string[] = []
  rows.forEach((row, index) => {
    const label = `${index + 1}`
    if (!row.fullName.trim()) errors.push(`Guest ${label}: name is required`)
    if (!/^\d{12}$/.test(row.aadhaarNumber.trim())) errors.push(`Guest ${label}: Aadhaar must be exactly 12 digits`)
    const age = Number(row.age)
    if (!Number.isInteger(age) || age < 1 || age > 150) errors.push(`Guest ${label}: age must be between 1 and 150`)
  })
  return errors
}