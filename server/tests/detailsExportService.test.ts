import { test } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { parseDetailsQuery } from '../src/lib/detailsQueryValidation.js'
import { summariseDetails, type DetailsRecord } from '../src/services/detailsService.js'
import {
  buildDetailsPdf,
  buildDetailsWorkbook,
  detailsExportFileName,
  detailsExportRows,
  groupIndian,
} from '../src/services/detailsExportService.js'

/**
 * Read a workbook back. ExcelJS types its input against its own bundled copy of
 * Node's Buffer, which is nominally different from the one this project
 * resolves; the bytes are identical, so the cast is confined to here.
 */
async function readWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as never)
  return workbook
}

function query(overrides: Record<string, unknown> = {}) {
  const parsed = parseDetailsQuery(overrides, '2026-09-23')
  assert.equal(parsed.ok, true)
  if (!parsed.ok) throw new Error('unreachable')
  return parsed.value
}

function meta(q = query(), overrides: Partial<ReturnType<typeof metaShape>> = {}) {
  return { ...metaShape(q), ...overrides }
}

function metaShape(q = query()) {
  return {
    generatedAt: new Date('2026-09-25T17:05:00.000Z'),
    source: q.source === 'ALL' ? 'All (Normal + Airbnb)' : q.source,
    propertyName: 'All properties',
    status: 'All',
    paymentStatus: 'All',
    search: '—',
    dateBasis: q.dateBasis,
    datePreset: q.preset,
    rangeFrom: q.range.from,
    rangeTo: q.range.to,
    sortLabel: 'Check-in date (descending)',
  }
}

function record(overrides: Partial<DetailsRecord> = {}): DetailsRecord {
  return {
    key: 'NORMAL:1',
    id: '1',
    source: 'NORMAL',
    reference: 'AH-0001',
    propertyId: 'p1',
    propertyName: 'Aura Cozy Penthouse 1',
    propertySlug: 'aura-cozy-penthouse-1',
    checkIn: '2026-09-10',
    checkOut: '2026-09-13',
    nights: 3,
    guestName: 'Anita Sharma',
    aadhaarNumber: '123456789012',
    gender: 'FEMALE',
    age: 31,
    guestCount: 2,
    primaryPhone: '+91 9000000001',
    status: 'CONFIRMED',
    paymentStatus: 'ACCEPTED',
    amountPaise: 810000,
    originalPricePaise: 900000,
    discountPaise: 90000,
    couponCode: 'AURA10',
    bookingDate: '2026-09-02T09:00:00.000Z',
    notes: null,
    utr: 'UTR123',
    paymentSubmittedAt: null,
    paymentAcceptedAt: null,
    paymentRejectedAt: null,
    rejectionMessage: null,
    guests: [
      {
        id: 'g1',
        fullName: 'Anita Sharma',
        aadhaarNumber: '123456789012',
        gender: 'FEMALE',
        age: 31,
        phone: null,
        isPrimary: true,
      },
    ],
    ...overrides,
  }
}

const ROWS = [
  record(),
  record({
    key: 'AIRBNB:2',
    id: '2',
    source: 'AIRBNB',
    reference: 'HM-9XYZ',
    propertyId: 'p2',
    propertyName: 'Aura Cozy Penthouse 2',
    checkIn: '2026-09-20',
    checkOut: '2026-09-22',
    nights: 2,
    guestName: 'Rohan Mehta',
    aadhaarNumber: '999988887777',
    gender: 'MALE',
    age: 40,
    guestCount: 3,
    status: 'ACTIVE',
    paymentStatus: null,
    amountPaise: null,
    discountPaise: null,
    couponCode: null,
    utr: null,
  }),
]

// ── shared row shape ────────────────────────────────────────────────────────

test('export rows identify the source and carry the full Aadhaar', () => {
  const rows = detailsExportRows(ROWS)
  assert.equal(rows.length, 2)
  assert.deepStrictEqual(rows[0].slice(0, 2), ['AH-0001', 'NORMAL'])
  assert.deepStrictEqual(rows[1].slice(0, 2), ['HM-9XYZ', 'AIRBNB'])
  assert.equal(rows[0][7], '123456789012')
  assert.equal(rows[1][7], '999988887777')
  assert.ok(!JSON.stringify(rows).includes('XXXX'))
})

test('rupee amounts are exported from the stored paise, never recomputed', () => {
  const rows = detailsExportRows([record()])
  assert.equal(rows[0][14], '8100.00')
  assert.equal(rows[0][15], '900.00')
  // Airbnb has no stored amount, so the cell is blank rather than invented.
  assert.equal(detailsExportRows(ROWS)[1][14], '')
})

test('Indian digit grouping is correct', () => {
  assert.equal(groupIndian('1234567'), '12,34,567')
  assert.equal(groupIndian('45000'), '45,000')
  assert.equal(groupIndian('999'), '999')
})

test('file names are deterministic and carry the resolved range', () => {
  assert.equal(
    detailsExportFileName('xlsx', '2026-09-01', '2026-09-30'),
    'AURA_HOMES_BOOKING_DETAILS_2026-09-01_TO_2026-09-30.xlsx'
  )
  assert.equal(
    detailsExportFileName('pdf', '2026-09-01', '2026-09-30'),
    'AURA_HOMES_BOOKING_DETAILS_2026-09-01_TO_2026-09-30.pdf'
  )
})

// ── Excel ───────────────────────────────────────────────────────────────────

