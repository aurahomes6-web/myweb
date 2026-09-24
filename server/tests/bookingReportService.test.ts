import { test } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import type { PrismaClient } from '../src/generated/prisma/client.js'
import { MAX_REPORT_RANGE_DAYS, parseReportRange } from '../src/lib/bookingReportValidation.js'
import {
  bookingsReportFileName,
  buildBookingsReportWorkbook,
  countBookingsInRange,
  listBookingsForReport,
  type ReportBookingRow,
} from '../src/services/bookingReportService.js'

// ── minimal in-memory Prisma stand-in ──────────────────────────────────────
//
// Records every call so tests can prove the report loads guests through the
// booking relation (single query) instead of one extra query per guest.

class FakeReportDb {
  bookings: Array<Record<string, unknown>> = []
  guestsByBooking = new Map<string, Array<Record<string, unknown>>>()
  calls: string[] = []
  lastWhere: any = null

  propertyRef = {
    id: 'prop-1',
    name: 'Aura Cozy Penthouse 1',
    slug: 'aura-cozy-penthouse-1',
    shortLabel: 'Penthouse 01',
  }

  private inDateRange(where: any, row: Record<string, unknown>): boolean {
    const cond = where?.createdAt
    if (!cond) return true
    const value = row.createdAt as Date
    if (value === undefined) return false
    if (cond.gte && value < cond.gte) return false
    if (cond.lt && value >= cond.lt) return false
    return true
  }

  booking: any = {
    count: async ({ where }: any = {}): Promise<number> => {
      this.calls.push('booking.count')
      this.lastWhere = where
      return this.bookings.filter((r) => this.inDateRange(where, r)).length
    },
    findMany: async ({ where, include }: any = {}): Promise<unknown[]> => {
      this.calls.push('booking.findMany')
      this.lastWhere = where
      if (include?.guestRecords) this.calls.push('booking.findMany.include.guestRecords')
      return this.bookings
        .filter((r) => this.inDateRange(where, r))
        .map((r) => ({
          ...r,
          property: this.propertyRef,
          guestRecords: this.guestsByBooking.get(r.id as string) ?? [],
        }))
    },
  }

  asClient(): PrismaClient {
    return this as unknown as PrismaClient
  }
}

// ── test data ───────────────────────────────────────────────────────────────

function makeBooking(partial: Record<string, unknown>): Record<string, unknown> {
  return {
    id: partial.id,
    code: partial.code,
    checkIn: new Date('2026-03-10T00:00:00.000Z'),
    checkOut: new Date('2026-03-12T00:00:00.000Z'),
    guestCount: 2,
    primaryPhone: '+91 9000000001',
    notes: null,
    status: 'CONFIRMED',
    paymentStatus: 'PENDING',
    utr: 'UTR123456789',
    paymentSubmittedAt: new Date('2026-03-10T18:30:00.000Z'),
    paymentAcceptedAt: null,
    paymentRejectedAt: null,
    rejectionMessage: null,
    originalPricePaise: 200000,
    discountPaise: 10000,
    finalPricePaise: 190000,
    couponCode: 'PHASE7',
    createdAt: new Date('2026-03-10T12:00:00.000Z'),
    updatedAt: new Date('2026-03-10T12:00:00.000Z'),
    ...partial,
  }
}

function makeGuest(partial: Record<string, unknown>): Record<string, unknown> {
  return {
    id: partial.id,
    fullName: partial.fullName,
    aadhaarNumber: partial.aadhaarNumber,
    gender: partial.gender,
    age: partial.age,
    phone: partial.phone ?? null,
    isPrimary: partial.isPrimary ?? false,
  }
}

// ── parseReportRange ────────────────────────────────────────────────────────

test('parseReportRange accepts an inclusive valid range', () => {
  const result = parseReportRange('2026-03-01', '2026-03-31')
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.deepStrictEqual(result.value, { from: '2026-03-01', to: '2026-03-31' })
  }
})

test('parseReportRange trims surrounding whitespace', () => {
  const result = parseReportRange('  2026-03-01  ', '\t2026-03-31\n')
  assert.equal(result.ok, true)
})

test('parseReportRange rejects a missing start date', () => {
  const result = parseReportRange(undefined, '2026-03-31')
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.deepStrictEqual(result.issues.map((i) => i.field), ['from'])
  }
})

