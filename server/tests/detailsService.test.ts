import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDetailsQuery, type DetailsQuery } from '../src/lib/detailsQueryValidation.js'
import {
  MAX_DETAILS_RECORDS,
  summariseDetails,
  sortDetailsRecords,
  type DetailsRecord,
} from '../src/services/detailsService.js'

// ── tiny in-memory Prisma stand-in ──────────────────────────────────────────
//
// It evaluates exactly the clause shapes detailsService builds (equality,
// case-insensitive `contains`, half-open date windows, `some`, nested
// relations, AND/OR) so the tests exercise real filtering, not a mock's
// return value.

type Row = Record<string, any>

function relation(row: Row, path: string): Row[] {
  const value = row[path]
  return Array.isArray(value) ? value : []
}

function matchesClause(row: Row, clause: Row): boolean {
  for (const [key, condition] of Object.entries(clause)) {
    if (key === 'AND') {
      if (!(condition as Row[]).every((sub) => matchesClause(row, sub))) return false
      continue
    }
    if (key === 'OR') {
      if (!(condition as Row[]).some((sub) => matchesClause(row, sub))) return false
      continue
    }
    if (key === 'NOT') {
      if (matchesClause(row, condition as Row)) return false
      continue
    }

    const actual = row[key]
    const expected = condition as Row | null

    if (expected !== null && typeof expected === 'object' && !(expected instanceof Date)) {
      if ('contains' in (expected as Row)) {
        const term = String((expected as Row).contains).toLowerCase()
        if (typeof actual !== 'string' || !actual.toLowerCase().includes(term)) return false
        continue
      }
      if ('gte' in (expected as Row) || 'lt' in (expected as Row)) {
        const window = expected as Row
        if (window.gte && (actual == null || actual < window.gte)) return false
        if (window.lt && (actual == null || actual >= window.lt)) return false
        continue
      }
      if ('some' in (expected as Row)) {
        const sub = (expected as Row).some as Row
        if (!relation(row, key).some((child) => matchesClause(child, sub))) return false
        continue
      }
      // Nested relation filter, e.g. { property: { name: {...} } }
      if (actual == null) return false
      if (!matchesClause(actual, expected as Row)) return false
      continue
    }

    if (actual !== expected) return false
  }
  return true
}

function findMany(rows: Row[], where?: Row): Row[] {
  if (!where) return rows
  return rows.filter((row) => matchesClause(row, where))
}

function makeFakeDb(bookings: Row[], reservations: Row[], properties: Row[]) {
  const calls = { booking: 0, airbnbReservation: 0, property: 0 }
  const client = {
    booking: {
      findMany: async ({ where }: { where?: Row } = {}) => {
        calls.booking += 1
        return findMany(bookings, where)
      },
    },
    airbnbReservation: {
      findMany: async ({ where }: { where?: Row } = {}) => {
        calls.airbnbReservation += 1
        return findMany(reservations, where)
      },
    },
    property: {
      findMany: async () => {
        calls.property += 1
        return properties
      },
    },
  }
  return { client: client as never, calls }
}

const PROPERTIES = [
  { id: 'p1', name: 'Aura Cozy Penthouse 1', slug: 'aura-cozy-penthouse-1' },
  { id: 'p2', name: 'Aura Cozy Penthouse 2', slug: 'aura-cozy-penthouse-2' },
  { id: 'p3', name: 'Aura Cozy Penthouse 3', slug: 'aura-cozy-penthouse-3' },
]

function guest(overrides: Partial<Row> = {}): Row {
  return {
    id: 'g1',
    fullName: 'Anita Sharma',
    aadhaarNumber: '123456789012',
    gender: 'FEMALE',
    age: 31,
    phone: null,
    isPrimary: true,
    ...overrides,
  }
}

