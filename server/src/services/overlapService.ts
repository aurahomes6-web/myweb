import type { PrismaClient } from '../generated/prisma/client.js'
import { AirbnbStatus, BookingStatus } from '../generated/prisma/enums.js'
import { toUtcDate } from '../lib/dateUtils.js'

/**
 * Single source of truth for "is [checkIn, checkOut) already claimed?".
 * Checks:
 *   - non-cancelled direct bookings,
 *   - ACTIVE Airbnb reservations,
 *   - manually blocked dates (rows not owned by any Airbnb reservation).
 *
 * An optional scope excludes the record being edited so updating a booking or
 * reservation does not conflict with itself.
 */

export interface ConflictScope {
  propertyId: string
  checkIn: string
  checkOut: string
  excludeBookingId?: string
  excludeAirbnbId?: string
}

export interface ConflictCheck {
  booking: boolean
  airbnb: boolean
  manual: boolean
}

export async function collectConflicts(
  client: PrismaClient,
  scope: ConflictScope
): Promise<ConflictCheck> {
  const from = toUtcDate(scope.checkIn)
  const to = toUtcDate(scope.checkOut)

  const booking = await client.booking.findFirst({
    where: {
      propertyId: scope.propertyId,
      status: { not: BookingStatus.CANCELLED },
      checkIn: { lt: to },
      checkOut: { gt: from },
      ...(scope.excludeBookingId ? { id: { not: scope.excludeBookingId } } : {}),
    },
    select: { id: true },
  })

  const airbnb = await client.airbnbReservation.findFirst({
    where: {
      propertyId: scope.propertyId,
      status: AirbnbStatus.ACTIVE,
      checkIn: { lt: to },
      checkOut: { gt: from },
      ...(scope.excludeAirbnbId ? { id: { not: scope.excludeAirbnbId } } : {}),
    },
    select: { id: true },
  })

  const manual = await client.blockedDate.findFirst({
    where: {
      propertyId: scope.propertyId,
      date: { gte: from, lt: to },
      airbnbReservationId: null,
    },
    select: { id: true },
  })

  return { booking: booking !== null, airbnb: airbnb !== null, manual: manual !== null }
}

export function anyConflict(conflicts: ConflictCheck): boolean {
  return conflicts.booking || conflicts.airbnb || conflicts.manual
}

/** Human-readable reason for rejecting a save against a busy window. */
export function conflictMessage(conflicts: ConflictCheck): string {
  if (conflicts.booking && conflicts.airbnb) {
    return 'That window clashes with an existing booking and an Airbnb reservation.'
  }
  if (conflicts.booking) return 'That window clashes with an existing booking.'
  if (conflicts.airbnb) return 'That window clashes with another Airbnb reservation.'
  return 'That window contains a manually blocked date.'
}