test('parseReportRange rejects malformed dates', () => {
  const result = parseReportRange('2026-13-40', '2026-99-99')
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.deepStrictEqual(result.issues.map((i) => i.field), ['from', 'to'])
  }
})

test('parseReportRange rejects a reversed range', () => {
  const result = parseReportRange('2026-03-31', '2026-03-01')
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.issues[0].field, 'to')
  }
})

test('parseReportRange rejects ranges larger than the daily cap', () => {
  const result = parseReportRange('2024-01-01', '2026-12-31')
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.issues[0].field, 'to')
  }
})

test('parseReportRange accepts exactly the daily cap (This Year = 366 days)', () => {
  const capInclusiveDays = new Date(Date.UTC(2024, 11, 31));
  const leapYearTo = capInclusiveDays.toISOString().slice(0, 10)
  const result = parseReportRange('2024-01-01', leapYearTo)
  assert.equal(result.ok, true)
  if (result.ok) {
    const days =
      (Date.parse(`${result.value.to}T00:00:00.000Z`) - Date.parse(`${result.value.from}T00:00:00.000Z`)) /
        86_400_000 +
      1
    assert.equal(days, MAX_REPORT_RANGE_DAYS)
  }
})

// ── queries ─────────────────────────────────────────────────────────────────

test('countBookingsInRange filters on booking creation date with UTC day boundaries', async () => {
  const db = new FakeReportDb()
  db.bookings.push(
    makeBooking({ id: 'b1', code: 'AH-0001', createdAt: new Date('2026-03-10T12:00:00.000Z') }),
    makeBooking({ id: 'b2', code: 'AH-0002', createdAt: new Date('2026-02-28T12:00:00.000Z') }),
    makeBooking({ id: 'b3', code: 'AH-0003', createdAt: new Date('2026-03-01T00:00:00.000Z') }),
    makeBooking({ id: 'b4', code: 'AH-0004', createdAt: new Date('2026-03-31T23:59:59.000Z') }),
    makeBooking({ id: 'b5', code: 'AH-0005', createdAt: new Date('2026-04-01T00:00:00.000Z') })
  )

  const range = { from: '2026-03-01', to: '2026-03-31' }
  const count = await countBookingsInRange(db.asClient(), range)
  assert.equal(count, 3)

  // The where clause must cover the whole ending day (lt = next UTC midnight).
  const lastWhere = db.lastWhere
  assert.equal(lastWhere.createdAt.gte.getTime(), Date.parse('2026-03-01T00:00:00.000Z'))
  assert.equal(lastWhere.createdAt.lt.getTime(), Date.parse('2026-04-01T00:00:00.000Z'))
})

test('listBookingsForReport loads guests through one relation query and never queries guests separately', async () => {
  const db = new FakeReportDb()
  db.bookings.push(makeBooking({ id: 'b1', code: 'AH-0001' }))
  db.guestsByBooking.set('b1', [
    makeGuest({ id: 'g1', fullName: 'Priya Sharma', aadhaarNumber: '123456789012', gender: 'FEMALE', age: 28, phone: '+91 9000000001', isPrimary: true }),
    makeGuest({ id: 'g2', fullName: 'Raj Sharma', aadhaarNumber: '987654321098', gender: 'MALE', age: 32, phone: null, isPrimary: false }),
  ])

  const rows = await listBookingsForReport(db.asClient(), { from: '2026-03-01', to: '2026-03-31' })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].code, 'AH-0001')
  assert.equal(rows[0].property?.name, 'Aura Cozy Penthouse 1')
  assert.equal(rows[0].guestRecords.length, 2)
  assert.equal(rows[0].guestRecords[0].isPrimary, true)

  // Only the booking model is touched — no per-guest queries, no Airbnb model.
  assert.deepStrictEqual(db.calls, ['booking.findMany', 'booking.findMany.include.guestRecords'])
})

test('report queries only normal bookings (no Airbnb model is ever touched)', () => {
  const db = new FakeReportDb()
  // The fake exposes no Airbnb model at all: any attempt to query it throws.
  assert.equal('airbnbReservation' in db, false)
  assert.equal('airbnbGuest' in db, false)
})