function booking(overrides: Row = {}): Row {
  return {
    id: 'b1',
    code: 'AH-0001',
    propertyId: 'p1',
    checkIn: new Date('2026-09-10T00:00:00.000Z'),
    checkOut: new Date('2026-09-13T00:00:00.000Z'),
    guestCount: 2,
    primaryPhone: '+91 9000000001',
    status: 'CONFIRMED',
    paymentStatus: 'ACCEPTED',
    utr: 'UTR123',
    paymentSubmittedAt: null,
    paymentAcceptedAt: new Date('2026-09-02T10:00:00.000Z'),
    paymentRejectedAt: null,
    rejectionMessage: null,
    originalPricePaise: 900000,
    discountPaise: 90000,
    finalPricePaise: 810000,
    couponCode: 'AURA10',
    createdAt: new Date('2026-09-02T09:00:00.000Z'),
    notes: null,
    property: PROPERTIES[0],
    guestRecords: [guest()],
    ...overrides,
  }
}

function reservation(overrides: Row = {}): Row {
  return {
    id: 'r1',
    reservationNumber: 'HM-9XYZ',
    propertyId: 'p2',
    checkIn: new Date('2026-09-20T00:00:00.000Z'),
    checkOut: new Date('2026-09-22T00:00:00.000Z'),
    guestCount: 3,
    primaryPhone: '+91 9000000009',
    guestName: 'Rohan Mehta',
    status: 'ACTIVE',
    notes: null,
    createdAt: new Date('2026-09-15T12:00:00.000Z'),
    property: PROPERTIES[1],
    guestRecords: [guest({ id: 'g9', fullName: 'Rohan Mehta', aadhaarNumber: '999988887777', gender: 'MALE', age: 40 })],
    ...overrides,
  }
}

function queryFrom(overrides: Record<string, unknown> = {}): DetailsQuery {
  const parsed = parseDetailsQuery(overrides, '2026-09-23')
  assert.equal(parsed.ok, true)
  if (!parsed.ok) throw new Error('unreachable')
  return parsed.value
}

// ── normalisation ───────────────────────────────────────────────────────────

test('normal bookings and Airbnb reservations are merged and clearly labelled', async () => {
  const { client } = makeFakeDb([booking()], [reservation()], PROPERTIES)
  const { queryDetails } = await import('../src/services/detailsService.js')
  const { records, total } = await queryDetails(client, queryFrom())

  assert.equal(total, 2)
  const normal = records.find((record) => record.source === 'NORMAL')
  const airbnb = records.find((record) => record.source === 'AIRBNB')

  assert.ok(normal)
  assert.equal(normal.reference, 'AH-0001')
  assert.equal(normal.propertyName, 'Aura Cozy Penthouse 1')
  assert.equal(normal.nights, 3)
  assert.equal(normal.guestName, 'Anita Sharma')
  assert.equal(normal.paymentStatus, 'ACCEPTED')
  assert.equal(normal.amountPaise, 810000)
  assert.equal(normal.couponCode, 'AURA10')

  assert.ok(airbnb)
  assert.equal(airbnb.reference, 'HM-9XYZ')
  assert.equal(airbnb.propertyName, 'Aura Cozy Penthouse 2')
  assert.equal(airbnb.nights, 2)
  // The Airbnb model stores no pricing, so nothing is invented for it.
  assert.equal(airbnb.amountPaise, null)
  assert.equal(airbnb.paymentStatus, null)
  assert.equal(airbnb.bookingDate, '2026-09-15T12:00:00.000Z')
})

test('the FULL Aadhaar reaches the admin report row (never masked)', async () => {
  const { client } = makeFakeDb([booking()], [], PROPERTIES)
  const { queryDetails } = await import('../src/services/detailsService.js')
  const { records } = await queryDetails(client, queryFrom())

  assert.equal(records[0].aadhaarNumber, '123456789012')
  assert.equal(records[0].guests[0].aadhaarNumber, '123456789012')
  assert.ok(!JSON.stringify(records[0]).includes('XXXX'))
})

test('an Airbnb reservation with no home assigned still appears', async () => {
  const { client } = makeFakeDb([], [reservation({ propertyId: null, property: null })], PROPERTIES)
  const { queryDetails } = await import('../src/services/detailsService.js')
  const { records } = await queryDetails(client, queryFrom())

  assert.equal(records.length, 1)
  assert.equal(records[0].propertyName, 'Unassigned')
  assert.equal(records[0].propertyId, null)
})

// ── filtering ───────────────────────────────────────────────────────────────

