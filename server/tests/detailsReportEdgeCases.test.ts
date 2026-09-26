import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import express from 'express'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { parseDetailsQuery, type DetailsQuery } from '../src/lib/detailsQueryValidation.js'
import type { DetailsResult } from '../src/services/detailsService.js'

/**
 * Regression coverage for the admin → Details report over a real HTTP surface.
 *
 * The report that used to answer "The server could not build the report." failed
 * because Details selected `Guest.phone` / `Guest.isPrimary` columns while
 * querying `AirbnbGuest`, which has neither. The first test below pins that
 * mistake shut against the real Prisma schema, and the rest exercise the report
 * across every dataset shape it has to survive.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const SCHEMA_PATH = resolve(HERE, '..', 'prisma', 'schema.prisma')

// ── Prisma schema reader ─────────────────────────────────────────────────────

type Model = { name: string; fields: Set<string> }

function readSchemaModels(): Map<string, Model> {
  const source = readFileSync(SCHEMA_PATH, 'utf8')
  const models = new Map<string, Model>()
  // Strip comments so `///` docs cannot look like fields.
  const body = source.replace(/\/\/.*$/gm, '')
  for (const block of body.matchAll(/model\s+(\w+)\s*\{([^}]*)\}/g)) {
    const fields = new Set<string>()
    for (const line of block[2].split('\n')) {
      const field = line.trim().match(/^(\w+)\s+\S/)
      if (field) fields.add(field[1])
    }
    models.set(block[1], { name: block[1], fields })
  }
  return models
}

const SCHEMA = readSchemaModels()

function modelFields(model: string): Set<string> {
  const found = SCHEMA.get(model)
  assert.ok(found, `schema.prisma must still declare model ${model}`)
  return found.fields
}

/** Scalar column names of a single `select` level (relation entries excluded). */
function scalarFields(select: Record<string, unknown>): string[] {
  return Object.entries(select)
    .filter(([, value]) => value === true)
    .map(([key]) => key)
}

/** The `select` of a nested relation entry, e.g. `select.property.select`. */
function relationSelect(select: Record<string, unknown>, relation: string): Record<string, unknown> {
  return (select[relation] as { select: Record<string, unknown> }).select
}

// ── capturing Prisma stand-in ────────────────────────────────────────────────
//
// Unlike the existing detailsService fake, this one also RECORDS the `select`
// it was handed, which is what makes the schema guard above meaningful.

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
      if (actual == null) return false
      if (!matchesClause(actual, expected as Row)) return false
      continue
    }

    if (actual !== expected) return false
  }
  return true
}

function fakeDb(bookings: Row[], reservations: Row[], properties: Row[]) {
  const seen: { booking?: Record<string, unknown>; airbnbReservation?: Record<string, unknown> } = {}
  const client = {
    booking: {
      findMany: async (args: Record<string, unknown> = {}) => {
        seen.booking = args
        const where = args.where as Row | undefined
        return where ? bookings.filter((row) => matchesClause(row, where)) : bookings
      },
    },
    airbnbReservation: {
      findMany: async (args: Record<string, unknown> = {}) => {
        seen.airbnbReservation = args
        const where = args.where as Row | undefined
        return where ? reservations.filter((row) => matchesClause(row, where)) : reservations
      },
    },
    property: { findMany: async () => properties },
  }
  return { client: client as never, seen }
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
    // AirbnbGuest has no `phone` and no `isPrimary` — mirrors the real schema.
    guestRecords: [
      { id: 'g9', fullName: 'Rohan Mehta', aadhaarNumber: '999988887777', gender: 'MALE', age: 40 },
    ],
    ...overrides,
  }
}

function queryFrom(overrides: Record<string, unknown> = {}): DetailsQuery {
  const parsed = parseDetailsQuery(overrides, '2026-09-23')
  assert.equal(parsed.ok, true)
  if (!parsed.ok) throw new Error('unreachable')
  return parsed.value
}