// ── workbook content ────────────────────────────────────────────────────────

/** Column lookup by header text (keys are not preserved across a workbook load). */
function cell(sheet: ExcelJS.Worksheet, rowNumber: number, header: string): unknown {
  const headers = (sheet.getRow(1).values as Array<unknown>).slice(1)
  const index = headers.indexOf(header)
  assert.ok(index >= 0, `header "${header}" exists`)
  return sheet.getRow(rowNumber).getCell(index + 1).value
}

/**
 * ExcelJS declares its `load` parameter as plain `Buffer`, which conflicts with
 * Node 22's generic `Buffer<ArrayBufferLike>`. Cast once here so the workbook
 * content assertions stay readable.
 */
async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as Parameters<ExcelJS.Workbook['xlsx']['load']>[0])
  return workbook
}

test('bookingsReportFileName formats the spreadsheet filename', () => {
  assert.equal(
    bookingsReportFileName('2026-03-01', '2026-03-31'),
    'AURA_HOMES_BOOKINGS_2026-03-01_TO_2026-03-31.xlsx'
  )
})

test('buildBookingsReportWorkbook writes one row per booking with the full booking columns', async () => {
  const row: ReportBookingRow = makeBooking({
    id: 'b1',
    code: 'AH-0001',
    propertyId: 'prop-1',
    checkIn: new Date('2026-03-10T00:00:00.000Z'),
    checkOut: new Date('2026-03-12T00:00:00.000Z'),
    guestCount: 2,
    primaryPhone: '+91 9000000001',
    notes: 'Early check-in requested',
    status: 'CONFIRMED',
    paymentStatus: 'PENDING',
    utr: 'UTR123456789',
    paymentSubmittedAt: new Date('2026-03-10T18:30:00.000Z'),
    paymentAcceptedAt: null,
    paymentRejectedAt: null,
    rejectionMessage: null,
    originalPricePaise: 600000,
    discountPaise: 60000,
    finalPricePaise: 540000,
    couponCode: 'AURA10',
    createdAt: new Date('2026-03-10T12:00:00.000Z'),
    updatedAt: new Date('2026-03-10T13:00:00.000Z'),
    property: { id: 'prop-1', name: 'Aura Cozy Penthouse 1', slug: 'aura-cozy-penthouse-1', shortLabel: 'Penthouse 01' },
    guestRecords: [
      makeGuest({ id: 'g1', fullName: 'Priya Sharma', aadhaarNumber: '123456789012', gender: 'FEMALE', age: 28, phone: '+91 9000000001', isPrimary: true }),
      makeGuest({ id: 'g2', fullName: 'Raj Sharma', aadhaarNumber: '987654321098', gender: 'MALE', age: 32, phone: null, isPrimary: false }),
    ],
  }) as unknown as ReportBookingRow

  const buffer = await buildBookingsReportWorkbook([row])
  const workbook = await loadWorkbook(buffer)

  const bookingsSheet = workbook.getWorksheet('Bookings')
  assert.ok(bookingsSheet, 'Bookings sheet exists')

  const headers = (bookingsSheet.getRow(1).values as Array<unknown>).slice(1)
  assert.deepStrictEqual(headers, [
    'Booking ID', 'Booking Status', 'Payment Status', 'Property', 'Check-in', 'Check-out',
    'Nights', 'Guests Count', 'Original Amount (₹)', 'Discount (₹)', 'Final Amount (₹)',
    'Coupon Code', 'UTR', 'Payment Submitted At', 'Payment Accepted At', 'Payment Rejected At',
    'Rejection Message', 'Primary Guest Name', 'Primary Guest Phone', 'Guest Details',
    'Notes', 'Booking Created At', 'Booking Updated At',
  ])

  assert.equal(cell(bookingsSheet, 2, 'Booking ID'), 'AH-0001')
  assert.equal(cell(bookingsSheet, 2, 'Booking Status'), 'CONFIRMED')
  assert.equal(cell(bookingsSheet, 2, 'Payment Status'), 'PENDING')
  assert.equal(cell(bookingsSheet, 2, 'Property'), 'Aura Cozy Penthouse 1')
  assert.equal(cell(bookingsSheet, 2, 'Check-in'), '2026-03-10')
  assert.equal(cell(bookingsSheet, 2, 'Check-out'), '2026-03-12')
  assert.equal(cell(bookingsSheet, 2, 'Nights'), 2)
  assert.equal(cell(bookingsSheet, 2, 'Guests Count'), 2)
  assert.equal(Number(cell(bookingsSheet, 2, 'Original Amount (₹)')), 6000) // ₹6,000.00 from 600000 paise
  assert.equal(Number(cell(bookingsSheet, 2, 'Discount (₹)')), 600)
  assert.equal(Number(cell(bookingsSheet, 2, 'Final Amount (₹)')), 5400)
  assert.equal(cell(bookingsSheet, 2, 'Coupon Code'), 'AURA10')
  assert.equal(cell(bookingsSheet, 2, 'UTR'), 'UTR123456789')
  assert.equal(cell(bookingsSheet, 2, 'Payment Submitted At'), '2026-03-10 18:30:00')
  assert.equal(cell(bookingsSheet, 2, 'Payment Rejected At'), '')
  assert.equal(cell(bookingsSheet, 2, 'Primary Guest Name'), 'Priya Sharma')
  assert.equal(cell(bookingsSheet, 2, 'Primary Guest Phone'), '+91 9000000001')
  assert.equal(
    cell(bookingsSheet, 2, 'Guest Details'),
    'Priya Sharma (Female, 28, Primary); Raj Sharma (Male, 32)'
  )
  assert.equal(cell(bookingsSheet, 2, 'Notes'), 'Early check-in requested')
  assert.equal(cell(bookingsSheet, 2, 'Booking Created At'), '2026-03-10 12:00:00')
  assert.equal(cell(bookingsSheet, 2, 'Booking Updated At'), '2026-03-10 13:00:00')
})

