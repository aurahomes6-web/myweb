import { isDateString, todayKey, toUtcDate } from './dateUtils.js'

/**
 * Query parsing/validation for the admin → Details reporting layer.
 *
 * Details is a READ-ONLY view that merges NORMAL AURA HOMES bookings with AIRBNB
 * reservations. It never writes, and it never changes how either booking system
 * behaves. Everything here is pure so it can be unit-tested with an injected
 * "today" instead of the wall clock.
 */

const MS_PER_DAY = 86_400_000

/** Same bound the existing booking report uses — keeps every report bounded. */
export const MAX_DETAILS_RANGE_DAYS = 366

export const DETAILS_SOURCES = ['ALL', 'NORMAL', 'AIRBNB'] as const
export const DETAILS_DATE_BASES = ['checkIn', 'bookingDate'] as const
export const DETAILS_DATE_PRESETS = ['thisWeek', 'thisMonth', 'thisYear', 'custom'] as const
export const DETAILS_SORT_FIELDS = [
  'checkIn',
  'checkOut',
  'bookingDate',
  'guestName',
  'property',
  'source',
  'status',
  'amount',
] as const
export const DETAILS_SORT_ORDERS = ['asc', 'desc'] as const
export const DETAILS_PAGE_SIZES = [25, 50, 100] as const

/** BookingStatus enum values (server/src/generated/prisma/enums.ts). */
export const NORMAL_BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED'] as const
/** AirbnbStatus enum values. */
export const AIRBNB_STATUSES = ['ACTIVE', 'CANCELLED'] as const
/** PaymentStatus enum values (normal bookings only). */
export const PAYMENT_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED'] as const

const NORMAL_STATUS_SET: ReadonlySet<string> = new Set<string>(NORMAL_BOOKING_STATUSES)

export type DetailsSource = (typeof DETAILS_SOURCES)[number]
export type DetailsDateBasis = (typeof DETAILS_DATE_BASES)[number]
export type DetailsDatePreset = (typeof DETAILS_DATE_PRESETS)[number]
export type DetailsSortField = (typeof DETAILS_SORT_FIELDS)[number]
export type DetailsSortOrder = (typeof DETAILS_SORT_ORDERS)[number]
export type DetailsPageSize = (typeof DETAILS_PAGE_SIZES)[number]

export interface DetailsDateRange {
  from: string
  to: string
}

export interface DetailsQuery {
  source: DetailsSource
  propertyId: string | null
  /** Raw requested status; resolved per source by the service. */
  status: string | null
  paymentStatus: string | null
  search: string | null
  dateBasis: DetailsDateBasis
  preset: DetailsDatePreset
  range: DetailsDateRange
  sortBy: DetailsSortField
  sortOrder: DetailsSortOrder
  page: number
  pageSize: DetailsPageSize
}

export type ParseDetailsQueryResult =
  | { ok: true; value: DetailsQuery }
  | { ok: false; issues: Array<{ field: string; message: string }> }

export interface ValidationIssue {
  field: string
  message: string
}

function singleParam(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : ''
  return typeof value === 'string' ? value : ''
}

function upper(value: string): string {
  return value.trim().toUpperCase()
}

function daysBetween(from: string, to: string): number {
  return Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / MS_PER_DAY) + 1
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function fromUtcKey(key: string): { year: number; month: number; day: number } {
  const year = Number(key.slice(0, 4))
  const month = Number(key.slice(5, 7))
  const day = Number(key.slice(8, 10))
  return { year, month, day }
}

function toKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Resolve the selected preset into an inclusive YYYY-MM-DD range.
 *
 * `today` is a YYYY-MM-DD key in the site's local day, injected so the presets
 * are deterministic in tests. "This Week" is Monday → Sunday.
 */
export function resolveDetailsDateRange(
  preset: DetailsDatePreset,
  fromRaw: string,
  toRaw: string,
  today: string = todayKey()
): DetailsDateRange {
  const { year, month, day } = fromUtcKey(today)

  if (preset === 'custom') {
    return { from: fromRaw, to: toRaw }
  }

  if (preset === 'thisWeek') {
    // JS weeks start on Sunday (0); shift so Monday === 1.
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
    const mondayOffset = (weekday + 6) % 7
    const start = new Date(Date.UTC(year, month - 1, day - mondayOffset))
    const end = new Date(Date.UTC(year, month - 1, day - mondayOffset + 6))
    return {
      from: toKey(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate()),
      to: toKey(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate()),
    }
  }

  if (preset === 'thisMonth') {
    return { from: toKey(year, month, 1), to: toKey(year, month, daysInMonth(year, month)) }
  }

  return { from: toKey(year, 1, 1), to: toKey(year, 12, 31) }
}

/** Human label for the date basis, rendered next to the date filters. */
export const DETAILS_DATE_BASIS_LABEL: Record<DetailsDateBasis, string> = {
  checkIn: 'Check-in',
  bookingDate: 'Booking Date',
}

export const DETAILS_DATE_BASIS_HINT: Record<DetailsDateBasis, string> = {
  checkIn: 'Date filters use the guest check-in date.',
  bookingDate: 'Date filters use the date the booking/reservation was created.',
}

/**
 * Case-insensitive enum lookup that always returns the CANONICAL value from
 * `allowed` (e.g. "thismonth" → "thisMonth", "confirmed" → "CONFIRMED"), so a
 * lowercased query string can never produce a value the rest of the code would
 * not recognise.
 */
