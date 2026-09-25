import type { BookingStatusValue, GuestGenderValue, PaymentStatusValue } from '@/types'

export type AirbnbStatusValue = 'ACTIVE' | 'CANCELLED'

/** An uploaded property photograph (Phase 5), shaped like the admin serializer. */
export interface AdminPropertyImage {
  id: string
  kind: string
  sort: number
  url: string
  alt: string
}

/** One “THE SPACE” attribute card as returned by the admin API. */
export interface AdminSpaceAttribute {
  id: string
  label: string
  value: string
  icon: string | null
  sort: number
}

/** Editable “THE SPACE” attribute card sent when saving. */
export interface AdminSpaceAttributeInput {
  label: string
  value: string
  icon: string | null
}

/** Full “THE SPACE” document returned by GET/PUT /admin/properties/:id/space. */
export interface AdminPropertySpace {
  minGuests: number
  maxGuests: number
  attributes: AdminSpaceAttribute[]
}

/** Payload for PUT /admin/properties/:id/space (full replace). */
export interface AdminPropertySpacePayload {
  minGuests: number
  maxGuests: number
  attributes: AdminSpaceAttributeInput[]
}

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
  paymentStatus: PaymentStatusValue | null
  utr: string | null
  paymentSubmittedAt: string | null
  paymentAcceptedAt: string | null
  paymentRejectedAt: string | null
  rejectionMessage: string | null
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
  minGuests: number
  maxGuests: number
  bedrooms: number
  beds: number | null
  bathrooms: number
  sqft: number
  amenities: string[]
  accent: string
  visual: string
  location: string | null
  /** Nightly rate in integer paise (₹3,000 → 300000). Server-authoritative. */
  pricePerNightPaise: number
  discountedPricePerNightPaise: number | null
  /** Uploaded photographs (Phase 5). Empty when the static fallbacks are used. */
  images: AdminPropertyImage[]
  /** Ordered THE SPACE attribute cards for this home. */
  spaceAttributes: AdminSpaceAttribute[]
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

export type AdminPropertyPayload = Omit<
  AdminProperty,
  'id' | 'slug' | 'images' | 'minGuests' | 'maxGuests' | 'spaceAttributes'
>

/** Image slot names accepted by the admin image endpoints (server: imageService). */
export type AdminImageSlot = 'main' | 'sub1' | 'sub2' | 'sub3' | 'extra'

export type AdminCouponDiscountType = 'FIXED' | 'PERCENTAGE'

/** Coupon row as returned by the admin coupon endpoints (server: couponService DTO). */
export interface AdminCoupon {
  id: string
  code: string
  discountType: AdminCouponDiscountType
  /** FIXED → paise; PERCENTAGE → whole percent. */
  discountValue: number
  maxUses: number | null
  expiresAt: string | null
  deactivatedAt: string | null
  createdAt: string
  updatedAt: string
  uses: number
  usageCount: number
}

/** Payload for creating a coupon (server: parseCouponInput — exact fields). */
export interface AdminCouponPayload {
  code: string
  discountType: AdminCouponDiscountType
  discountValue: number
  maxUses: number | null
  /** YYYY-MM-DD date. Server stores it as end-of-day UTC. */
  expiresAt: string | null
}

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

/** Global contact configuration editable from the Contact admin tab. */
export interface AdminContactSettings {
  email: string
  phone: string
  description: string
}

export interface AdminHomepageSettings {
  visualImageUrl: string | null
  visualImageAlt: string
  visualSource: 'custom' | 'fallback'
}

export interface AdminMarqueeNotification {
  id: string
  message: string
  isActive: boolean
  sort: number
  createdAt: string
  updatedAt: string
}

export interface AdminMarqueeNotificationPayload {
  message?: string
  isActive?: boolean
}

/**
 * Direct-UPI payment settings editable from the Payment Settings admin tab.
 * `qrCodeUrl` is the ACTIVE QR asset (a Vercel Blob URL once one is uploaded,
 * otherwise the static `/qr.jpeg` fallback); `qrSource` tells the UI which of
 * the two is currently in use.
 */
export interface AdminPaymentSettings {
  upiName: string
  upiId: string
  upiPhone: string
  qrCodeUrl: string
  qrSource: 'blob' | 'fallback'
}

/**
 * A direct-UPI payment record as seen by the admin (server: paymentService DTO).
 * This is the ONLY place a guest's UTR is shown to staff — it is never
 * returned by any public API.
 */
export interface AdminPayment {
  id: string
  code: string
  propertyId: string
  property: AdminPropertyRef
  checkIn: string
  checkOut: string
  nights: number
  guestCount: number
  primaryPhone: string
  paymentStatus: PaymentStatusValue
  utr: string | null
  paymentSubmittedAt: string
  paymentAcceptedAt: string | null
  paymentRejectedAt: string | null
  rejectionMessage: string | null
  bookingStatus: BookingStatusValue
  originalPricePaise: number | null
  discountPaise: number | null
  finalPricePaise: number | null
}