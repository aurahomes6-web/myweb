import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DETAILS_DATE_BASIS_HINT,
  DETAILS_DATE_BASIS_LABEL,
  MAX_DETAILS_RANGE_DAYS,
  parseDetailsQuery,
  resolveDetailsDateRange,
} from '../src/lib/detailsQueryValidation.js'

// The presets are pure functions of an injected "today", so they are fully
// deterministic here (Wednesday 2026-09-23).
const TODAY = '2026-09-23'

test('date presets resolve to inclusive, calendar-correct ranges', () => {
  assert.deepStrictEqual(resolveDetailsDateRange('thisWeek', '', '', TODAY), {
    // Monday 21 Sep → Sunday 27 Sep 2026
    from: '2026-09-21',
    to: '2026-09-27',
  })
  assert.deepStrictEqual(resolveDetailsDateRange('thisMonth', '', '', TODAY), {
    from: '2026-09-01',
    to: '2026-09-30',
  })
  assert.deepStrictEqual(resolveDetailsDateRange('thisYear', '', '', TODAY), {
    from: '2026-01-01',
    to: '2026-12-31',
  })
  assert.deepStrictEqual(resolveDetailsDateRange('custom', '2026-09-01', '2026-09-25', TODAY), {
    from: '2026-09-01',
    to: '2026-09-25',
  })
})

test('"this week" always starts on a Monday, even for a Sunday', () => {
  assert.deepStrictEqual(resolveDetailsDateRange('thisWeek', '', '', '2026-09-27'), {
    from: '2026-09-21',
    to: '2026-09-27',
  })
})

test('date presets handle a month boundary and a leap year', () => {
  assert.deepStrictEqual(resolveDetailsDateRange('thisMonth', '', '', '2024-02-10'), {
    from: '2024-02-01',
    to: '2024-02-29',
  })
  assert.deepStrictEqual(resolveDetailsDateRange('thisMonth', '', '', '2026-12-31'), {
    from: '2026-12-01',
    to: '2026-12-31',
  })
})

test('details query defaults to all sources, check-in basis, this month', () => {
  const result = parseDetailsQuery({}, TODAY)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.value.source, 'ALL')
  assert.equal(result.value.dateBasis, 'checkIn')
  assert.equal(result.value.preset, 'thisMonth')
  assert.equal(result.value.range.from, '2026-09-01')
  assert.equal(result.value.range.to, '2026-09-30')
  assert.equal(result.value.page, 1)
  assert.equal(result.value.pageSize, 25)
  assert.equal(result.value.sortOrder, 'desc')
  assert.equal(result.value.propertyId, null)
  assert.equal(result.value.status, null)
  assert.equal(result.value.search, null)
})

test('every filter can be combined at once', () => {
  const result = parseDetailsQuery(
    {
      source: 'normal',
      propertyId: 'prop-2',
      status: 'confirmed',
      paymentStatus: 'accepted',
      search: 'Anita',
      dateBasis: 'bookingDate',
      range: 'thisWeek',
      sortBy: 'amount',
      sortOrder: 'asc',
      page: '3',
      pageSize: '50',
    },
    TODAY
  )
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepStrictEqual(result.value, {
    source: 'NORMAL',
    propertyId: 'prop-2',
    status: 'CONFIRMED',
    paymentStatus: 'ACCEPTED',
    search: 'Anita',
    dateBasis: 'bookingDate',
    preset: 'thisWeek',
    range: { from: '2026-09-21', to: '2026-09-27' },
    sortBy: 'amount',
    sortOrder: 'asc',
    page: 3,
    pageSize: 50,
  })
})

test('unsupported enum values are rejected instead of silently ignored', () => {
  for (const [field, query] of [
    ['source', { source: 'PENDING' }],
    ['dateBasis', { dateBasis: 'checkout' }],
    ['range', { range: 'lastYear' }],
    ['sortBy', { sortBy: 'guestCount' }],
    ['sortOrder', { sortOrder: 'sideways' }],
    ['paymentStatus', { paymentStatus: 'PAID' }],
  ] as const) {
    const result = parseDetailsQuery(query, TODAY)
    assert.equal(result.ok, false, `${field} should be rejected`)
    if (result.ok) return
    assert.deepStrictEqual(
      result.issues.map((issue) => issue.field),
      [field]
    )
  }
})