function parseEnum<T extends readonly string[]>(
  raw: string,
  allowed: T,
  field: string,
  issues: ValidationIssue[]
): T[number] | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const match = allowed.find((candidate) => candidate.toLowerCase() === trimmed.toLowerCase())
  if (match === undefined) {
    issues.push({ field, message: `${field} must be one of: ${allowed.join(', ')}.` })
    return null
  }
  return match
}

function parsePageSize(raw: string, issues: ValidationIssue[]): DetailsPageSize {
  if (raw === '') return 25
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || !(DETAILS_PAGE_SIZES as readonly number[]).includes(parsed)) {
    issues.push({
      field: 'pageSize',
      message: `pageSize must be one of: ${DETAILS_PAGE_SIZES.join(', ')}.`,
    })
    return 25
  }
  return parsed as DetailsPageSize
}

function parsePage(raw: string, issues: ValidationIssue[]): number {
  if (raw === '') return 1
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) {
    issues.push({ field: 'page', message: 'page must be a whole number of 1 or more.' })
    return 1
  }
  return parsed
}

/**
 * Parse and validate the full Details query string.
 *
 * The date range is ALWAYS resolved to a bounded window (a preset, or a custom
 * range validated against MAX_DETAILS_RANGE_DAYS) — a Details request can never
 * turn into an unbounded full-table report.
 */
export function parseDetailsQuery(
  query: Record<string, unknown>,
  today: string = todayKey()
): ParseDetailsQueryResult {
  const issues: ValidationIssue[] = []

  const source = parseEnum(singleParam(query.source), DETAILS_SOURCES, 'source', issues) ?? 'ALL'
  const dateBasis =
    parseEnum(singleParam(query.dateBasis), DETAILS_DATE_BASES, 'dateBasis', issues) ?? 'checkIn'

  const rawStatus = singleParam(query.status).trim()
  const status = parseEnum(rawStatus, DETAILS_STATUS_VALUES, 'status', issues)

  const paymentStatus = parseEnum(
    singleParam(query.paymentStatus),
    PAYMENT_STATUSES,
    'paymentStatus',
    issues
  )

  const propertyRaw = singleParam(query.propertyId).trim()
  if (propertyRaw !== '' && (propertyRaw.length > 64 || /\s/.test(propertyRaw))) {
    issues.push({ field: 'propertyId', message: 'propertyId is not a valid identifier.' })
  }

  const searchRaw = singleParam(query.search).trim()
  if (searchRaw.length > 100) {
    issues.push({ field: 'search', message: 'Search must be 100 characters or fewer.' })
  }

  const sortBy =
    parseEnum(singleParam(query.sortBy), DETAILS_SORT_FIELDS, 'sortBy', issues) ?? 'checkIn'
  const sortOrder =
    parseEnum(singleParam(query.sortOrder), DETAILS_SORT_ORDERS, 'sortOrder', issues) ?? 'desc'

  const page = parsePage(singleParam(query.page), issues)
  const pageSize = parsePageSize(singleParam(query.pageSize), issues)

  const preset =
    parseEnum(singleParam(query.range), DETAILS_DATE_PRESETS, 'range', issues) ?? 'thisMonth'
  const dateFrom = singleParam(query.dateFrom).trim()
  const dateTo = singleParam(query.dateTo).trim()

  // Every collected issue fails the request. (Reporting only the custom-range
  // issues here would let a bad pageSize or search slip through.)
  if (issues.length > 0) return { ok: false, issues }

  if (preset === 'custom') {
    if (!isDateString(dateFrom)) {
      issues.push({ field: 'dateFrom', message: 'Provide a valid start date (YYYY-MM-DD).' })
    }
    if (!isDateString(dateTo)) {
      issues.push({ field: 'dateTo', message: 'Provide a valid end date (YYYY-MM-DD).' })
    }
    if (issues.length > 0) return { ok: false, issues }
    if (dateFrom > dateTo) {
      issues.push({ field: 'dateTo', message: 'The start date must be on or before the end date.' })
      return { ok: false, issues }
    }
    if (daysBetween(dateFrom, dateTo) > MAX_DETAILS_RANGE_DAYS) {
      issues.push({
        field: 'dateTo',
        message: `The selected period is too large. Choose ${MAX_DETAILS_RANGE_DAYS} days or fewer.`,
      })
      return { ok: false, issues }
    }
  }

  return {
    ok: true,
    value: {
      source,
      propertyId: propertyRaw === '' ? null : propertyRaw,
      status: status ?? null,
      paymentStatus: paymentStatus ?? null,
      search: searchRaw === '' ? null : searchRaw,
      dateBasis,
      preset,
      range: resolveDetailsDateRange(preset, dateFrom, dateTo, today),
      sortBy,
      sortOrder,
      page,
      pageSize,
    },
  }
}

/** Every status the UI may offer, grouped by the source it applies to. */
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

/**
 * Every value the `status` filter accepts: the union of BookingStatus and
 * AirbnbStatus. Anything else is refused with a 400 rather than handed to
 * Prisma, so an unknown status can never reach a query.
 */
export const DETAILS_STATUS_VALUES = [
  ...NORMAL_BOOKING_STATUSES,
  // "CANCELLED" exists in both enums; keep it once. The set is typed as
  // Set<string> because a tuple's includes() only accepts its own literals.
  ...AIRBNB_STATUSES.filter((value) => !NORMAL_STATUS_SET.has(value)),
] as const
