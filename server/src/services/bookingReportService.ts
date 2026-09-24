import ExcelJS from 'exceljs'
import type { PrismaClient } from '../generated/prisma/client.js'
import type {
  BookingStatus,
  GuestGender,
  PaymentStatus,
} from '../generated/prisma/enums.js'
import { addDays, toDateKey, toUtcDate } from '../lib/dateUtils.js'
import type { BookingReportRange } from '../lib/bookingReportValidation.js'

/**
 * Admin-only booking report generation.
 *
 * The report covers NORMAL AURA HOMES bookings only (`booking` rows; Airbnb
 * reservations live in a separate table and are never included). A booking is
 * included when its creation date falls inside the requested range, so the
 * whole relation set is loaded with one query (no per-guest round trips) and
 * serialised straight into an .xlsx workbook streamed to the admin client.
 *
 * Full Aadhaar numbers are written into the workbook — this module is only ever
 * reached behind the authenticated admin guard. Nothing here logs aadhaar data.
 */

const propertyRefInclude = {
  property: { select: { id: true, name: true, slug: true, shortLabel: true } },
} as const

const guestRecordsInclude = {
  guestRecords: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      fullName: true,
      aadhaarNumber: true,
      gender: true,
      age: true,
      phone: true,
      isPrimary: true,
    },
  },
} as const

const MS_PER_DAY = 86_400_000

export interface ReportBookingRow {
  id: string
  code: string
  checkIn: Date
  checkOut: Date
  guestCount: number
  primaryPhone: string
  notes: string | null
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
  updatedAt: Date
  property: { id: string; name: string; slug: string; shortLabel: string } | null
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

function createdAtFilter(range: BookingReportRange) {
  return { createdAt: { gte: toUtcDate(range.from), lt: toUtcDate(addDays(range.to, 1)) } }
}

export async function countBookingsInRange(
  client: PrismaClient,
  range: BookingReportRange
): Promise<number> {
  return client.booking.count({ where: createdAtFilter(range) })
}

export async function listBookingsForReport(
  client: PrismaClient,
  range: BookingReportRange
): Promise<ReportBookingRow[]> {
  return client.booking.findMany({
    where: createdAtFilter(range),
    orderBy: { createdAt: 'asc' },
    include: { ...propertyRefInclude, ...guestRecordsInclude },
  })
}

export function bookingsReportFileName(from: string, to: string): string {
  return `AURA_HOMES_BOOKINGS_${from}_TO_${to}.xlsx`
}

const GENDER_LABEL: Record<GuestGender, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
  PREFER_NOT_TO_SAY: 'Prefer not to say',
}

function nightsBetween(checkIn: Date, checkOut: Date): number {
  return Math.round((checkOut.getTime() - checkIn.getTime()) / MS_PER_DAY)
}

function rupees(paise: number | null): number {
  return paise == null ? 0 : paise / 100
}