/** Every key the client and both exports rely on. */
const REPORT_KEYS = ['records', 'total', 'page', 'pageSize', 'pageCount', 'summary', 'properties']
const RECORD_KEYS = [
  'key', 'id', 'source', 'reference', 'propertyId', 'propertyName', 'propertySlug',
  'checkIn', 'checkOut', 'nights', 'guestName', 'aadhaarNumber', 'gender', 'age',
  'guestCount', 'primaryPhone', 'status', 'paymentStatus', 'amountPaise',
  'originalPricePaise', 'discountPaise', 'couponCode', 'bookingDate', 'notes', 'utr',
  'paymentSubmittedAt', 'paymentAcceptedAt', 'paymentRejectedAt', 'rejectionMessage',
  'guests',
]
const SUMMARY_KEYS = [
  'totalBookings', 'normalBookings', 'airbnbBookings', 'cancelledBookings',
  'totalGuests', 'occupiedNights', 'totalAmountPaise', 'amountBasis',
  'byProperty', 'bySource', 'byMonth',
]

function assertValidReport(result: DetailsResult, label: string) {
  for (const key of REPORT_KEYS) assert.ok(key in result, `${label}: report must expose "${key}"`)
  for (const key of SUMMARY_KEYS) assert.ok(key in result.summary, `${label}: summary must expose "${key}"`)
  assert.ok(result.pageCount >= 1, `${label}: pageCount is always at least 1`)
  assert.equal(result.records.length, Math.min(result.total, result.pageSize), `${label}: page slice`)

  for (const record of result.records) {
    for (const key of RECORD_KEYS) assert.ok(key in record, `${label}: record must expose "${key}"`)
    assert.ok(record.key.startsWith(`${record.source}:`), `${label}: key is prefixed with its source`)
    assert.ok(!Number.isNaN(record.nights), `${label}: nights must be a number`)
    assert.match(record.checkIn, /^\d{4}-\d{2}-\d{2}$/)
    assert.match(record.checkOut, /^\d{4}-\d{2}-\d{2}$/)
    // The authorised admin always sees the complete Aadhaar number.
    assert.ok(!record.aadhaarNumber.includes('X'), `${label}: Aadhaar must not be masked`)
  }
}

// ── 1. the original failure: selects must match the real Prisma models ───────

test('every Details select only asks for columns the Prisma model actually has', async () => {
  const { queryDetails } = await import('../src/services/detailsService.js')
  const { client, seen } = fakeDb([booking()], [reservation()], PROPERTIES)
  await queryDetails(client, queryFrom())

  const bookingSelect = seen.booking?.select as Record<string, unknown> | undefined
  const airbnbSelect = seen.airbnbReservation?.select as Record<string, unknown> | undefined
  assert.ok(bookingSelect, 'the booking query must send a select')
  assert.ok(airbnbSelect, 'the Airbnb query must send a select')

  const checks: Array<[string, Record<string, unknown>, string]> = [
    ['Booking', bookingSelect, 'Booking'],
    ['Guest', relationSelect(bookingSelect, 'guestRecords'), 'Guest'],
    ['Property', relationSelect(bookingSelect, 'property'), 'Property'],
    ['AirbnbReservation', airbnbSelect, 'AirbnbReservation'],
    ['AirbnbGuest', relationSelect(airbnbSelect, 'guestRecords'), 'AirbnbGuest'],
    ['Property', relationSelect(airbnbSelect, 'property'), 'Property'],
  ]

  for (const [label, select, model] of checks) {
    const allowed = modelFields(model)
    const fields = scalarFields(select)
    // Non-vacuous: an empty select would make the check below meaningless.
    assert.ok(fields.length > 0, `${label}: the select must request real columns`)
    for (const field of fields) {
      // Prisma rejects the WHOLE query when one selected column is unknown, which
      // is what turned this report into "The server could not build the report."
      assert.ok(allowed.has(field), `${model} has no column "${field}" (selected by the ${label} query)`)
    }
  }
})

