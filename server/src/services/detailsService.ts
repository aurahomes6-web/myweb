import type { PrismaClient } from '../generated/prisma/client.js'
import type { AirbnbStatus, BookingStatus, GuestGender, PaymentStatus } from '../generated/prisma/enums.js'
import { addDays, nightsBetween, toDateKey, toUtcDate } from '../lib/dateUtils.js'
import {
  AIRBNB_STATUSES,
  NORMAL_BOOKING_STATUSES,
  type DetailsQuery,
} from '../lib/detailsQueryValidation.js'
import { propertyDisplayOrderBy } from '../lib/propertyOrder.js'

/**
 * Admin → Details reporting layer (READ-ONLY).
 *
 * This is a reporting view over data that ALREADY exists. It does not merge,
 * migrate or rewrite the normal booking and Airbnb systems: it runs two
 * independent, database-filtered queries (one per source), normalises both into
 * a single display shape, and then merges/sorts/slices them for one paginated
 * table. Nothing in this module writes, and no booking, payment, coupon or
 * block-date behaviour is touched.
 *
 * Aadhaar is intentionally returned in FULL. The only caller is the admin-only
 * controller behind `requireAdmin`, and the spec requires the complete number in
 * the table, the detail drawer and both exports. It is never logged here.
 */

export type DetailsSourceValue = 'NORMAL' | 'AIRBNB'

/** Hard ceiling on how many filtered records one request may materialise. */
export const MAX_DETAILS_RECORDS = 5000

export class DetailsTooLargeError extends Error {
  override readonly name = 'DetailsTooLargeError' as const
  constructor(count: number) {
    super(
      `This filter matches ${count} records, which is more than the ${MAX_DETAILS_RECORDS}-record report limit. Narrow the date range or filters and try again.`
    )
  }
}

export interface DetailsGuest {
  id: string
  fullName: string
  /** FULL 12-digit Aadhaar — admin-only, never masked. */
  aadhaarNumber: string
  gender: GuestGender
  age: number
  phone: string | null
  isPrimary: boolean
}

export interface DetailsRecord {
  /** Composite row key: `${source}:${id}`. */
  key: string
  id: string
  source: DetailsSourceValue
  /** Booking code for NORMAL, Airbnb reservation number for AIRBNB. */
  reference: string
  propertyId: string | null
  propertyName: string
  propertySlug: string | null
  checkIn: string
  checkOut: string
  nights: number
  guestName: string
  aadhaarNumber: string
  gender: GuestGender | null
  age: number | null
  guestCount: number
  primaryPhone: string
  status: BookingStatus | AirbnbStatus
  paymentStatus: PaymentStatus | null
  /** Server-stored effective amount in paise. `null` for Airbnb (no price columns exist). */
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
  /** Airbnb rows carry no amount in the schema, so this is what `totalAmountPaise` covers. */
  amountBasis: 'NORMAL_BOOKINGS'
  byProperty: DetailsBreakdownEntry[]
  bySource: Array<{ key: DetailsSourceValue; label: string; count: number }>
  byMonth: DetailsBreakdownEntry[]
}

export interface DetailsPropertyOption {
  id: string
  name: string
  slug: string
}

export interface DetailsResult {
  records: DetailsRecord[]
  total: number
  page: number
  pageSize: number
  pageCount: number
  summary: DetailsSummary
  properties: DetailsPropertyOption[]
}

// ── Prisma where builders ───────────────────────────────────────────────────

const insensitive = (value: string) => ({ contains: value, mode: 'insensitive' as const })

/**
 * Inclusive YYYY-MM-DD window as a half-open range. `dateBasis` decides WHICH
 * column the window applies to, so the caller can always show the basis in the
 * UI instead of guessing.
 */
function dateWindow(query: DetailsQuery) {
  const from = toUtcDate(query.range.from)
  const exclusiveTo = toUtcDate(addDays(query.range.to, 1))
  return { gte: from, lt: exclusiveTo }
}

/**
 * Whether a source can contribute rows at all for this query.
 *
 * A status filter is an exact value match, so a NORMAL-only status
 * (`CONFIRMED`, `PENDING`) or a payment-status filter must EXCLUDE Airbnb
 * reservations rather than quietly leaving them unfiltered. Skipping the query
 * entirely also keeps an enum value that is not valid for a table
 * (`status: 'ACTIVE'` on a booking) from ever reaching Prisma.
 */
function sourceContributes(query: DetailsQuery, source: DetailsSourceValue): boolean {
  if (query.source !== 'ALL' && query.source !== source) return false
  if (query.status !== null) {
    const allowed =
      source === 'NORMAL' ? NORMAL_BOOKING_STATUSES : AIRBNB_STATUSES
    if (!(allowed as readonly string[]).includes(query.status)) return false
  }
  // Payment state is only stored for normal bookings.
  if (query.paymentStatus !== null && source !== 'NORMAL') return false
  return true
}

