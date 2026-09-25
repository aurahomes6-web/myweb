import { prisma } from '../lib/db.js'
import { BookingStatus } from '../generated/prisma/enums.js'
import type { Property } from '../generated/prisma/client.js'
import { addDays, nightsBetween, toDateKey, toUtcDate } from '../lib/dateUtils.js'

export interface AvailabilityParams {
  propertyId: string
  checkIn: string
  checkOut: string
  guests: number
}

export type AvailabilityReason = 'ok' | 'not_found' | 'invalid_dates' | 'guests_exceeded' | 'unavailable' | 'inactive'

export interface AvailabilityResult {
  available: boolean
  nights: number
  reason: AvailabilityReason
}

/** Resolve a property by internal id (UUID/cuid) or public slug. */
export async function resolveProperty(propertyId: string): Promise<Property | null> {
  return prisma.property.findFirst({
    where: { OR: [{ id: propertyId }, { slug: propertyId }] },
  })
}

/**
 * True when a non-cancelled booking already occupies any night of
 * [checkIn, checkOut). Range overlap: a1 < b2 && b1 < a2.
 */
async function hasBookingOverlap(
  propertyId: string,
  checkIn: string,
  checkOut: string
): Promise<boolean> {
  const booking = await prisma.booking.findFirst({
    where: {
      propertyId,
      status: { not: BookingStatus.CANCELLED },
      checkIn: { lt: toUtcDate(checkOut) },
      checkOut: { gt: toUtcDate(checkIn) },
    },
    select: { id: true },
  })
  return booking !== null
}

/** True when an explicitly blocked date falls inside [checkIn, checkOut). */
async function hasBlockedDate(
  propertyId: string,
  checkIn: string,
  checkOut: string
): Promise<boolean> {
  const blocked = await prisma.blockedDate.findFirst({
    where: {
      propertyId,
      date: { gte: toUtcDate(checkIn), lt: toUtcDate(checkOut) },
    },
    select: { id: true },
  })
  return blocked !== null
}

async function hasBookingDateBlock(
  propertyId: string,
  checkIn: string,
  checkOut: string
): Promise<boolean> {
  const block = await prisma.bookingDateBlock.findFirst({
    where: {
      propertyId,
      startDate: { lt: toUtcDate(checkOut) },
      endDate: { gte: toUtcDate(checkIn) },
    },
    select: { id: true },
  })
  return block !== null
}

export async function checkAvailability(params: AvailabilityParams): Promise<AvailabilityResult> {
  const nights = nightsBetween(params.checkIn, params.checkOut)
  if (nights <= 0) {
    return { available: false, nights: 0, reason: 'invalid_dates' }
  }

  const property = await resolveProperty(params.propertyId)
  if (!property) {
    return { available: false, nights, reason: 'not_found' }
  }
  if (!property.isActive) {
    return { available: false, nights, reason: 'inactive' }
  }

  if (params.guests > property.capacity) {
    return { available: false, nights, reason: 'guests_exceeded' }
  }

  if (await hasBookingOverlap(property.id, params.checkIn, params.checkOut)) {
    return { available: false, nights, reason: 'unavailable' }
  }

  if (await hasBlockedDate(property.id, params.checkIn, params.checkOut)) {
    return { available: false, nights, reason: 'unavailable' }
  }

  if (await hasBookingDateBlock(property.id, params.checkIn, params.checkOut)) {
    return { available: false, nights, reason: 'unavailable' }
  }

  return { available: true, nights, reason: 'ok' }
}

/**
 * Every YYYY-MM-DD date within the inclusive [from, to] window that is
 * unavailable (booked by a non-cancelled reservation or explicitly blocked).
 */
export async function getBlockedDates(
  propertyId: string,
  from: string,
  to: string
): Promise<string[]> {
  const property = await resolveProperty(propertyId)
  if (!property || !property.isActive) return []

  const fromDate = toUtcDate(from)
  const toDate = toUtcDate(to)
  const blocked = new Set<string>()

  const explicit = await prisma.blockedDate.findMany({
    where: { propertyId: property.id, date: { gte: fromDate, lte: toDate } },
    select: { date: true },
  })
  for (const row of explicit) {
    blocked.add(toDateKey(row.date))
  }

  const bookingBlocks = await prisma.bookingDateBlock.findMany({
    where: {
      propertyId: property.id,
      startDate: { lte: toDate },
      endDate: { gte: fromDate },
    },
    select: { startDate: true, endDate: true },
  })
  for (const row of bookingBlocks) {
    const start = toDateKey(row.startDate) > from ? toDateKey(row.startDate) : from
    const end = toDateKey(row.endDate) < to ? toDateKey(row.endDate) : to
    for (let key = start; key <= end; key = addDays(key, 1)) blocked.add(key)
  }

  const bookings = await prisma.booking.findMany({
    where: {
      propertyId: property.id,
      status: { not: BookingStatus.CANCELLED },
      checkIn: { lt: toDate },
      checkOut: { gt: fromDate },
    },
    select: { checkIn: true, checkOut: true },
  })

  for (const booking of bookings) {
    const start = toDateKey(booking.checkIn) > from ? toDateKey(booking.checkIn) : from
    const end = toDateKey(booking.checkOut)
    for (let key = start; key < end; key = addDays(key, 1)) {
      if (key <= to) blocked.add(key)
    }
  }

  return [...blocked].sort()
}