test('the source filter only queries the requested table', async () => {
  const { queryDetails } = await import('../src/services/detailsService.js')

  const normalOnly = makeFakeDb([booking()], [reservation()], PROPERTIES)
  await queryDetails(normalOnly.client, queryFrom({ source: 'NORMAL' }))
  assert.equal(normalOnly.calls.booking, 1)
  assert.equal(normalOnly.calls.airbnbReservation, 0, 'Airbnb must not be queried for NORMAL')

  const airbnbOnly = makeFakeDb([booking()], [reservation()], PROPERTIES)
  await queryDetails(airbnbOnly.client, queryFrom({ source: 'AIRBNB' }))
  assert.equal(airbnbOnly.calls.booking, 0)
  assert.equal(airbnbOnly.calls.airbnbReservation, 1)
})

test('the property filter narrows both sources', async () => {
  const { client } = makeFakeDb([booking(), booking({ id: 'b2', code: 'AH-0002', propertyId: 'p3' })], [reservation()], PROPERTIES)
  const { queryDetails } = await import('../src/services/detailsService.js')
  const { records } = await queryDetails(client, queryFrom({ propertyId: 'p1' }))

  assert.equal(records.length, 1)
  assert.equal(records[0].reference, 'AH-0001')
})

test('a normal status is not applied to Airbnb (and vice versa)', async () => {
  const { queryDetails } = await import('../src/services/detailsService.js')

  const confirmed = makeFakeDb(
    [booking(), booking({ id: 'b2', code: 'AH-0002', status: 'PENDING' })],
    [reservation()],
    PROPERTIES
  )
  const confirmedResult = await queryDetails(confirmed.client, queryFrom({ status: 'CONFIRMED' }))
  assert.equal(confirmedResult.records.length, 1)
  assert.equal(confirmedResult.records[0].source, 'NORMAL')

  const active = makeFakeDb([booking()], [reservation(), reservation({ id: 'r2', reservationNumber: 'HM-2', status: 'CANCELLED' })], PROPERTIES)
  const activeResult = await queryDetails(active.client, queryFrom({ status: 'ACTIVE' }))
  assert.equal(activeResult.records.length, 1)
  assert.equal(activeResult.records[0].source, 'AIRBNB')
})

test('the payment-status filter only affects normal bookings', async () => {
  const { client } = makeFakeDb(
    [booking(), booking({ id: 'b2', code: 'AH-0002', paymentStatus: 'PENDING' })],
    [reservation()],
    PROPERTIES
  )
  const { queryDetails } = await import('../src/services/detailsService.js')
  const { records } = await queryDetails(client, queryFrom({ paymentStatus: 'ACCEPTED' }))

  assert.equal(records.length, 1)
  assert.equal(records[0].source, 'NORMAL')
})

test('search matches guest name, booking id, phone, property and Aadhaar', async () => {
  const { queryDetails } = await import('../src/services/detailsService.js')
  const db = () => makeFakeDb([booking()], [reservation()], PROPERTIES)

  for (const term of ['anita', 'AH-0001', '9000000001', 'Penthouse 1', '123456789012']) {
    const { client } = db()
    const { records } = await queryDetails(client, queryFrom({ search: term }))
    assert.equal(records.length, 1, `search "${term}" should match the normal booking`)
    assert.equal(records[0].source, 'NORMAL')
  }

  const airbnbHit = makeFakeDb([booking()], [reservation()], PROPERTIES)
  const airbnbResult = await queryDetails(airbnbHit.client, queryFrom({ search: 'HM-9XYZ' }))
  assert.equal(airbnbResult.records.length, 1)
  assert.equal(airbnbResult.records[0].source, 'AIRBNB')
})

