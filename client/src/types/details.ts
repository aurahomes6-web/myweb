import type { AirbnbStatusValue } from './admin'
import type { BookingStatusValue, GuestGenderValue, PaymentStatusValue } from './index'

/**
 * Admin → Details reporting types.
 *
 * This is a read-only projection of NORMAL bookings and AIRBNB reservations.
 * `aadhaarNumber` is the COMPLETE number: the whole section sits behind the
 * authenticated admin API and the requirement is that the admin sees it in full
 * in the table, the detail drawer and both exports.
 */

export type DetailsSourceFilter = 'ALL' | 'NORMAL' | 'AIRBNB'
export type DetailsDateBasis = 'checkIn' | 'bookingDate'
export type DetailsDatePreset = 'thisWeek' | 'thisMonth' | 'thisYear' | 'custom'
export type DetailsSortField =
  | 'checkIn'
  | 'checkOut'
  | 'bookingDate'
  | 'guestName'
  | 'property'
  | 'source'
  | 'status'
  | 'amount'
export type DetailsSortOrder = 'asc' | 'desc'
export type DetailsPageSize = 25 | 50 | 100

export interface DetailsGuest {
  id: string
  fullName: string
  aadhaarNumber: string
  gender: GuestGenderValue
  age: number
  phone: string | null
  isPrimary: boolean
}

export interface DetailsRecord {
  key: string
  id: string
  source: 'NORMAL' | 'AIRBNB'
  /** Booking code (NORMAL) or Airbnb reservation number (AIRBNB). */
  reference: string
  propertyId: string | null
  propertyName: string
  propertySlug: string | null
  checkIn: string
  checkOut: string
  nights: number
  guestName: string
  /** FULL Aadhaar — admin-only, never masked here. */
  aadhaarNumber: string
  gender: GuestGenderValue | null
  age: number | null
  guestCount: number
  primaryPhone: string
  status: BookingStatusValue | AirbnbStatusValue
  paymentStatus: PaymentStatusValue | null
  /** Server-stored effective amount in paise; null for Airbnb (no price columns). */
  amountPaise: number | null
  originalPricePaise: number | null
  discountPaise: number | null
  couponCode: string | null
  bookingDate: string
  notes: string | null
  utr: string | null
  paymentSubmittedAt: string | null
  paymentAcceptedAt: string | null
  paymentRejectedAt: string | null
  rejectionMessage: string | null
  guests: DetailsGuest[]
}

export interface DetailsBreakdownEntry {
  key: string
  label: string
  count: number
  guests: number
  nights: number
  amountPaise: number
}

export interface DetailsSummary {
  totalBookings: number
  normalBookings: number
  airbnbBookings: number
  cancelledBookings: number
  totalGuests: number
  occupiedNights: number
  totalAmountPaise: number
  amountBasis: 'NORMAL_BOOKINGS'
  byProperty: DetailsBreakdownEntry[]
  bySource: Array<{ key: 'NORMAL' | 'AIRBNB'; label: string; count: number }>
  byMonth: DetailsBreakdownEntry[]
}

export interface DetailsPropertyOption {
  id: string
  name: string
  slug: string
}

export interface DetailsDateRange {
  from: string
  to: string
}

/** Every filter the admin can combine. Sent to the server verbatim. */
export interface DetailsFilters {
  source: DetailsSourceFilter
  propertyId: string
  status: string
  paymentStatus: string
  search: string
  dateBasis: DetailsDateBasis
  preset: DetailsDatePreset
  dateFrom: string
  dateTo: string
  sortBy: DetailsSortField
  sortOrder: DetailsSortOrder
  page: number
  pageSize: DetailsPageSize
}

export interface DetailsResponse {
  records: DetailsRecord[]
  total: number
  page: number
  pageSize: number
  pageCount: number
  summary: DetailsSummary
  properties: DetailsPropertyOption[]
  appliedQuery: {
    source: DetailsSourceFilter
    propertyId: string | null
    status: string | null
    paymentStatus: string | null
    search: string | null
    dateBasis: DetailsDateBasis
    preset: DetailsDatePreset
    range: DetailsDateRange
    sortBy: DetailsSortField
    sortOrder: DetailsSortOrder
  }
}

export const DEFAULT_DETAILS_FILTERS: DetailsFilters = {
  source: 'ALL',
  propertyId: '',
  status: '',
  paymentStatus: '',
  search: '',
  dateBasis: 'checkIn',
  preset: 'thisMonth',
  dateFrom: '',
  dateTo: '',
  sortBy: 'checkIn',
  sortOrder: 'desc',
  page: 1,
  pageSize: 25,
}

export const DETAILS_SOURCE_OPTIONS: ReadonlyArray<{ value: DetailsSourceFilter; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'AIRBNB', label: 'Airbnb' },
]

/** Statuses that actually exist in the schema (BookingStatus ∪ AirbnbStatus). */
export const DETAILS_STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'ACTIVE', label: 'Active (Airbnb)' },
]

export const DETAILS_PAYMENT_STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'REJECTED', label: 'Rejected' },
]

export const DETAILS_DATE_PRESET_OPTIONS: ReadonlyArray<{
  value: DetailsDatePreset
  label: string
}> = [
  { value: 'thisWeek', label: 'This Week' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'thisYear', label: 'This Year' },
  { value: 'custom', label: 'Custom Range' },
]

export const DETAILS_DATE_BASIS_OPTIONS: ReadonlyArray<{
  value: DetailsDateBasis
  /** Text of the option in the "Date basis" select. */
  label: string
  /** Prefix used in the line that spells the active basis out under the filters. */
  summaryLabel: string
  hint: string
}> = [
  {
    value: 'checkIn',
    label: 'Check-in date',
    summaryLabel: 'Date: Check-in',
    hint: 'Filters and month breakdowns use the guest check-in date.',
  },
  {
    value: 'bookingDate',
    label: 'Booking date',
    summaryLabel: 'Date: Booking Date',
    hint: 'Filters and month breakdowns use the date the booking was created.',
  },
]

export const DETAILS_SORT_OPTIONS: ReadonlyArray<{ value: DetailsSortField; label: string }> = [
  { value: 'checkIn', label: 'Check-in' },
  { value: 'checkOut', label: 'Check-out' },
  { value: 'bookingDate', label: 'Booking date' },
  { value: 'guestName', label: 'Guest name' },
  { value: 'property', label: 'Property' },
  { value: 'source', label: 'Source' },
  { value: 'status', label: 'Status' },
  { value: 'amount', label: 'Amount' },
]

export const DETAILS_PAGE_SIZE_OPTIONS: ReadonlyArray<DetailsPageSize> = [25, 50, 100]
