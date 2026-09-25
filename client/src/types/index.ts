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
  /** Structured capacity range (THE SPACE). `maxGuests` mirrors `capacity`. */
  minGuests: number
  maxGuests: number
  bedrooms: number
  /** Physical bed count; only populated when the API provides it. */
  beds?: number
  bathrooms: number
  sqft: number
  amenities: string[]
  location: string | null
  /** Nightly rate in integer paise (₹3,000 → 300000). Phase 5. */
  pricePerNightPaise: number
  discountedPricePerNightPaise: number | null
  /** DB-backed images (Phase 5). Falls back to `image`/`gallery` when empty. */
  images: PropertyApiImage[]
  /** Admin-configured THE SPACE cards, ordered by `sort`. */
  spaceAttributes: PropertySpaceAttribute[]
}

/** A photograph referenced by the database (admin-uploaded, Phase 5). */
export interface PropertyApiImage {
  id: string
  kind: string
  sort: number
  url: string | null
  alt: string
}

/** One admin-configured “THE SPACE” card shown on the public property page. */
export interface PropertySpaceAttribute {
  id: string
  label: string
  value: string
  /** Optional icon identifier; maps to a lucide icon on the public page. */
  icon: string | null
  sort: number
}

export interface BookingFormData {
  propertyId: string
  checkIn: string
  checkOut: string
  guestCount: number
  primaryPhone: string
  guests: BookingGuestPayload[]
  notes?: string
  /** Optional referral/offer code. Sent verbatim; the server applies the discount. */
  couponCode?: string
  /**
   * UPI transaction reference for the direct-UPI payment flow. Required for the
   * normal booking path — the guest pays via UPI QR and submits the UTR here.
   */
  utr?: string
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

/**
 * Direct-UPI payment state on a normal booking.
 * PENDING → UTR submitted, awaiting admin review (dates held).
 * ACCEPTED → admin confirmed the transfer (dates held).
 * REJECTED → admin declined; the booking is cancelled and dates released.
 */
export type PaymentStatusValue = 'PENDING' | 'ACCEPTED' | 'REJECTED'

export type BookingNotificationStatus =
  | 'NOT_CONFIGURED'
  | 'PROVIDER_PENDING'
  | 'SENT'
  | 'FAILED'

export type AvailableCouponDiscountType = 'FIXED' | 'PERCENTAGE'

/** A coupon successfully validated against the public endpoint. */
export interface ValidatedCoupon {
  code: string
  discountType: AvailableCouponDiscountType
  discountValue: number
  /** Exact discount the server computed for these dates (server-authoritative). */
  discountPaise: number
}

/** Applied state lifted to the booking summary so totals can react. */
export interface AppliedCoupon {
  code: string
  discountPaise: number
}

/** Global AURA HOMES contact configuration shown in the public footer. */
export interface ContactInfo {
  email: string
  phone: string
  description: string
}

export interface HomepageSettingsInfo {
  visualImageUrl: string | null
  visualImageAlt: string
}

/**
 * Direct-UPI payment details fetched from GET /api/payment-settings and shown
 * on the customer payment page (payee name, UPI id, phone and the active QR).
 * Values are admin-editable; a fetch failure falls back to the site defaults so
 * the page never renders blank.
 */
export interface PaymentSettingsInfo {
  upiName: string
  upiId: string
  upiPhone: string
  qrCodeUrl: string
}

export type CouponValidationStatus = 'idle' | 'loading' | 'applied' | 'error'

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
  paymentStatus: PaymentStatusValue | null
  paymentSubmittedAt: string | null
  paymentAcceptedAt: string | null
  paymentRejectedAt: string | null
  rejectionMessage: string | null
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
  /**
   * The customer's own WhatsApp pre-fill message. Present ONLY in the create
   * response (POST /api/bookings) and carries the full 12-digit Aadhaar exactly
   * so it can be placed into the wa.me click-to-chat link. The public GET
   * lookup never includes it — after a refresh only the masked view remains.
   */
  whatsAppMessage?: string
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

/* ---------------- Airbnb details → WhatsApp (Phase 7) ---------------- */

export interface AirbnbGuestPayload {
  fullName: string
  aadhaarNumber: string
  gender: GuestGenderValue
  age: number
}

/** Form data collected from a customer who already booked via Airbnb. */
export interface AirbnbFormData {
  reservationNumber: string
  guestName: string
  primaryPhone: string
  checkIn: string
  checkOut: string
  guestCount: number
  guests: AirbnbGuestPayload[]
}

/**
 * Stateless server response for the Airbnb → WhatsApp flow. `message` is the
 * WhatsApp pre-fill and carries each guest's full Aadhaar for the customer's
 * own documentary send; it is returned only inside this submission response.
 */
export interface AirbnbDetailsResult {
  status: 'ok'
  reservationNumber: string
  message: string
  recipient?: string
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

/**
 * Public booking status returned by GET /api/bookings/track/:bookingId.
 *
 * This is an intentionally tiny, safe surface: no guests, no phones, no ids
 * and no UTR — a guest can only verify their own booking by its booking code.
 */
export interface BookingTrackingResult {
  code: string
  status: BookingStatusValue
  paymentStatus: PaymentStatusValue | null
  rejectionMessage: string | null
  paymentSubmittedAt: string | null
  paymentAcceptedAt: string | null
  paymentRejectedAt: string | null
  checkIn: string
  checkOut: string
  nights: number
  guestCount: number
  originalPricePaise: number | null
  discountPaise: number | null
  finalPricePaise: number | null
  property: {
    id: string
    name: string
    slug: string
    shortLabel: string
  }
}

export type AvailabilityStatus = 'idle' | 'loading' | 'available' | 'unavailable' | 'error'