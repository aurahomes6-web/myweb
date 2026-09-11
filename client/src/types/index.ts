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
  guestName: string
  guestEmail: string
  guestPhone: string
  guests: number
  notes?: string
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