function bookingWhere(query: DetailsQuery) {
  const clauses: Record<string, unknown>[] = []

  if (query.propertyId) clauses.push({ propertyId: query.propertyId })
  if (query.status) clauses.push({ status: query.status as BookingStatus })
  if (query.paymentStatus) clauses.push({ paymentStatus: query.paymentStatus as PaymentStatus })

  const window = dateWindow(query)
  clauses.push(
    query.dateBasis === 'bookingDate' ? { createdAt: window } : { checkIn: window }
  )

  if (query.search) {
    const term = query.search
    clauses.push({
      OR: [
        { code: insensitive(term) },
        { primaryPhone: insensitive(term) },
        { utr: insensitive(term) },
        { couponCode: insensitive(term) },
        { property: { name: insensitive(term) } },
        { guestRecords: { some: { fullName: insensitive(term) } } },
        { guestRecords: { some: { aadhaarNumber: insensitive(term) } } },
      ],
    })
  }

  return { AND: clauses }
}

function airbnbWhere(query: DetailsQuery) {
  const clauses: Record<string, unknown>[] = []

  if (query.propertyId) clauses.push({ propertyId: query.propertyId })
  if (query.status) clauses.push({ status: query.status as AirbnbStatus })

  const window = dateWindow(query)
  clauses.push(
    query.dateBasis === 'bookingDate' ? { createdAt: window } : { checkIn: window }
  )

  if (query.search) {
    const term = query.search
    clauses.push({
      OR: [
        { reservationNumber: insensitive(term) },
        { guestName: insensitive(term) },
        { primaryPhone: insensitive(term) },
        { property: { name: insensitive(term) } },
        { guestRecords: { some: { fullName: insensitive(term) } } },
        { guestRecords: { some: { aadhaarNumber: insensitive(term) } } },
      ],
    })
  }

  return { AND: clauses }
}

const guestSelect = {
  id: true,
  fullName: true,
  aadhaarNumber: true,
  gender: true,
  age: true,
  phone: true,
  isPrimary: true,
} as const

const propertySelect = { id: true, name: true, slug: true } as const

interface RawBooking {
  id: string
  code: string
  propertyId: string
  checkIn: Date
  checkOut: Date
  guestCount: number
  primaryPhone: string
  status: BookingStatus
  paymentStatus: PaymentStatus | null
  utr: string | null
  paymentSubmittedAt: Date | null
  paymentAcceptedAt: Date | null
  paymentRejectedAt: Date | null
  rejectionMessage: string | null
  originalPricePaise: number | null
  discountPaise: number | null
  finalPricePaise: number | null
  couponCode: string | null
  createdAt: Date
  notes: string | null
  property: { id: string; name: string; slug: string }
  guestRecords: Array<{
    id: string
    fullName: string
    aadhaarNumber: string
    gender: GuestGender
    age: number
    phone: string | null
    isPrimary: boolean
  }>
}

interface RawAirbnb {
  id: string
  reservationNumber: string
  propertyId: string | null
  checkIn: Date
  checkOut: Date
  guestCount: number
  primaryPhone: string
  guestName: string
  status: AirbnbStatus
  notes: string | null
  createdAt: Date
  property: { id: string; name: string; slug: string } | null
  guestRecords: Array<{
    id: string
    fullName: string
    aadhaarNumber: string
    gender: GuestGender
    age: number
    phone: string | null
    isPrimary: boolean
  }>
}

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null
}

function normalizeBooking(row: RawBooking): DetailsRecord {
  const guests: DetailsGuest[] = row.guestRecords.map((guest) => ({ ...guest }))
  const primary =
    guests.find((guest) => guest.isPrimary) ?? guests[0] ?? null

  return {
    key: `NORMAL:${row.id}`,
    id: row.id,
    source: 'NORMAL',
    reference: row.code,
    propertyId: row.propertyId,
    propertyName: row.property?.name ?? '—',
    propertySlug: row.property?.slug ?? null,
    checkIn: toDateKey(row.checkIn),
    checkOut: toDateKey(row.checkOut),
    nights: nightsBetween(toDateKey(row.checkIn), toDateKey(row.checkOut)),
    guestName: primary?.fullName ?? '—',
    aadhaarNumber: primary?.aadhaarNumber ?? '',
    gender: primary?.gender ?? null,
    age: primary?.age ?? null,
    guestCount: row.guestCount,
    primaryPhone: row.primaryPhone,
    status: row.status,
    paymentStatus: row.paymentStatus,
    amountPaise: row.finalPricePaise ?? row.originalPricePaise,
    originalPricePaise: row.originalPricePaise,
    discountPaise: row.discountPaise,
    couponCode: row.couponCode,
    bookingDate: row.createdAt.toISOString(),
    notes: row.notes,
    utr: row.utr,
    paymentSubmittedAt: isoOrNull(row.paymentSubmittedAt),
    paymentAcceptedAt: isoOrNull(row.paymentAcceptedAt),
    paymentRejectedAt: isoOrNull(row.paymentRejectedAt),
    rejectionMessage: row.rejectionMessage,
    guests,
  }
}