test('the Excel export is a real .xlsx that opens with a full Aadhaar column', async () => {
  const q = query()
  const buffer = await buildDetailsWorkbook(ROWS, summariseDetails(ROWS, 'checkIn'), meta(q), q)

  // Zip container, i.e. a genuine OOXML workbook rather than a renamed CSV.
  assert.equal(buffer.subarray(0, 2).toString('ascii'), 'PK')

  const workbook = await readWorkbook(buffer)
  const sheet = workbook.getWorksheet('Booking Details')
  assert.ok(sheet, 'Booking Details sheet is missing')

  const header = sheet.getRow(1).values as unknown[]
  assert.ok(header.includes('Booking ID / Reservation ID'))
  assert.ok(header.includes('Aadhaar (full)'))
  assert.ok(header.includes('Source'))

  const first = sheet.getRow(2).values as unknown[]
  assert.equal(first[1], 'AH-0001')
  assert.equal(first[2], 'NORMAL')
  assert.equal(first[8], '123456789012')
  assert.equal(first[15], '8100.00')

  const second = sheet.getRow(3).values as unknown[]
  assert.equal(second[2], 'AIRBNB')
  assert.equal(second[8], '999988887777')

  // Aadhaar and IDs are stored as text so Excel cannot mangle them.
  assert.equal(sheet.getRow(2).getCell(8).numFmt, '@')
})

test('the Excel export carries the active filters and summary on a header sheet', async () => {
  const q = query({ source: 'NORMAL', propertyId: 'p1', search: 'Anita', range: 'custom', dateFrom: '2026-09-01', dateTo: '2026-09-25' })
  const buffer = await buildDetailsWorkbook(
    [ROWS[0]],
    summariseDetails([ROWS[0]], 'checkIn'),
    meta(q, { search: 'Anita', source: 'NORMAL', propertyName: 'Aura Cozy Penthouse 1' }),
    q
  )

  const workbook = await readWorkbook(buffer)
  const sheet = workbook.getWorksheet('Summary')
  assert.ok(sheet)

  const flat = JSON.stringify(sheet.getSheetValues())
  assert.match(flat, /NORMAL/)
  assert.match(flat, /2026-09-01/)
  assert.match(flat, /2026-09-25/)
  assert.match(flat, /Anita/)
  assert.match(flat, /Check-in/)
  // Only the filtered row is present on the data sheet.
  const data = workbook.getWorksheet('Booking Details') as ExcelJS.Worksheet
  assert.equal(data.rowCount, 2)
})

test('an empty Excel export still produces a valid workbook', async () => {
  const q = query()
  const buffer = await buildDetailsWorkbook([], summariseDetails([], 'checkIn'), meta(q), q)
  assert.equal(buffer.subarray(0, 2).toString('ascii'), 'PK')
})

// ── PDF ─────────────────────────────────────────────────────────────────────

test('the PDF export carries the title, filters, summary and the full Aadhaar', () => {
  const q = query({ search: 'Anita' })
  const text = buildDetailsPdf(ROWS, summariseDetails(ROWS, 'checkIn'), meta(q, { search: 'Anita' }), q).toString('latin1')

  assert.equal(text.slice(0, 8), '%PDF-1.4')
  assert.ok(text.includes('(AURA HOMES) Tj'))
  assert.ok(text.includes('(BOOKING DETAILS REPORT) Tj'))
  assert.ok(text.includes('(Generated: 2026-09-25 17:05:00 UTC) Tj'))
  assert.ok(text.includes('(SELECTED FILTERS) Tj'))
  assert.ok(text.includes('(Date basis: Check-in) Tj'))
  assert.ok(text.includes('(Search: Anita) Tj'))
  assert.ok(text.includes('(Total bookings) Tj'))
  // The summary label is column-clipped, so assert its stable prefix plus the value.
  assert.ok(text.includes('(Total amount'))
  assert.ok(text.includes('(Rs. 8,100) Tj'))
  // FULL Aadhaar, not a masked form.
  assert.ok(text.includes('(123456789012) Tj'))
  assert.ok(text.includes('(999988887777) Tj'))
  assert.ok(!text.includes('XXXX'))
  // Both sources are labelled.
  assert.ok(text.includes('(NORMAL) Tj'))
  assert.ok(text.includes('(AIRBNB) Tj'))
})

test('the PDF records the date basis so the report is never ambiguous', () => {
  const q = query({ dateBasis: 'bookingDate' })
  const text = buildDetailsPdf(ROWS, summariseDetails(ROWS, 'bookingDate'), meta(q), q).toString('latin1')
  assert.ok(text.includes('(Date basis: Booking Date) Tj'))
})

test('the PDF paginates a large filtered set and repeats the header row', () => {
  const many = Array.from({ length: 400 }, (_, index) =>
    record({ id: String(index), reference: `AH-${index}`, aadhaarNumber: `1234567890${String(index).padStart(2, '0')}` })
  )
  const q = query()
  const bytes = buildDetailsPdf(many, summariseDetails(many, 'checkIn'), meta(q), q)
  const text = bytes.toString('latin1')

  const pageCount = (text.match(/\/Type \/Page[^s]/g) ?? []).length
  assert.ok(pageCount > 1, 'a large report should span multiple pages')
  assert.equal((text.match(/\(ID\) Tj/g) ?? []).length, pageCount)
  assert.ok(text.includes('(AH-399) Tj'))
})

test('an empty PDF export says so instead of drawing a broken table', () => {
  const q = query()
  const text = buildDetailsPdf([], summariseDetails([], 'checkIn'), meta(q), q).toString('latin1')
  assert.ok(text.includes('(No records match the selected filters.) Tj'))
})

test('a very long guest name is truncated rather than overflowing its column', () => {
  const q = query()
  const long = record({ guestName: 'Bartholomew Winchester-Somethingworth III' })
  const text = buildDetailsPdf([long], summariseDetails([long], 'checkIn'), meta(q), q).toString('latin1')
  assert.ok(text.includes('...'))
})
