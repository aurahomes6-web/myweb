import { Request, Response } from 'express'
import { Prisma } from '../generated/prisma/client.js'
import { BookingStatus, GuestGender } from '../generated/prisma/enums.js'
import type { Booking } from '../generated/prisma/client.js'
import { prisma } from '../lib/db.js'
import { toDateKey, toUtcDate } from '../lib/dateUtils.js'
import {
  validateCreateBooking,
  maskAadhaar,
  type CreateBookingInput,
} from '../lib/bookingValidation.js'
import { resolveProperty } from '../services/availabilityService.js'
import { generateBookingCode } from '../lib/bookingCode.js'
import {
  buildWhatsAppMessage,
  getWhatsAppStatus,
  sendBookingNotification,
  type BookingNotificationPayload,
} from '../services/notificationService.js'

const MAX_CODE_ATTEMPTS = 5
const CONFLICT_MESSAGE = 'The selected property is no longer available for these dates.'

class BookingConflictError extends Error {
  constructor() {
    super(CONFLICT_MESSAGE)
    this.name = 'BookingConflictError'
  }
}

export interface SafeGuest {
  fullName: string
  gender: GuestGender
  age: number
  phone: string | null
  isPrimary: boolean
  /** Aadhaar with only the last 4 digits visible, e.g. "********9012". */
  aadhaarNumberMasked: string
}

/** Raw guest record as read from the database (full Aadhaar stays server-side). */
export interface GuestRecordSelected {
  fullName: string
  gender: GuestGender
  age: number
  phone: string | null
  isPrimary: boolean
  aadhaarNumber: string
}

interface CreatedBooking extends Booking {
  guestRecords: GuestRecordSelected[]
}

function isTransientBookingFailure(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002: booking code collision → regenerate and retry.
    // P2034: serializable write conflict → retry against the fresh state.
    return err.code === 'P2002' || err.code === 'P2034'
  }
  return false
}

async function createBookingRecord(input: CreateBookingInput, propertyId: string) {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const clash = await tx.booking.findFirst({
            where: {
              propertyId,
              status: { not: BookingStatus.CANCELLED },
              checkIn: { lt: toUtcDate(input.checkOut) },
              checkOut: { gt: toUtcDate(input.checkIn) },
            },
            select: { id: true },
          })
          if (clash) throw new BookingConflictError()

          const blocked = await tx.blockedDate.findFirst({
            where: {
              propertyId,
              date: { gte: toUtcDate(input.checkIn), lt: toUtcDate(input.checkOut) },
            },
            select: { id: true },
          })
          if (blocked) throw new BookingConflictError()

          return tx.booking.create({
            data: {
              code: generateBookingCode(),
              propertyId,
              checkIn: toUtcDate(input.checkIn),
              checkOut: toUtcDate(input.checkOut),
              guestCount: input.guestCount,
              primaryPhone: input.primaryPhone,
              notes: input.notes || null,
              status: BookingStatus.CONFIRMED,
              guestRecords: {
                create: input.guests.map((guest, index) => ({
                  fullName: guest.fullName,
                  aadhaarNumber: guest.aadhaarNumber,
                  gender: guest.gender,
                  age: guest.age,
                  phone: guest.phone ?? null,
                  isPrimary: index === 0,
                })),
              },
            },
            include: {
              // Aadhaar is selected internally for masking, but is never
              // returned in full — only the last-4-digits form leaves here.
              guestRecords: {
                select: {
                  fullName: true,
                  gender: true,
                  age: true,
                  phone: true,
                  isPrimary: true,
                  aadhaarNumber: true,
                },
              },
            },
          })
        },
        { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 }
      )
    } catch (err) {
      if (!isTransientBookingFailure(err) || attempt >= MAX_CODE_ATTEMPTS - 1) throw err
    }
  }
  throw new Error('Unable to allocate a unique booking code')
}

export function serializeGuestSafe(guest: GuestRecordSelected): SafeGuest {
  return {
    fullName: guest.fullName,
    gender: guest.gender,
    age: guest.age,
    phone: guest.phone,
    isPrimary: guest.isPrimary,
    aadhaarNumberMasked: maskAadhaar(guest.aadhaarNumber),
  }
}

