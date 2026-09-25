import ExcelJS from 'exceljs'
import { A4_LANDSCAPE, PdfDocument, drawPdfTable, measureText, type PdfTableColumn } from '../lib/pdf.js'
import { formatDateKey } from '../lib/dateUtils.js'
import {
  DETAILS_DATE_BASIS_LABEL,
  type DetailsDateBasis,
  type DetailsDatePreset,
  type DetailsQuery,
} from '../lib/detailsQueryValidation.js'
import type { DetailsRecord, DetailsSummary } from './detailsService.js'

/**
 * Details exports: a real .xlsx workbook and a hand-built PDF.
 *
 * Both exports reuse the exact same parsed query as the table, so whatever the
 * admin currently has filtered/sorted/searched is what lands in the file. Both
 * carry the FULL Aadhaar number (the admin section is authenticated and the
 * requirement is explicit); the masked form is only for public surfaces.
 */

const MS_PER_DAY = 86_400_000

export interface DetailsExportMeta {
  generatedAt: Date
  source: string
  propertyName: string
  status: string
  paymentStatus: string
  search: string
  dateBasis: DetailsDateBasis
  datePreset: DetailsDatePreset
  rangeFrom: string
  rangeTo: string
  sortLabel: string
}

export function detailsExportFileName(extension: 'xlsx' | 'pdf', rangeFrom: string, rangeTo: string): string {
  return `AURA_HOMES_BOOKING_DETAILS_${rangeFrom}_TO_${rangeTo}.${extension}`
}

const GENDER_LABEL: Record<string, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
  PREFER_NOT_TO_SAY: 'Prefer not to say',
}

function rupees(paise: number | null): string {
  return paise === null ? '' : (paise / 100).toFixed(2)
}

/** "Rs." instead of "₹" — the PDF uses WinAnsi text, which cannot encode ₹. */
function rupeesForPdf(paise: number | null): string {
  if (paise === null) return '—'
  return `Rs. ${groupIndian((paise / 100).toFixed(0))}`
}