test('page size is limited to the offered options', () => {
  const ok = parseDetailsQuery({ pageSize: '100' }, TODAY)
  assert.equal(ok.ok && ok.value.pageSize, 100)
  const bad = parseDetailsQuery({ pageSize: '10' }, TODAY)
  assert.equal(bad.ok, false)
  if (bad.ok) return
  assert.equal(bad.issues[0].field, 'pageSize')
})

test('page must be a positive integer', () => {
  assert.equal(parseDetailsQuery({ page: '0' }, TODAY).ok, false)
  assert.equal(parseDetailsQuery({ page: '-2' }, TODAY).ok, false)
  assert.equal(parseDetailsQuery({ page: '2.5' }, TODAY).ok, false)
  const ok = parseDetailsQuery({ page: '2' }, TODAY)
  assert.equal(ok.ok && ok.value.page, 2)
})

test('a custom range requires both dates and rejects an inverted window', () => {
  const missing = parseDetailsQuery({ range: 'custom' }, TODAY)
  assert.equal(missing.ok, false)
  if (!missing.ok) assert.deepStrictEqual(missing.issues.map((i) => i.field), ['dateFrom', 'dateTo'])

  const inverted = parseDetailsQuery(
    { range: 'custom', dateFrom: '2026-09-25', dateTo: '2026-09-01' },
    TODAY
  )
  assert.equal(inverted.ok, false)
  if (!inverted.ok) assert.equal(inverted.issues[0].field, 'dateTo')

  const valid = parseDetailsQuery(
    { range: 'custom', dateFrom: '2026-09-01', dateTo: '2026-09-25' },
    TODAY
  )
  assert.equal(valid.ok, true)
  if (valid.ok) assert.deepStrictEqual(valid.value.range, { from: '2026-09-01', to: '2026-09-25' })
})

test('an oversized custom range is refused so a report stays bounded', () => {
  const result = parseDetailsQuery(
    { range: 'custom', dateFrom: '2024-01-01', dateTo: '2026-12-31' },
    TODAY
  )
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.issues[0].field, 'dateTo')

  const atLimit = parseDetailsQuery(
    { range: 'custom', dateFrom: '2025-10-01', dateTo: '2026-09-26' },
    TODAY
  )
  assert.equal(atLimit.ok, true)
  if (atLimit.ok) {
    const days =
      (new Date(atLimit.value.range.to).getTime() - new Date(atLimit.value.range.from).getTime()) /
        86_400_000 +
      1
    assert.ok(days <= MAX_DETAILS_RANGE_DAYS + 1)
  }
})

test('search length and property id shape are validated', () => {
  const longSearch = parseDetailsQuery({ search: 'x'.repeat(101) }, TODAY)
  assert.equal(longSearch.ok, false)
  if (!longSearch.ok) assert.equal(longSearch.issues[0].field, 'search')

  const badProperty = parseDetailsQuery({ propertyId: 'prop 2' }, TODAY)
  assert.equal(badProperty.ok, false)
  if (!badProperty.ok) assert.equal(badProperty.issues[0].field, 'propertyId')
})

test('an unknown status is refused with a 400 rather than reaching Prisma', () => {
  const result = parseDetailsQuery({ status: 'SOMETHING' }, TODAY)
  assert.equal(result.ok, false)
  if (!result.ok) assert.deepStrictEqual(result.issues.map((issue) => issue.field), ['status'])
})

test('every real status value is accepted (both enums)', () => {
  for (const status of ['PENDING', 'CONFIRMED', 'CANCELLED', 'ACTIVE']) {
    const result = parseDetailsQuery({ status }, TODAY)
    assert.equal(result.ok, true, `${status} should be accepted`)
  }
})

test('the UI is told which column the date range is applied to', () => {
  assert.equal(DETAILS_DATE_BASIS_LABEL.checkIn, 'Check-in')
  assert.equal(DETAILS_DATE_BASIS_LABEL.bookingDate, 'Booking Date')
  assert.match(DETAILS_DATE_BASIS_HINT.bookingDate, /created/i)
  assert.match(DETAILS_DATE_BASIS_HINT.checkIn, /check-in/i)
})
