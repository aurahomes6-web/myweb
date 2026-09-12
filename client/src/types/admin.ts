import type { BookingStatusValue, GuestGenderValue } from '@/types'

export type AirbnbStatusValue = 'ACTIVE' | 'CANCELLED'

export interface AdminPropertyRef {
  id: string
  name: string
  slug: string
  shortLabel: string
}

/**
 * Admin guest with FULL Aadhaar.
 *
 * These types are ONLY consumed inside the `/admin/*` section. The full
 * `aadhaarNumber` is never sent to any public endpoint — the public API always
 * returns `aadhaarNumberMasked` only.
 */
export interface AdminGuest {
  id: string
  fullName: string
  aadhaarNumber: string
  aadhaarNumberMasked: string
  gender: GuestGenderValue
  age: number
  phone: string | null
  isPrimary: boolean
}

export interface AdminBooking {
  id: string
  code: string
  propertyId: string
  property: AdminPropertyRef
  checkIn: string
  checkOut: string
  nights: number
  guestCount: number
  primaryPhone: string
  notes: string | null
  status: BookingStatusValue
  createdAt: string
  updatedAt: string
  guests: AdminGuest[]
}

export interface AdminAirbnb {
  id: string
  /** Null when the reservation came from the public flow and has no home assigned yet. */
  propertyId: string | null
  property: AdminPropertyRef | null
  reservationNumber: string
  guestName: string
  primaryPhone: string
  checkIn: string
  checkOut: string
  nights: number
  guestCount: number
  status: AirbnbStatusValue
  notes: string | null
  createdAt: string
  updatedAt: string
  guests: AdminGuest[]
}

export interface AdminProperty {
  id: string
  slug: string
  name: string
  shortLabel: string
  description: string
  shortDescription: string
  capacity: number
  bedrooms: number
  beds: number | null
  bathrooms: number
  sqft: number
  amenities: string[]
  accent: string
  visual: string
  location: string | null
}

export interface AdminGuestPayload {
  fullName: string
  aadhaarNumber: string
  gender: GuestGenderValue
  age: number
  phone?: string
}

export interface BookingUpdatePayload {
  propertyId: string
  checkIn: string
  checkOut: string
  guestCount: number
  primaryPhone: string
  notes?: string
  guests: AdminGuestPayload[]
}

export interface AdminAirbnbPayload {
  propertyId: string
  reservationNumber: string
  guestName: string
  primaryPhone: string
  checkIn: string
  checkOut: string
  guestCount: number
  notes?: string
  guests: AdminGuestPayload[]
}

export type AdminPropertyPayload = Omit<AdminProperty, 'id' | 'slug'>

/** Error shape returned by the admin API (mirrors the server controller). */
export interface AdminApiErrorShape {
  error: string
  message: string
  details?: Array<{ field: string; message: string }>
}

/** Result of a Database Cleanup action (counters of removed rows). */
export interface AdminCleanupResult {
  deletedBookings: number
  deletedGuests: number
  deletedReservations: number
  deletedAirbnbGuests: number
  deletedBlockedDates: number
}