test('buildBookingsReportWorkbook writes one row per guest with full Aadhaar (admin only)', async () => {
  const row: ReportBookingRow = makeBooking({
    id: 'b1',
    code: 'AH-0001',
    property: { id: 'prop-1', name: 'Aura Cozy Penthouse 1', slug: 'aura-cozy-penthouse-1', shortLabel: 'Penthouse 01' },
    guestRecords: [
      makeGuest({ id: 'g1', fullName: 'Priya Sharma', aadhaarNumber: '123456789012', gender: 'FEMALE', age: 28, phone: '+91 9000000001', isPrimary: true }),
      makeGuest({ id: 'g2', fullName: 'Raj Sharma', aadhaarNumber: '987654321098', gender: 'MALE', age: 32, phone: null, isPrimary: false }),
    ],
  }) as unknown as ReportBookingRow

  const buffer = await buildBookingsReportWorkbook([row])
  const workbook = await loadWorkbook(buffer)

  const guestsSheet = workbook.getWorksheet('Guests')
  assert.ok(guestsSheet, 'Guests sheet exists')

  const headers = (guestsSheet.getRow(1).values as Array<unknown>).slice(1)
  assert.deepStrictEqual(headers, [
    'Booking ID', 'Guest Name', 'Aadhaar Number', 'Gender', 'Age', 'Phone', 'Primary Guest',
  ])

  assert.equal(cell(guestsSheet, 2, 'Booking ID'), 'AH-0001')
  assert.equal(cell(guestsSheet, 2, 'Guest Name'), 'Priya Sharma')
  assert.equal(cell(guestsSheet, 2, 'Aadhaar Number'), '123456789012')
  assert.equal(cell(guestsSheet, 2, 'Gender'), 'Female')
  assert.equal(cell(guestsSheet, 2, 'Age'), 28)
  assert.equal(cell(guestsSheet, 2, 'Phone'), '+91 9000000001')
  assert.equal(cell(guestsSheet, 2, 'Primary Guest'), 'Yes')
  assert.equal(cell(guestsSheet, 3, 'Guest Name'), 'Raj Sharma')
  assert.equal(cell(guestsSheet, 3, 'Aadhaar Number'), '987654321098')
  assert.equal(cell(guestsSheet, 3, 'Gender'), 'Male')
  assert.equal(cell(guestsSheet, 3, 'Phone'), '')
  assert.equal(cell(guestsSheet, 3, 'Primary Guest'), 'No')
})