test('the Airbnb guest select omits the columns Guest has but AirbnbGuest lacks', async () => {
  const { queryDetails } = await import('../src/services/detailsService.js')

  const airbnb = fakeDb([booking()], [reservation()], PROPERTIES)
  await queryDetails(airbnb.client, queryFrom({ source: 'AIRBNB' }))
  const airbnbGuestSelect = (airbnb.seen.airbnbReservation?.select as Row).guestRecords.select as Record<string, unknown>

  const normal = fakeDb([booking()], [reservation()], PROPERTIES)
  await queryDetails(normal.client, queryFrom({ source: 'NORMAL' }))
  const bookingGuestSelect = (normal.seen.booking?.select as Row).guestRecords.select as Record<string, unknown>

  // `phone` and `isPrimary` exist on Guest and must never be requested from
  // AirbnbGuest.
  assert.equal('phone' in airbnbGuestSelect, false)
  assert.equal('isPrimary' in airbnbGuestSelect, false)
  assert.ok(!modelFields('AirbnbGuest').has('phone'))
  assert.ok(!modelFields('AirbnbGuest').has('isPrimary'))
  // The normal-booking path still asks for them, so nothing was "fixed" by
  // simply dropping the columns everywhere.
  assert.equal(bookingGuestSelect.phone, true)
  assert.equal(bookingGuestSelect.isPrimary, true)
  assert.ok(modelFields('Guest').has('phone'))
  assert.ok(modelFields('Guest').has('isPrimary'))
})

test('Airbnb guests are normalised into the same presentation shape as booking guests', async () => {
  const { queryDetails } = await import('../src/services/detailsService.js')
  const { client } = fakeDb(
    [],
    [reservation({ guestRecords: [
      { id: 'g9', fullName: 'Rohan Mehta', aadhaarNumber: '999988887777', gender: 'MALE', age: 40 },
      { id: 'g10', fullName: 'Neha Mehta', aadhaarNumber: '888877776666', gender: 'FEMALE', age: 29 },
    ] })],
    PROPERTIES
  )
  const { records } = await queryDetails(client, queryFrom({ source: 'AIRBNB' }))

  assert.equal(records.length, 1)
  const [row] = records
  assert.equal(row.guests.length, 2)
  // Missing columns are filled in rather than left undefined.
  assert.deepStrictEqual(
    row.guests.map((g) => ({ phone: g.phone, isPrimary: g.isPrimary })),
    [{ phone: null, isPrimary: true }, { phone: null, isPrimary: false }]
  )
  // The first Airbnb guest is the lead guest shown on the row.
  assert.equal(row.guestName, 'Rohan Mehta')
  assert.equal(row.aadhaarNumber, '999988887777')
  assert.equal(row.guests[1].aadhaarNumber, '888877776666')
})

// ── 2. dataset matrix ───────────────────────────────────────────────────────

test('an EMPTY dataset still returns a complete, valid report', async () => {
  const { queryDetails } = await import('../src/services/detailsService.js')
  const { client, seen } = fakeDb([], [], PROPERTIES)
  const { records, total, summary } = await queryDetails(client, queryFrom())

  assert.deepStrictEqual(records, [])
  assert.equal(total, 0)
  assert.equal(summary.totalBookings, 0)
  assert.equal(summary.totalGuests, 0)
  assert.equal(summary.occupiedNights, 0)
  assert.equal(summary.totalAmountPaise, 0)
  assert.deepStrictEqual(summary.byProperty, [])
  assert.deepStrictEqual(summary.byMonth, [])
  // Both sources are still consulted when nothing is filtered out.
  assert.ok(seen.booking)
  assert.ok(seen.airbnbReservation)
})

test('a NORMAL-ONLY dataset reports only normal bookings', async () => {
  const { queryDetails } = await import('../src/services/detailsService.js')
  const { client } = fakeDb(
    [booking(), booking({ id: 'b2', code: 'AH-0002', propertyId: 'p2', checkIn: new Date('2026-09-18T00:00:00.000Z'), checkOut: new Date('2026-09-20T00:00:00.000Z'), finalPricePaise: 500000 })],
    [],
    PROPERTIES
  )
  const { records, summary } = await queryDetails(client, queryFrom())

  assert.equal(records.length, 2)
  assert.ok(records.every((record) => record.source === 'NORMAL'))
  assert.equal(summary.normalBookings, 2)
  assert.equal(summary.airbnbBookings, 0)
  // Amounts exist for normal bookings, so they are summed.
  assert.equal(summary.totalAmountPaise, 810000 + 500000)
  assert.equal(summary.bySource.find((entry) => entry.key === 'AIRBNB')?.count, 0)
})