test('filters combine: NORMAL + Penthouse 2 + this month returns only the match', async () => {
  const { client } = makeFakeDb(
    [
      booking(),
      booking({ id: 'b2', code: 'AH-0002', propertyId: 'p2', status: 'PENDING', paymentStatus: 'PENDING' }),
      booking({ id: 'b3', code: 'AH-0003', propertyId: 'p2', status: 'CONFIRMED', paymentStatus: 'ACCEPTED' }),
      booking({
        id: 'b4',
        code: 'AH-0004',
        propertyId: 'p2',
        status: 'CONFIRMED',
        paymentStatus: 'ACCEPTED',
        checkIn: new Date('2026-10-02T00:00:00.000Z'),
        checkOut: new Date('2026-10-04T00:00:00.000Z'),
      }),
    ],
    [reservation()],
    PROPERTIES
  )
  const { queryDetails } = await import('../src/services/detailsService.js')
  const { records } = await queryDetails(
    client,
    queryFrom({ source: 'NORMAL', propertyId: 'p2', status: 'CONFIRMED', paymentStatus: 'ACCEPTED' })
  )

  assert.equal(records.length, 1)
  assert.equal(records[0].reference, 'AH-0003')
})

test('the date basis decides WHICH column the window applies to', async () => {
  const { queryDetails } = await import('../src/services/detailsService.js')

  // October check-in, but created inside September.
  const octoberRow = booking({
    id: 'b2',
    code: 'AH-0002',
    checkIn: new Date('2026-10-02T00:00:00.000Z'),
    checkOut: new Date('2026-10-04T00:00:00.000Z'),
    createdAt: new Date('2026-09-05T09:00:00.000Z'),
  })

  const byCheckIn = makeFakeDb([octoberRow], [], PROPERTIES)
  const checkInResult = await queryDetails(byCheckIn.client, queryFrom({ range: 'thisMonth' }))
  assert.equal(checkInResult.records.length, 0, 'October check-in is outside September')

  const byCreated = makeFakeDb([octoberRow], [], PROPERTIES)
  const createdResult = await queryDetails(
    byCreated.client,
    queryFrom({ range: 'thisMonth', dateBasis: 'bookingDate' })
  )
  assert.equal(createdResult.records.length, 1, 'createdAt is inside September')
})

test('a custom range is inclusive of its end date', async () => {
  const { client } = makeFakeDb(
    [
      booking({ id: 'b1', checkIn: new Date('2026-09-01T00:00:00.000Z'), checkOut: new Date('2026-09-02T00:00:00.000Z') }),
      booking({ id: 'b2', checkIn: new Date('2026-09-25T00:00:00.000Z'), checkOut: new Date('2026-09-26T00:00:00.000Z') }),
      booking({ id: 'b3', checkIn: new Date('2026-09-26T00:00:00.000Z'), checkOut: new Date('2026-09-27T00:00:00.000Z') }),
    ],
    [],
    PROPERTIES
  )
  const { queryDetails } = await import('../src/services/detailsService.js')
  const { records } = await queryDetails(
    client,
    queryFrom({ range: 'custom', dateFrom: '2026-09-01', dateTo: '2026-09-25' })
  )
  assert.deepStrictEqual(records.map((record) => record.id).sort(), ['b1', 'b2'])
})

// ── sorting, summary, bounds ────────────────────────────────────────────────

function record(overrides: Partial<DetailsRecord>): DetailsRecord {
  return {
    key: 'NORMAL:x',
    id: 'x',
    source: 'NORMAL',
    reference: 'AH-X',
    propertyId: 'p1',
    propertyName: 'Aura Cozy Penthouse 1',
    propertySlug: 'aura-cozy-penthouse-1',
    checkIn: '2026-09-10',
    checkOut: '2026-09-12',
    nights: 2,
    guestName: 'Guest',
    aadhaarNumber: '123456789012',
    gender: 'MALE',
    age: 30,
    guestCount: 1,
    primaryPhone: '+91 9000000001',
    status: 'CONFIRMED',
    paymentStatus: 'ACCEPTED',
    amountPaise: 100000,
    originalPricePaise: 100000,
    discountPaise: null,
    couponCode: null,
    bookingDate: '2026-09-01T00:00:00.000Z',
    notes: null,
    utr: null,
    paymentSubmittedAt: null,
    paymentAcceptedAt: null,
    paymentRejectedAt: null,
    rejectionMessage: null,
    guests: [],
    ...overrides,
  }
}