/** Indian digit grouping (12,34,567 — the last three digits, then pairs). */
export function groupIndian(value: string): string {
  const [wholeRaw, fraction] = value.split('.')
  const negative = wholeRaw.startsWith('-')
  const whole = negative ? wholeRaw.slice(1) : wholeRaw
  const tail = fraction ? `.${fraction}` : ''

  if (whole.length <= 3) return `${negative ? '-' : ''}${whole}${tail}`
  const lastThree = whole.slice(-3)
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${rest},${lastThree}${tail}`
}

export function statusLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase()
}

/** The one row shape used by BOTH exports, so the two can never drift apart. */
export function detailsExportRows(records: DetailsRecord[]): string[][] {
  return records.map((record) => [
    record.reference,
    record.source,
    record.propertyName,
    record.checkIn,
    record.checkOut,
    String(record.nights),
    record.guestName,
    record.aadhaarNumber,
    record.gender ? GENDER_LABEL[record.gender] ?? record.gender : '',
    record.age === null ? '' : String(record.age),
    record.primaryPhone,
    String(record.guestCount),
    statusLabel(record.status),
    record.paymentStatus ? statusLabel(record.paymentStatus) : '',
    rupees(record.amountPaise),
    rupees(record.discountPaise),
    record.couponCode ?? '',
    record.bookingDate.slice(0, 19).replace('T', ' '),
  ])
}

const COLUMN_HEADERS = [
  'Booking ID / Reservation ID',
  'Source',
  'Property',
  'Check-in',
  'Check-out',
  'Nights',
  'Guest Name',
  'Aadhaar (full)',
  'Gender',
  'Age',
  'Phone',
  'Guests',
  'Booking Status',
  'Payment Status',
  'Amount (INR)',
  'Discount (INR)',
  'Coupon',
  'Booking Date',
]

function timestampForDisplay(date: Date): string {
  return `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC`
}

function filterLines(meta: DetailsExportMeta, query: DetailsQuery): string[] {
  const lines = [
    `Date basis: ${DETAILS_DATE_BASIS_LABEL[meta.dateBasis]}`,
    `Date range: ${formatDateKey(meta.rangeFrom)} — ${formatDateKey(meta.rangeTo)} (${meta.datePreset})`,
    `Source: ${meta.source}`,
    `Property: ${meta.propertyName}`,
    `Booking status: ${meta.status}`,
    `Payment status: ${meta.paymentStatus}`,
    `Search: ${meta.search}`,
    `Sorted by: ${meta.sortLabel}`,
  ]
  return lines
}

// ── Excel (.xlsx) ───────────────────────────────────────────────────────────

/**
 * A genuine OOXML workbook (zip container written by ExcelJS) — NOT a renamed
 * CSV. Two sheets: the filtered records, and a summary/filter header.
 */
export async function buildDetailsWorkbook(
  records: DetailsRecord[],
  summary: DetailsSummary,
  meta: DetailsExportMeta,
  query: DetailsQuery
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'AURA HOMES'
  workbook.lastModifiedBy = 'AURA HOMES Admin'
  workbook.created = meta.generatedAt

  const summarySheet = workbook.addWorksheet('Summary')
  summarySheet.columns = [
    { header: 'Field', key: 'field', width: 30 },
    { header: 'Value', key: 'value', width: 60 },
  ]
  summarySheet.getRow(1).font = { bold: true }
  summarySheet.addRow({ field: 'Generated at', value: timestampForDisplay(meta.generatedAt) })
  for (const line of filterLines(meta, query)) {
    const [label, ...rest] = line.split(': ')
    summarySheet.addRow({ field: label, value: rest.join(': ') })
  }
  // The machine-readable range too, so a downloaded report is unambiguous.
  summarySheet.addRow({
    field: 'Date range (YYYY-MM-DD)',
    value: `${meta.rangeFrom} → ${meta.rangeTo}`,
  })
  summarySheet.addRow({ field: 'Date basis key', value: query.dateBasis })
  summarySheet.addRow({ field: 'Total bookings', value: summary.totalBookings })
  summarySheet.addRow({ field: 'Normal bookings', value: summary.normalBookings })
  summarySheet.addRow({ field: 'Airbnb bookings', value: summary.airbnbBookings })
  summarySheet.addRow({ field: 'Cancelled bookings', value: summary.cancelledBookings })
  summarySheet.addRow({ field: 'Total guests', value: summary.totalGuests })
  summarySheet.addRow({ field: 'Occupied nights (excl. cancelled)', value: summary.occupiedNights })
  summarySheet.addRow({
    field: 'Total amount (normal bookings only, excl. cancelled)',
    value: rupees(summary.totalAmountPaise),
  })
  for (const entry of summary.byProperty) {
    summarySheet.addRow({
      field: `Property — ${entry.label}`,
      value: `${entry.count} bookings · ${entry.guests} guests · ${entry.nights} nights · ${rupees(entry.amountPaise)}`,
    })
  }
  for (const entry of summary.byMonth) {
    summarySheet.addRow({
      field: `Month — ${entry.key}`,
      value: `${entry.count} bookings · ${entry.guests} guests · ${entry.nights} nights · ${rupees(entry.amountPaise)}`,
    })
  }

  const sheet = workbook.addWorksheet('Booking Details')
  sheet.columns = COLUMN_HEADERS.map((header, index) => ({
    header,
    key: `c${index}`,
    width: index === 2 ? 24 : index === 6 ? 24 : 16,
  }))
  sheet.getRow(1).font = { bold: true }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  const rows = detailsExportRows(records)
  rows.forEach((cells) => {
    const row = sheet.addRow(
      Object.fromEntries(cells.map((value, index) => [`c${index}`, value]))
    )
    // Aadhaar + IDs stay as text so Excel never turns a 12-digit number into
    // scientific notation or drops leading zeros.
    for (const key of ['c0', 'c7', 'c10']) row.getCell(key).numFmt = '@'
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

// ── PDF ─────────────────────────────────────────────────────────────────────

/** Landscape column geometry (points). Total table width ≈ 785pt inside margins. */
const PDF_COLUMNS: PdfTableColumn[] = [
  { header: 'ID', width: 82 },
  { header: 'Src', width: 52 },
  { header: 'Property', width: 104 },
  { header: 'Check-in', width: 60 },
  { header: 'Check-out', width: 60 },
  { header: 'Nts', width: 28, align: 'right' },
  { header: 'Guest', width: 104 },
  { header: 'Aadhaar', width: 80 },
  { header: 'Gender', width: 52 },
  { header: 'Age', width: 26, align: 'right' },
  { header: 'Phone', width: 74 },
  { header: 'Gsts', width: 30, align: 'right' },
  { header: 'Status', width: 60 },
  { header: 'Pay', width: 58 },
  { header: 'Amount', width: 62, align: 'right' },
]

function pdfRows(records: DetailsRecord[]): string[][] {
  return records.map((record) => [
    record.reference,
    record.source === 'NORMAL' ? 'NORMAL' : 'AIRBNB',
    record.propertyName,
    record.checkIn,
    record.checkOut,
    String(record.nights),
    record.guestName,
    // FULL Aadhaar — required in the PDF, never masked.
    record.aadhaarNumber,
    record.gender ? (GENDER_LABEL[record.gender] ?? record.gender) : '—',
    record.age === null ? '—' : String(record.age),
    record.primaryPhone,
    String(record.guestCount),
    statusLabel(record.status),
    record.paymentStatus ? statusLabel(record.paymentStatus) : '—',
    rupeesForPdf(record.amountPaise),
  ])
}

/**
 * Professional landscape PDF: title block, generated timestamp, active filters,
 * a summary panel, then the table with the header row repeated on every page.
 */
export function buildDetailsPdf(
  records: DetailsRecord[],
  summary: DetailsSummary,
  meta: DetailsExportMeta,
  query: DetailsQuery
): Buffer {
  const doc = new PdfDocument({
    pageSize: A4_LANDSCAPE,
    title: 'AURA HOMES — Booking Details Report',
    createdAt: meta.generatedAt,
  })
  doc.addPage()

  const marginX = 28
  const contentWidth = A4_LANDSCAPE.width - marginX * 2
  let y = 34

  doc.text('AURA HOMES', marginX, y, { size: 18, font: 'bold' })
  doc.text('BOOKING DETAILS REPORT', marginX, y + 21, { size: 12, font: 'bold' })
  const generatedText = `Generated: ${timestampForDisplay(meta.generatedAt)}`
  doc.text(generatedText, A4_LANDSCAPE.width - marginX - measureText(generatedText, 9), y + 4, { size: 9 })
  y += 44
  doc.line(marginX, y, A4_LANDSCAPE.width - marginX, y, 0.3, 1)
  y += 12

  // Filters
  doc.text('SELECTED FILTERS', marginX, y, { size: 9, font: 'bold' })
  y += 14
  const filterText = filterLines(meta, query)
  const columnWidth = contentWidth / 2
  filterText.forEach((line, index) => {
    const column = index % 2
    const rowIndex = Math.floor(index / 2)
    doc.text(line, marginX + column * columnWidth, y + rowIndex * 12, {
      size: 8,
      maxWidth: columnWidth - 8,
    })
  })
  y += Math.ceil(filterText.length / 2) * 12 + 8

  // Summary panel
  doc.rect(marginX, y, contentWidth, 44, 0.93)
  const summaryItems: Array<[string, string]> = [
    ['Total bookings', String(summary.totalBookings)],
    ['Normal bookings', String(summary.normalBookings)],
    ['Airbnb bookings', String(summary.airbnbBookings)],
    ['Total guests', String(summary.totalGuests)],
    ['Occupied nights (excl. cancelled)', String(summary.occupiedNights)],
    ['Total amount (normal bookings)', rupeesForPdf(summary.totalAmountPaise)],
  ]
  const cellWidth = contentWidth / summaryItems.length
  summaryItems.forEach(([label, value], index) => {
    const x = marginX + index * cellWidth
    doc.text(label, x + 6, y + 8, { size: 7, maxWidth: cellWidth - 12 })
    doc.text(value, x + 6, y + 24, { size: 11, font: 'bold', maxWidth: cellWidth - 12 })
  })
  y += 58

  doc.text(`RECORDS (${records.length})`, marginX, y, { size: 9, font: 'bold' })
  y += 16

  if (records.length === 0) {
    doc.text('No records match the selected filters.', marginX, y, { size: 9 })
    return doc.build()
  }

  const table = drawPdfTable(doc, {
    columns: PDF_COLUMNS,
    rows: pdfRows(records),
    x: marginX,
    y,
    fontSize: 7.5,
    maxRows: 2000,
  })

  if (table.truncated) {
    doc.text(
      `Showing the first ${table.drawn} of ${records.length} records. Narrow the filters to export the rest.`,
      marginX,
      table.y + 8,
      { size: 8 }
    )
  }

  return doc.build()
}