function timestamp(date: Date | null): string {
  if (!date) return ''
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

export async function buildBookingsReportWorkbook(bookings: ReportBookingRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'AURA HOMES'
  workbook.lastModifiedBy = 'AURA HOMES Admin'
  workbook.created = new Date()

  const bookingsSheet = workbook.addWorksheet('Bookings')
  bookingsSheet.columns = [
    { header: 'Booking ID', key: 'code', width: 22 },
    { header: 'Booking Status', key: 'status', width: 14 },
    { header: 'Payment Status', key: 'paymentStatus', width: 14 },
    { header: 'Property', key: 'property', width: 28 },
    { header: 'Check-in', key: 'checkIn', width: 12 },
    { header: 'Check-out', key: 'checkOut', width: 12 },
    { header: 'Nights', key: 'nights', width: 8 },
    { header: 'Guests Count', key: 'guestCount', width: 11 },
    { header: 'Original Amount (₹)', key: 'originalAmount', width: 15 },
    { header: 'Discount (₹)', key: 'discount', width: 13 },
    { header: 'Final Amount (₹)', key: 'finalAmount', width: 15 },
    { header: 'Coupon Code', key: 'couponCode', width: 14 },
    { header: 'UTR', key: 'utr', width: 22 },
    { header: 'Payment Submitted At', key: 'paymentSubmittedAt', width: 20 },
    { header: 'Payment Accepted At', key: 'paymentAcceptedAt', width: 20 },
    { header: 'Payment Rejected At', key: 'paymentRejectedAt', width: 20 },
    { header: 'Rejection Message', key: 'rejectionMessage', width: 42 },
    { header: 'Primary Guest Name', key: 'primaryGuestName', width: 24 },
    { header: 'Primary Guest Phone', key: 'primaryGuestPhone', width: 18 },
    { header: 'Guest Details', key: 'guestDetails', width: 48 },
    { header: 'Notes', key: 'notes', width: 34 },
    { header: 'Booking Created At', key: 'createdAt', width: 20 },
    { header: 'Booking Updated At', key: 'updatedAt', width: 20 },
  ]
  bookingsSheet.getRow(1).font = { bold: true }
  bookingsSheet.views = [{ state: 'frozen', ySplit: 1 }]

  for (const booking of bookings) {
    const primary = booking.guestRecords.find((g) => g.isPrimary) ?? booking.guestRecords[0] ?? null
    bookingsSheet.addRow({
      code: booking.code,
      status: booking.status,
      paymentStatus: booking.paymentStatus ?? '',
      property: booking.property?.name ?? '',
      checkIn: toDateKey(booking.checkIn),
      checkOut: toDateKey(booking.checkOut),
      nights: nightsBetween(booking.checkIn, booking.checkOut),
      guestCount: booking.guestCount,
      originalAmount: rupees(booking.originalPricePaise),
      discount: rupees(booking.discountPaise),
      finalAmount: rupees(booking.finalPricePaise),
      couponCode: booking.couponCode ?? '',
      utr: booking.utr ?? '',
      paymentSubmittedAt: timestamp(booking.paymentSubmittedAt),
      paymentAcceptedAt: timestamp(booking.paymentAcceptedAt),
      paymentRejectedAt: timestamp(booking.paymentRejectedAt),
      rejectionMessage: booking.rejectionMessage ?? '',
      primaryGuestName: primary?.fullName ?? '',
      primaryGuestPhone: booking.primaryPhone,
      guestDetails: booking.guestRecords
        .map(
          (g) =>
            `${g.fullName} (${GENDER_LABEL[g.gender]}, ${g.age}${g.isPrimary ? ', Primary' : ''})`
        )
        .join('; '),
      notes: booking.notes ?? '',
      createdAt: timestamp(booking.createdAt),
      updatedAt: timestamp(booking.updatedAt),
    })
  }

  const guestsSheet = workbook.addWorksheet('Guests')
  guestsSheet.columns = [
    { header: 'Booking ID', key: 'bookingCode', width: 22 },
    { header: 'Guest Name', key: 'fullName', width: 24 },
    { header: 'Aadhaar Number', key: 'aadhaarNumber', width: 18 },
    { header: 'Gender', key: 'gender', width: 18 },
    { header: 'Age', key: 'age', width: 8 },
    { header: 'Phone', key: 'phone', width: 18 },
    { header: 'Primary Guest', key: 'isPrimary', width: 13 },
  ]
  guestsSheet.getRow(1).font = { bold: true }
  guestsSheet.views = [{ state: 'frozen', ySplit: 1 }]

  for (const booking of bookings) {
    for (const guest of booking.guestRecords) {
      guestsSheet.addRow({
        bookingCode: booking.code,
        fullName: guest.fullName,
        aadhaarNumber: guest.aadhaarNumber,
        gender: GENDER_LABEL[guest.gender],
        age: guest.age,
        phone: guest.phone ?? '',
        isPrimary: guest.isPrimary ? 'Yes' : 'No',
      })
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}