test('sorting works in both directions on every offered field', () => {
  const rows = [
    record({ key: 'NORMAL:1', id: '1', checkIn: '2026-09-30', amountPaise: 300000, guestName: 'Zara' }),
    record({ key: 'NORMAL:2', id: '2', checkIn: '2026-09-10', amountPaise: 100000, guestName: 'Amit' }),
    record({ key: 'AIRBNB:3', id: '3', checkIn: '2026-09-20', amountPaise: null, guestName: 'Meera' }),
  ]

  assert.deepStrictEqual(
    sortDetailsRecords(rows, 'checkIn', 'asc').map((r) => r.id),
    ['2', '3', '1']
  )
  assert.deepStrictEqual(
    sortDetailsRecords(rows, 'checkIn', 'desc').map((r) => r.id),
    ['1', '3', '2']
  )
  assert.deepStrictEqual(
    sortDetailsRecords(rows, 'guestName', 'asc').map((r) => r.id),
    ['2', '3', '1']
  )
  // Airbnb rows have no amount, so they sort as -1: last ascending, first descending.
  assert.deepStrictEqual(
    sortDetailsRecords(rows, 'amount', 'asc').map((r) => r.id),
    ['3', '2', '1']
  )
  assert.deepStrictEqual(
    sortDetailsRecords(rows, 'amount', 'desc').map((r) => r.id),
    ['1', '2', '3']
  )
  assert.deepStrictEqual(
    sortDetailsRecords(rows, 'source', 'asc').map((r) => r.id),
    ['3', '1', '2']
  )
  assert.deepStrictEqual(
    sortDetailsRecords(rows, 'bookingDate', 'asc').map((r) => r.id),
    ['3', '1', '2']
  )
})

test('summary statistics and breakdowns are computed from the filtered set', async () => {
  const { client } = makeFakeDb(
    [
      booking(),
      booking({
        id: 'b2',
        code: 'AH-0002',
        propertyId: 'p2',
        checkIn: new Date('2026-09-15T00:00:00.000Z'),
        checkOut: new Date('2026-09-17T00:00:00.000Z'),
        guestCount: 4,
        finalPricePaise: 200000,
        status: 'CANCELLED',
      }),
    ],
    [reservation()],
    PROPERTIES
  )
  const { queryDetails } = await import('../src/services/detailsService.js')
  const { summary } = await queryDetails(client, queryFrom())

  assert.equal(summary.totalBookings, 3)
  assert.equal(summary.normalBookings, 2)
  assert.equal(summary.airbnbBookings, 1)
  assert.equal(summary.cancelledBookings, 1)
  assert.equal(summary.totalGuests, 2 + 4 + 3)
  // 3 nights (confirmed booking) only — the cancelled stay releases its dates.
  assert.equal(summary.occupiedNights, 3 + 2)
  // Amounts only exist for normal bookings, and cancelled ones are excluded.
  assert.equal(summary.totalAmountPaise, 810000)
  assert.equal(summary.amountBasis, 'NORMAL_BOOKINGS')

  assert.equal(summary.bySource.find((entry) => entry.key === 'NORMAL')?.count, 2)
  assert.equal(summary.bySource.find((entry) => entry.key === 'AIRBNB')?.count, 1)
  assert.equal(summary.byProperty.length, 2)
  // Every record checks in during September, so there is one month bucket.
  assert.equal(summary.byMonth.length, 1)
  assert.equal(summary.byMonth[0].key, '2026-09')
})

test('an empty filter result produces zeroed statistics, not NaN', () => {
  const summary = summariseDetails([], 'checkIn')
  assert.equal(summary.totalBookings, 0)
  assert.equal(summary.occupiedNights, 0)
  assert.equal(summary.totalAmountPaise, 0)
  assert.deepStrictEqual(summary.byProperty, [])
  assert.deepStrictEqual(summary.byMonth, [])
})

test('an oversized match set is refused rather than loaded', async () => {
  const many = Array.from({ length: MAX_DETAILS_RECORDS + 1 }, (_, index) =>
    booking({ id: `b${index}`, code: `AH-${index}` })
  )
  const { client } = makeFakeDb(many, [], PROPERTIES)
  const { DetailsTooLargeError, queryDetails } = await import('../src/services/detailsService.js')
  await assert.rejects(() => queryDetails(client, queryFrom()), DetailsTooLargeError)
})