function normalizeAirbnb(row: RawAirbnb): DetailsRecord {
  const guests: DetailsGuest[] = row.guestRecords.map((guest) => ({ ...guest }))
  const primary = guests[0] ?? null

  return {
    key: `AIRBNB:${row.id}`,
    id: row.id,
    source: 'AIRBNB',
    reference: row.reservationNumber,
    propertyId: row.propertyId,
    propertyName: row.property?.name ?? 'Unassigned',
    propertySlug: row.property?.slug ?? null,
    checkIn: toDateKey(row.checkIn),
    checkOut: toDateKey(row.checkOut),
    nights: nightsBetween(toDateKey(row.checkIn), toDateKey(row.checkOut)),
    guestName: row.guestName || primary?.fullName || '—',
    aadhaarNumber: primary?.aadhaarNumber ?? '',
    gender: primary?.gender ?? null,
    age: primary?.age ?? null,
    guestCount: row.guestCount,
    primaryPhone: row.primaryPhone,
    status: row.status,
    // The AirbnbReservation model stores no pricing/payment columns, so no
    // amount is reported. Nothing is invented here.
    paymentStatus: null,
    amountPaise: null,
    originalPricePaise: null,
    discountPaise: null,
    couponCode: null,
    bookingDate: row.createdAt.toISOString(),
    notes: row.notes,
    utr: null,
    paymentSubmittedAt: null,
    paymentAcceptedAt: null,
    paymentRejectedAt: null,
    rejectionMessage: null,
    guests,
  }
}

function isCancelled(record: DetailsRecord): boolean {
  return record.status === 'CANCELLED'
}

function sortValue(record: DetailsRecord, field: DetailsQuery['sortBy']): string | number {
  switch (field) {
    case 'checkIn':
      return record.checkIn
    case 'checkOut':
      return record.checkOut
    case 'bookingDate':
      return record.bookingDate
    case 'guestName':
      return record.guestName
    case 'property':
      return record.propertyName
    case 'source':
      return record.source
    case 'status':
      return record.status
    case 'amount':
      return record.amountPaise ?? -1
    default:
      return record.checkIn
  }
}

export function sortDetailsRecords(
  records: DetailsRecord[],
  field: DetailsQuery['sortBy'],
  order: DetailsQuery['sortOrder']
): DetailsRecord[] {
  const direction = order === 'asc' ? 1 : -1
  return [...records].sort((left, right) => {
    const a = sortValue(left, field)
    const b = sortValue(right, field)
    let comparison: number
    if (typeof a === 'number' && typeof b === 'number') comparison = a - b
    else comparison = String(a).localeCompare(String(b))
    // Stable tiebreak so equal keys never shuffle between pages.
    if (comparison === 0) comparison = left.key.localeCompare(right.key)
    return comparison * direction
  })
}

/**
 * Summary + breakdowns over the WHOLE filtered set (not just the page).
 *
 * `dateBasis` drives the month buckets so the breakdown always matches the
 * date filter the admin is looking at.
 */
