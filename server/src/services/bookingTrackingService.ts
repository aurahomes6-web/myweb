import type { PrismaClient } from '../generated/prisma/client.js'
import { BookingStatus, PaymentStatus } from '../generated/prisma/enums.js'
import { toDateKey } from '../lib/dateUtils.js'
import { NotFoundError } from './adminService.js'

export { NotFoundError }

/**
 * Public booking tracking by Booking ID (e.g. "AURA…").
 *
 * This is a strictly-safe DTO: it exposes only what a guest needs to verify
 * their stay — status, dates, guest count and the pricing snapshot. It never
 * includes Aadhaar, guest identities, phones, IDs or the UTR (not even in
 * masked form, because the tracking page is public and the UTR is private to
 * the admin review flow).
 */

export interface BookingTrackingDto {
  code: string
  status: BookingStatus
  paymentStatus: PaymentStatus | null
  rejectionMessage: string | null
  paymentSubmittedAt: string | null
  paymentAcceptedAt: string | null
  paymentRejectedAt: string | null
  checkIn: string
  checkOut: string
  nights: number
  guestCount: number
  originalPricePaise: number | null
  discountPaise: number | null
  finalPricePaise: number | null
  property: {
    id: string
    name: string
    slug: string
    shortLabel: string
  }
}

interface TrackingRow {
  code: string
  checkIn: Date
  checkOut: Date
  guestCount: number
  status: BookingStatus
  paymentStatus: PaymentStatus | null
  rejectionMessage: string | null
  paymentSubmittedAt: Date | null
  paymentAcceptedAt: Date | null
  paymentRejectedAt: Date | null
  originalPricePaise: number | null
  discountPaise: number | null
  finalPricePaise: number | null
  property: { id: string; name: string; slug: string; shortLabel: string } | null
}

function nightsBetween(checkIn: Date, checkOut: Date): number {
  return Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24))
}

export function serializeTrackingDto(row: unknown): BookingTrackingDto {
  const r = row as TrackingRow
  return {
    code: r.code,
    status: r.status,
    paymentStatus: r.paymentStatus,
    rejectionMessage: r.rejectionMessage,
    paymentSubmittedAt: r.paymentSubmittedAt?.toISOString() ?? null,
    paymentAcceptedAt: r.paymentAcceptedAt?.toISOString() ?? null,
    paymentRejectedAt: r.paymentRejectedAt?.toISOString() ?? null,
    checkIn: toDateKey(r.checkIn),
    checkOut: toDateKey(r.checkOut),
    nights: nightsBetween(r.checkIn, r.checkOut),
    guestCount: r.guestCount,
    originalPricePaise: r.originalPricePaise ?? null,
    discountPaise: r.discountPaise ?? null,
    finalPricePaise: r.finalPricePaise ?? null,
    property: r.property ?? {
      id: '',
      name: 'Unknown property',
      slug: '',
      shortLabel: '',
    },
  }
}

/** Look up a booking by its public code (case-insensitive). Throws NotFoundError. */
export async function trackBookingByCode(
  client: PrismaClient,
  code: string
): Promise<BookingTrackingDto> {
  const normalized = code.trim().toUpperCase()
  const booking = await client.booking.findUnique({
    where: { code: normalized },
    include: {
      property: { select: { id: true, name: true, slug: true, shortLabel: true } },
    },
  })
  if (!booking) throw new NotFoundError('No booking found for that Booking ID.')
  return serializeTrackingDto(booking)
}