export function serializeBooking(booking: Booking, guests?: SafeGuest[]) {
  const safe = {
    id: booking.id,
    code: booking.code,
    propertyId: booking.propertyId,
    checkIn: toDateKey(booking.checkIn),
    checkOut: toDateKey(booking.checkOut),
    guestCount: booking.guestCount,
    primaryPhone: booking.primaryPhone,
    notes: booking.notes,
    status: booking.status,
    createdAt: booking.createdAt.toISOString(),
  }
  return guests ? { ...safe, guests } : safe
}

function buildNotificationPayload(
  booking: CreatedBooking,
  input: CreateBookingInput,
  propertyName: string
): BookingNotificationPayload {
  return {
    code: booking.code,
    propertyName,
    checkIn: toDateKey(booking.checkIn),
    checkOut: toDateKey(booking.checkOut),
    guestCount: input.guestCount,
    primaryPhone: input.primaryPhone,
    guests: input.guests.map((guest) => ({
      fullName: guest.fullName,
      aadhaarNumber: guest.aadhaarNumber,
      gender: guest.gender,
      age: guest.age,
    })),
  }
}

export async function createBookingHandler(req: Request, res: Response) {
  const result = validateCreateBooking(req.body)
  if (!result.ok) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Please review the highlighted fields.',
      details: result.issues,
    })
  }

  const input = result.value
  const property = await resolveProperty(input.propertyId)
  if (!property) {
    return res.status(404).json({
      error: 'PROPERTY_NOT_FOUND',
      message: 'That property could not be found.',
    })
  }

  if (input.guestCount > property.capacity) {
    return res.status(400).json({
      error: 'CAPACITY_EXCEEDED',
      message: `This property sleeps up to ${property.capacity} guests.`,
    })
  }

  let booking: CreatedBooking
  try {
    booking = (await createBookingRecord(input, property.id)) as CreatedBooking
  } catch (err) {
    if (err instanceof BookingConflictError) {
      return res
        .status(409)
        .json({ error: 'PROPERTY_UNAVAILABLE', message: CONFLICT_MESSAGE })
    }
    throw err
  }

  // The notification never fails the booking. A future WhatsApp provider can
  // throw here without affecting the confirmed reservation.
  const notifPayload = buildNotificationPayload(booking, input, property.name)
  const notification = await sendBookingNotification(notifPayload).catch((error: unknown) => {
    console.error(
      `[notification] WhatsApp delivery failed after booking ${booking.code}:`,
      error
    )
    return { status: 'FAILED' as const, sent: false }
  })

  // The customer's own WhatsApp pre-fill: full Aadhaar is included ONLY in this
  // message, which the client puts straight into the wa.me click-to-chat link.
  // The public GET lookup never carries a message or the full number.
  const whatsAppMessage = buildWhatsAppMessage(notifPayload, { fullAadhaar: true })

  return res.status(201).json({
    ...serializeBooking(booking, booking.guestRecords.map(serializeGuestSafe)),
    property: { name: property.name, slug: property.slug, shortLabel: property.shortLabel },
    whatsAppMessage,
    notification,
  })
}

export async function getBookingHandler(req: Request, res: Response) {
  const reference = typeof req.params.id === 'string' ? req.params.id : undefined
  if (!reference) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Booking id or code is required' })
  }

  const booking = await prisma.booking.findFirst({
    where: { OR: [{ id: reference }, { code: reference }] },
    include: {
      property: { select: { name: true, slug: true, shortLabel: true, location: true } },
      // Aadhaar is selected internally for masking, but is never returned in
      // full — only the last-4-digits form leaves here.
      guestRecords: {
        select: {
          fullName: true,
          gender: true,
          age: true,
          phone: true,
          isPrimary: true,
          aadhaarNumber: true,
        },
      },
    },
  })

  if (!booking) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Booking not found.' })
  }

  res.json({
    ...serializeBooking(booking, booking.guestRecords.map(serializeGuestSafe)),
    property: booking.property,
    notification: getWhatsAppStatus(),
  })
}