test('an AIRBNB-ONLY dataset reports only reservations and invents no amount', async () => {
  const { queryDetails } = await import('../src/services/detailsService.js')
  const { client } = fakeDb(
    [],
    [
      reservation(),
      reservation({
        id: 'r2',
        reservationNumber: 'HM-2',
        checkIn: new Date('2026-09-24T00:00:00.000Z'),
        checkOut: new Date('2026-09-26T00:00:00.000Z'),
      }),
    ],
    PROPERTIES
  )
  const { records, summary } = await queryDetails(client, queryFrom())

  assert.equal(records.length, 2)
  assert.ok(records.every((record) => record.source === 'AIRBNB'))
  assert.equal(summary.airbnbBookings, 2)
  assert.equal(summary.normalBookings, 0)
  // AirbnbReservation has no pricing columns, so nothing is reported for it.
  assert.equal(summary.totalAmountPaise, 0)
  assert.equal(summary.amountBasis, 'NORMAL_BOOKINGS')
  assert.ok(records.every((record) => record.amountPaise === null))
  assert.ok(records.every((record) => record.paymentStatus === null))
})

test('a MIXED dataset merges both sources under one consistent shape', async () => {
  const { queryDetails } = await import('../src/services/detailsService.js')
  const { client } = fakeDb([booking()], [reservation()], PROPERTIES)
  const result = await queryDetails(client, queryFrom())

  assertValidReport(
    {
      records: result.records,
      total: result.total,
      page: 1,
      pageSize: 25,
      pageCount: 1,
      summary: result.summary,
      properties: PROPERTIES,
    },
    'mixed'
  )
  assert.deepStrictEqual(
    result.records.map((record) => record.source),
    ['AIRBNB', 'NORMAL'],
    'default sort is check-in descending, so the later stay leads'
  )
  assert.equal(result.summary.totalBookings, 2)
  assert.equal(result.summary.totalGuests, 5)
  assert.equal(result.summary.occupiedNights, 5)
})

test('filters behave the same on each dataset shape', async () => {
  const { queryDetails } = await import('../src/services/detailsService.js')

  // Property filter, on mixed data.
  const byProperty = await queryDetails(
    fakeDb([booking()], [reservation()], PROPERTIES).client,
    queryFrom({ propertyId: 'p2' })
  )
  assert.deepStrictEqual(byProperty.records.map((r) => r.source), ['AIRBNB'])

  // Status filter, on normal-only data.
  const byStatus = await queryDetails(
    fakeDb([booking(), booking({ id: 'b2', code: 'AH-0002', status: 'PENDING' })], [], PROPERTIES).client,
    queryFrom({ status: 'PENDING' })
  )
  assert.deepStrictEqual(byStatus.records.map((r) => r.reference), ['AH-0002'])

  // Payment filter, on Airbnb-only data: nothing can match.
  const byPayment = await queryDetails(
    fakeDb([], [reservation()], PROPERTIES).client,
    queryFrom({ paymentStatus: 'ACCEPTED' })
  )
  assert.deepStrictEqual(byPayment.records, [])
  assert.equal(byPayment.summary.totalBookings, 0)

  // A search term that matches nothing, on an empty dataset.
  const noMatch = await queryDetails(fakeDb([], [], PROPERTIES).client, queryFrom({ search: 'nobody' }))
  assert.deepStrictEqual(noMatch.records, [])

  // Date window that excludes everything, on mixed data.
  const outOfRange = await queryDetails(
    fakeDb([booking()], [reservation()], PROPERTIES).client,
    queryFrom({ range: 'custom', dateFrom: '2026-01-01', dateTo: '2026-01-31' })
  )
  assert.deepStrictEqual(outOfRange.records, [])
  assert.equal(outOfRange.summary.cancelledBookings, 0)
})

