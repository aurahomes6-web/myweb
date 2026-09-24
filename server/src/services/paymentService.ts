import type { PrismaClient } from '../generated/prisma/client.js'
import { BookingStatus, PaymentStatus } from '../generated/prisma/enums.js'
import { toDateKey } from '../lib/dateUtils.js'
import { ConflictError, NotFoundError } from './adminService.js'

export { ConflictError, NotFoundError }

/**
 * Admin review of direct-UPI payments for normal bookings.
 *
 * The payment ledger is a denormalized view over Booking rows where
 * `paymentStatus` has been recorded (PENDING / ACCEPTED / REJECTED). Accepting
 * a payment confirms it in place; rejecting it keeps the ledger row (with the
 * UTR) for audit but sets `booking.status` to CANCELLED so the existing
 * availability/overlap services release the night. Every function here assumes
 * an authenticated admin caller.
 *
 * A fake Prisma client can be passed as the `client` parameter in unit tests.
 */

// ── DTO ────────────────────────────────────────────────────────────────────

export interface AdminPaymentDto {
  id: string
  code: string
  propertyId: string
  property: {
    id: string
    name: string
    slug: string
    shortLabel: string
  }
  checkIn: string
  checkOut: string
  nights: number
  guestCount: number
  primaryPhone: string
  paymentStatus: PaymentStatus
  /** Full UTR — admin-only, never exposed through public serializers. */
  utr: string | null
  paymentSubmittedAt: string
  paymentAcceptedAt: string | null
  paymentRejectedAt: string | null
  rejectionMessage: string | null
  bookingStatus: BookingStatus
  originalPricePaise: number | null
  discountPaise: number | null
  finalPricePaise: number | null
}

interface PaymentRow {
  id: string
  code: string
  propertyId: string
  checkIn: Date
  checkOut: Date
  guestCount: number
  primaryPhone: string
  paymentStatus: PaymentStatus
  utr: string | null
  paymentSubmittedAt: Date
  paymentAcceptedAt: Date | null
  paymentRejectedAt: Date | null
  rejectionMessage: string | null
  status: BookingStatus
  originalPricePaise: number | null
  discountPaise: number | null
  finalPricePaise: number | null
  property: { id: string; name: string; slug: string; shortLabel: string } | null
}

function nightsBetween(checkIn: Date, checkOut: Date): number {
  return Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24))
}

export function serializePaymentDto(row: unknown): AdminPaymentDto {
  const r = row as PaymentRow
  return {
    id: r.id,
    code: r.code,
    propertyId: r.propertyId,
    property: r.property ?? {
      id: r.propertyId,
      name: 'Unknown property',
      slug: '',
      shortLabel: '',
    },
    checkIn: toDateKey(r.checkIn),
    checkOut: toDateKey(r.checkOut),
    nights: nightsBetween(r.checkIn, r.checkOut),
    guestCount: r.guestCount,
    primaryPhone: r.primaryPhone,
    paymentStatus: r.paymentStatus,
    utr: r.utr ?? null,
    paymentSubmittedAt: r.paymentSubmittedAt.toISOString(),
    paymentAcceptedAt: r.paymentAcceptedAt?.toISOString() ?? null,
    paymentRejectedAt: r.paymentRejectedAt?.toISOString() ?? null,
    rejectionMessage: r.rejectionMessage ?? null,
    bookingStatus: r.status,
    originalPricePaise: r.originalPricePaise ?? null,
    discountPaise: r.discountPaise ?? null,
    finalPricePaise: r.finalPricePaise ?? null,
  }
}

// ── queries ────────────────────────────────────────────────────────────────

const paymentPropertyInclude = {
  property: { select: { id: true, name: true, slug: true, shortLabel: true } },
} as const

export async function listPayments(client: PrismaClient): Promise<AdminPaymentDto[]> {
  const payments = await client.booking.findMany({
    where: { paymentStatus: { not: null } },
    orderBy: { paymentSubmittedAt: 'desc' },
    include: paymentPropertyInclude,
  })
  return payments.map(serializePaymentDto)
}

export async function acceptPayment(client: PrismaClient, id: string): Promise<AdminPaymentDto> {
  const existing = await client.booking.findUnique({
    where: { id },
    select: { id: true, paymentStatus: true },
  })
  if (!existing) throw new NotFoundError('Payment not found.')
  if (existing.paymentStatus !== PaymentStatus.PENDING) {
    throw new ConflictError('Only pending payments can be accepted.')
  }

  const updated = await client.booking.update({
    where: { id },
    data: {
      paymentStatus: PaymentStatus.ACCEPTED,
      paymentAcceptedAt: new Date(),
    },
    include: paymentPropertyInclude,
  })
  return serializePaymentDto(updated)
}

export async function rejectPayment(
  client: PrismaClient,
  id: string,
  rejectionMessage?: string | null
): Promise<AdminPaymentDto> {
  const existing = await client.booking.findUnique({
    where: { id },
    select: { id: true, paymentStatus: true },
  })
  if (!existing) throw new NotFoundError('Payment not found.')
  if (existing.paymentStatus !== PaymentStatus.PENDING) {
    throw new ConflictError('Only pending payments can be rejected.')
  }

  // Rejecting a payment cancels the booking (dates released via the existing
  // availability checks) while the ledger row keeps its UTR for the audit trail.
  const updated = await client.booking.update({
    where: { id },
    data: {
      paymentStatus: PaymentStatus.REJECTED,
      paymentRejectedAt: new Date(),
      rejectionMessage: rejectionMessage ?? null,
      status: BookingStatus.CANCELLED,
    },
    include: paymentPropertyInclude,
  })
  return serializePaymentDto(updated)
}