export function summariseDetails(
  records: DetailsRecord[],
  dateBasis: DetailsQuery['dateBasis'] = 'checkIn'
): DetailsSummary {
  const propertyMap = new Map<string, DetailsBreakdownEntry>()
  const monthMap = new Map<string, DetailsBreakdownEntry>()
  let totalGuests = 0
  let occupiedNights = 0
  let totalAmountPaise = 0
  let normalBookings = 0
  let airbnbBookings = 0
  let cancelledBookings = 0

  const monthKeyFor = (record: DetailsRecord): string =>
    dateBasis === 'bookingDate' ? record.bookingDate.slice(0, 7) : record.checkIn.slice(0, 7)

  for (const record of records) {
    if (record.source === 'NORMAL') normalBookings += 1
    else airbnbBookings += 1
    if (isCancelled(record)) cancelledBookings += 1

    totalGuests += record.guestCount
    // Cancelled stays are not occupied nights — the dates are released.
    if (!isCancelled(record)) {
      occupiedNights += record.nights
      if (record.amountPaise !== null) totalAmountPaise += record.amountPaise
    }

    const propertyKey = record.propertyId ?? record.propertyName
    const property =
      propertyMap.get(propertyKey) ??
      { key: propertyKey, label: record.propertyName, count: 0, guests: 0, nights: 0, amountPaise: 0 }
    property.count += 1
    property.guests += record.guestCount
    if (!isCancelled(record)) {
      property.nights += record.nights
      if (record.amountPaise !== null) property.amountPaise += record.amountPaise
    }
    propertyMap.set(propertyKey, property)

    const monthKey = monthKeyFor(record)
    const month =
      monthMap.get(monthKey) ?? { key: monthKey, label: monthKey, count: 0, guests: 0, nights: 0, amountPaise: 0 }
    month.count += 1
    month.guests += record.guestCount
    if (!isCancelled(record)) {
      month.nights += record.nights
      if (record.amountPaise !== null) month.amountPaise += record.amountPaise
    }
    monthMap.set(monthKey, month)
  }

  return {
    totalBookings: records.length,
    normalBookings,
    airbnbBookings,
    cancelledBookings,
    totalGuests,
    occupiedNights,
    totalAmountPaise,
    amountBasis: 'NORMAL_BOOKINGS',
    byProperty: [...propertyMap.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    bySource: [
      { key: 'NORMAL' as const, label: 'Normal', count: normalBookings },
      { key: 'AIRBNB' as const, label: 'Airbnb', count: airbnbBookings },
    ],
    byMonth: [...monthMap.values()].sort((a, b) => a.key.localeCompare(b.key)),
  }
}

/**
 * Load every record matching the filters (both sources), then paginate.
 *
 * Both lookups are database-filtered, so only the selected window is loaded —
 * never the whole bookings/reservations tables. The merge is bounded by
 * MAX_DETAILS_RECORDS.
 */
export async function queryDetails(
  client: PrismaClient,
  query: DetailsQuery
): Promise<{ records: DetailsRecord[]; total: number; summary: DetailsSummary }> {
  const wantsNormal = sourceContributes(query, 'NORMAL')
  const wantsAirbnb = sourceContributes(query, 'AIRBNB')

  const [bookings, reservations] = await Promise.all([
    wantsNormal
      ? client.booking.findMany({
          where: bookingWhere(query),
          orderBy: { checkIn: 'desc' },
          select: {
            id: true,
            code: true,
            propertyId: true,
            checkIn: true,
            checkOut: true,
            guestCount: true,
            primaryPhone: true,
            status: true,
            paymentStatus: true,
            utr: true,
            paymentSubmittedAt: true,
            paymentAcceptedAt: true,
            paymentRejectedAt: true,
            rejectionMessage: true,
            originalPricePaise: true,
            discountPaise: true,
            finalPricePaise: true,
            couponCode: true,
            createdAt: true,
            notes: true,
            property: { select: propertySelect },
            guestRecords: { orderBy: { createdAt: 'asc' }, select: guestSelect },
          },
        })
      : Promise.resolve([] as RawBooking[]),
    wantsAirbnb
      ? client.airbnbReservation.findMany({
          where: airbnbWhere(query),
          orderBy: { checkIn: 'desc' },
          select: {
            id: true,
            reservationNumber: true,
            propertyId: true,
            checkIn: true,
            checkOut: true,
            guestCount: true,
            primaryPhone: true,
            guestName: true,
            status: true,
            notes: true,
            createdAt: true,
            property: { select: propertySelect },
            guestRecords: { orderBy: { createdAt: 'asc' }, select: guestSelect },
          },
        })
      : Promise.resolve([] as RawAirbnb[]),
  ])

  const merged = [
    ...bookings.map((row) => normalizeBooking(row as RawBooking)),
    ...reservations.map((row) => normalizeAirbnb(row as RawAirbnb)),
  ]

  if (merged.length > MAX_DETAILS_RECORDS) {
    throw new DetailsTooLargeError(merged.length)
  }

  const sorted = sortDetailsRecords(merged, query.sortBy, query.sortOrder)
  return {
    records: sorted,
    total: sorted.length,
    summary: summariseDetails(sorted, query.dateBasis),
  }
}

export async function listDetailsProperties(client: PrismaClient): Promise<DetailsPropertyOption[]> {
  const rows = await client.property.findMany({
    orderBy: propertyDisplayOrderBy,
    select: { id: true, name: true, slug: true },
  })
  return rows
}

/** The full filtered set, for exports. Applies the same filters as the table. */
export async function listDetailsForExport(
  client: PrismaClient,
  query: DetailsQuery
): Promise<{ records: DetailsRecord[]; summary: DetailsSummary }> {
  const { records, summary } = await queryDetails(client, query)
  return { records, summary }
}