test('an Airbnb-only filter never runs a booking query, and vice versa', async () => {
  const { queryDetails } = await import('../src/services/detailsService.js')

  const airbnb = fakeDb([booking()], [reservation()], PROPERTIES)
  await queryDetails(airbnb.client, queryFrom({ source: 'AIRBNB' }))
  assert.equal(airbnb.seen.booking, undefined, 'source=AIRBNB must skip the Booking table')
  assert.ok(airbnb.seen.airbnbReservation)

  const normal = fakeDb([booking()], [reservation()], PROPERTIES)
  await queryDetails(normal.client, queryFrom({ source: 'NORMAL' }))
  assert.ok(normal.seen.booking)
  assert.equal(normal.seen.airbnbReservation, undefined, 'source=NORMAL must skip the Airbnb table')
})

// ── 3. the report over real HTTP ────────────────────────────────────────────

const { makeListDetailsHandler } = await import('../src/controllers/detailsController.js')

const app = express()
app.get('/api/admin/details', makeListDetailsHandler(fakeDb([booking()], [reservation()], PROPERTIES).client))
const server = createServer(app)
await new Promise<void>((resolve) => server.listen(0, resolve))
const port = (server.address() as AddressInfo).port
const base = `http://127.0.0.1:${port}`

async function getReport(search: string) {
  const res = await fetch(`${base}/api/admin/details?${search}`)
  assert.equal(res.status, 200, `GET ?${search} must succeed`)
  return (await res.json()) as DetailsResult & { appliedQuery: Record<string, unknown> }
}

test('GET /api/admin/details answers 200 with a valid report for mixed data', async () => {
  const report = await getReport('range=thisMonth')

  assert.equal(report.total, 2)
  assert.equal(report.page, 1)
  assert.equal(report.pageCount, 1)
  assert.deepStrictEqual(
    report.records.map((record) => record.source),
    ['AIRBNB', 'NORMAL']
  )
  assert.deepStrictEqual(
    report.properties.map((property) => property.id),
    ['p1', 'p2', 'p3']
  )
  assert.equal(report.appliedQuery.preset, 'thisMonth')
  for (const key of [...REPORT_KEYS, 'appliedQuery']) {
    assert.ok(key in report, `HTTP report must expose "${key}"`)
  }
  assertValidReport(report, 'http mixed')
})

test('GET /api/admin/details answers 200 with an empty-but-valid report', async () => {
  const report = await getReport('range=custom&dateFrom=2020-01-01&dateTo=2020-01-31')

  assert.equal(report.total, 0)
  assert.deepStrictEqual(report.records, [])
  assert.equal(report.pageCount, 1)
  assert.equal(report.summary.totalBookings, 0)
  assertValidReport(report, 'http empty')
})

test('GET /api/admin/details applies filters and echoes them back', async () => {
  const normalOnly = await getReport('source=NORMAL')
  assert.ok(normalOnly.records.every((record) => record.source === 'NORMAL'))
  assert.equal(normalOnly.appliedQuery.source, 'NORMAL')

  const airbnbOnly = await getReport('source=AIRBNB')
  assert.ok(airbnbOnly.records.every((record) => record.source === 'AIRBNB'))

  const byProperty = await getReport('propertyId=p2')
  assert.ok(byProperty.records.every((record) => record.propertyId === 'p2'))

  const searched = await getReport('search=anita')
  assert.equal(searched.total, 1)
  assert.equal(searched.records[0].reference, 'AH-0001')
})

test('GET /api/admin/details paginates without losing the summary', async () => {
  const paged = await getReport('pageSize=25&page=2')
  // Only two records exist, so page 2 is out of range: an empty slice, not an
  // error, and the summary still covers the whole filtered set.
  assert.equal(paged.page, 1)
  assert.deepStrictEqual(paged.records, [])
  assert.equal(paged.total, 2)
  assert.equal(paged.summary.totalBookings, 2)
  assert.equal(paged.pageCount, 1)
})

test('teardown: stop the ephemeral server', () => {
  server.closeAllConnections()
  server.close()
})
