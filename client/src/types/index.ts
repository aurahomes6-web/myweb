export type AccentKind = 'purple' | 'cyan' | 'magenta'

export type VisualKind = 'moon' | 'dawn' | 'evening'

export type PropertySlug =
  | 'aura-cozy-penthouse-1'
  | 'aura-cozy-penthouse-2'
  | 'aura-cozy-penthouse-3'

export interface PropertyImage {
  id: string
  label: string
  image: string | null
  accent: AccentKind
  variant: VisualKind
}

export interface Property {
  id: string
  name: string
  slug: PropertySlug
  shortLabel: string
  description: string
  shortDescription: string
  image: string | null
  gallery: PropertyImage[]
  accent: AccentKind
  visual: VisualKind
  capacity: number
  bedrooms: number
  bathrooms: number
  sqft: number
  amenities: string[]
  location: string | null
}

export interface BookingFormData {
  propertyId: string
  checkIn: string
  checkOut: string
  guestCount: number
  primaryPhone: string
  guests: BookingGuestPayload[]
  notes?: string
}

export type GuestGenderValue = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY'

/** Per-guest details sent to the booking API. */
export interface BookingGuestPayload {
  fullName: string
  aadhaarNumber: string
  gender: GuestGenderValue
  age: number
}

/** Safe per-guest view returned by the API (never contains Aadhaar). */
export interface BookingGuestView {
  fullName: string
  gender: GuestGenderValue
  age: number
  phone: string | null
  isPrimary: boolean
  /** Only the last 4 digits are ever visible — the full Aadhaar is never exposed. */
  aadhaarNumberMasked: string
}

export type BookingStatusValue = 'PENDING' | 'CONFIRMED' | 'CANCELLED'

export type BookingNotificationStatus =
  | 'NOT_CONFIGURED'
  | 'PROVIDER_PENDING'
  | 'SENT'
  | 'FAILED'

export interface BookingResponse {
  id: string
  code: string
  propertyId: string
  checkIn: string
  checkOut: string
  guestCount: number
  primaryPhone: string
  notes: string | null
  status: BookingStatusValue
  createdAt: string
  guests: BookingGuestView[]
  property: {
    name: string
    slug: string
    shortLabel?: string
    location?: string | null
  }
  notification?: {
    status: BookingNotificationStatus
    sent: boolean
    recipient?: string
  } | null
}

export type BookingErrorCode =
  | 'VALIDATION_ERROR'
  | 'PROPERTY_NOT_FOUND'
  | 'CAPACITY_EXCEEDED'
  | 'PROPERTY_UNAVAILABLE'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR'

export interface BookingApiErrorShape {
  error: BookingErrorCode
  message: string
  details?: Array<{ field: string; message: string }>
}

export interface HealthResponse {
  status: string
  timestamp: string
  uptime: number
}

/* ---------------- Availability (frontend service contract) ---------------- */

export interface AvailabilityCheckRequest {
  propertyId: PropertySlug
  checkIn: string
  checkOut: string
  guests: number
}

export interface AvailabilityResult {
  available: boolean
  nights: number
}

export type AvailabilityStatus = 'idle' | 'loading' | 'available' | 'unavailable' | 'error'