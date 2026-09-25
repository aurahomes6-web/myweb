import { Request, Response } from 'express'
import { Prisma } from '../generated/prisma/client.js'
import { BookingStatus, GuestGender, PaymentStatus } from '../generated/prisma/enums.js'
import type { Booking, Property } from '../generated/prisma/client.js'
import { prisma } from '../lib/db.js'
import { toDateKey, toUtcDate } from '../lib/dateUtils.js'
import {
  validateCreateBooking,
  maskAadhaar,
  type CreateBookingInput,
} from '../lib/bookingValidation.js'
import { isUtrReference } from '../lib/paymentValidation.js'
import { resolveProperty } from '../services/availabilityService.js'
import { lockPropertyForNormalBooking } from '../services/overlapService.js'
import { generateBookingCode } from '../lib/bookingCode.js'
import {
  buildWhatsAppMessage,
  getWhatsAppStatus,
  sendBookingNotification,
  type BookingNotificationPayload,
} from '../services/notificationService.js'
import {
  trackBookingByCode,
  NotFoundError,
} from '../services/bookingTrackingService.js'
import { consumeCouponInTransaction, CouponInvalidError } from '../services/couponService.js'
import { computeStayPricing, CURRENCY, type PricingSnapshot } from '../services/pricingService.js'

const MAX_CODE_ATTEMPTS = 5
const CONFLICT_MESSAGE = 'The selected property is no longer available for these dates.'
const INACTIVE_MESSAGE = 'This home is temporarily unavailable for booking.'

class BookingConflictError extends Error {
  constructor() {
    super(CONFLICT_MESSAGE)
    this.name = 'BookingConflictError'
  }
}

class BookingInactiveError extends Error {
  constructor() {
    super(INACTIVE_MESSAGE)
    this.name = 'BookingInactiveError'
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
  pricing: PricingSnapshot
}

export interface BookingPricingResponse extends PricingSnapshot {
  currency: 'INR'
  couponCode?: string
}

function nightsBetweenDates(checkIn: Date, checkOut: Date): number {
  return Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24))
}

function isTransientBookingFailure(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002: booking code collision → regenerate and retry.
    // P2034: serializable write conflict → retry against the fresh state.
    return err.code === 'P2002' || err.code === 'P2034'
  }
  return false
}

async function createBookingRecord(input: CreateBookingInput, property: Property) {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          await lockPropertyForNormalBooking(tx, property.id)
          const freshProperty = await tx.property.findUnique({ where: { id: property.id } })

          if (!freshProperty || !freshProperty.isActive) throw new BookingInactiveError()
          const clash = await tx.booking.findFirst({
            where: {
              propertyId: property.id,
              status: { not: BookingStatus.CANCELLED },
              checkIn: { lt: toUtcDate(input.checkOut) },
              checkOut: { gt: toUtcDate(input.checkIn) },
            },
            select: { id: true },
          })
          if (clash) throw new BookingConflictError()

          const blocked = await tx.blockedDate.findFirst({
            where: {
              propertyId: property.id,
              date: { gte: toUtcDate(input.checkIn), lt: toUtcDate(input.checkOut) },
            },
            select: { id: true },
          })
          if (blocked) throw new BookingConflictError()

          const manualBlock = await tx.bookingDateBlock.findFirst({
            where: {
              propertyId: property.id,
              startDate: { lt: toUtcDate(input.checkOut) },
              endDate: { gte: toUtcDate(input.checkIn) },
            },
            select: { id: true },
          })
          if (manualBlock) throw new BookingConflictError()

          // Server-authoritative pricing: the price always comes from the
          // database and the coupon from the coupon table — never from the
          // client. A failed booking rolls back any coupon usage too.
          const nights = nightsBetweenDates(
            toUtcDate(input.checkIn),
            toUtcDate(input.checkOut)
          )
          const stayPricing = computeStayPricing(
            freshProperty.pricePerNightPaise,
            freshProperty.discountedPricePerNightPaise,
            nights
          )
          let couponDiscountPaise = 0
          let coupon: { id: string; code: string } | null = null
          if (input.couponCode !== undefined) {
            const consumed = await consumeCouponInTransaction(
              tx,
              input.couponCode,
              stayPricing.effectivePricePaise
            )
            coupon = { id: consumed.id, code: consumed.code }
            couponDiscountPaise = consumed.discountPaise
          }
          const discountPaise = stayPricing.propertyDiscountPaise + couponDiscountPaise
          const finalPricePaise = stayPricing.effectivePricePaise - couponDiscountPaise

          const created = (await tx.booking.create({
            data: {
              code: generateBookingCode(),
              propertyId: property.id,
              checkIn: toUtcDate(input.checkIn),
              checkOut: toUtcDate(input.checkOut),
              guestCount: input.guestCount,
              primaryPhone: input.primaryPhone,
              notes: input.notes || null,
              status: BookingStatus.CONFIRMED,
              originalPricePaise: stayPricing.originalPricePaise,
              discountPaise,
              finalPricePaise,
              couponId: coupon?.id ?? null,
              couponCode: coupon?.code ?? null,
              paymentStatus: input.utr ? PaymentStatus.PENDING : null,
              utr: input.utr ?? null,
              paymentSubmittedAt: input.utr ? new Date() : null,
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
          })) as CreatedBooking

          const pricing: PricingSnapshot = {
            nights,
            originalPricePaise: stayPricing.originalPricePaise,
            discountPaise,
            finalPricePaise,
            currency: CURRENCY,
            ...(coupon ? { couponCode: coupon.code } : {}),
          }

          if (coupon) {
            await tx.couponUsage.create({ data: { couponId: coupon.id, bookingId: created.id } })
          }

          return { ...created, pricing }
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

function bookingPricingSnapshot(booking: Booking): BookingPricingResponse | null {
  if (
    booking.originalPricePaise === null &&
    booking.discountPaise === null &&
    booking.finalPricePaise === null
  ) {
    return null
  }
  const snapshot: BookingPricingResponse = {
    nights: nightsBetweenDates(booking.checkIn, booking.checkOut),
    originalPricePaise: booking.originalPricePaise ?? 0,
    discountPaise: booking.discountPaise ?? 0,
    finalPricePaise: booking.finalPricePaise ?? 0,
    currency: CURRENCY,
  }
  if (booking.couponCode) snapshot.couponCode = booking.couponCode
  return snapshot
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
    paymentStatus: booking.paymentStatus ?? null,
    paymentSubmittedAt: booking.paymentSubmittedAt?.toISOString() ?? null,
    paymentAcceptedAt: booking.paymentAcceptedAt?.toISOString() ?? null,
    paymentRejectedAt: booking.paymentRejectedAt?.toISOString() ?? null,
    rejectionMessage: booking.rejectionMessage ?? null,
    createdAt: booking.createdAt.toISOString(),
    pricing: bookingPricingSnapshot(booking),
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
    ...((booking.couponCode || (booking.discountPaise ?? 0) > 0)
      ? {
          pricing: {
            originalPricePaise: booking.originalPricePaise ?? 0,
            discountPaise: booking.discountPaise ?? 0,
            finalPricePaise: booking.finalPricePaise ?? 0,
            ...(booking.couponCode ? { couponCode: booking.couponCode } : {}),
          },
        }
      : {}),
    ...(booking.utr
      ? {
          payment: {
            status: (booking.paymentStatus ?? PaymentStatus.PENDING),
            utr: booking.utr,
            finalPricePaise: booking.finalPricePaise ?? 0,
          },
        }
      : {}),
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

  // Direct-UPI bookings must carry a transaction reference. The shared
  // validator keeps `utr` optional (admin updates reuse it), so presence is
  // enforced here on the public create path.
  if (input.utr === undefined || !isUtrReference(input.utr)) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Please review the highlighted fields.',
      details: [
        {
          field: 'utr',
          message: 'Please enter the 12–22 character UTR (transaction reference) from your UPI payment.',
        },
      ],
    })
  }

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
    booking = (await createBookingRecord(input, property)) as CreatedBooking
  } catch (err) {
    if (err instanceof BookingConflictError) {
      return res
        .status(409)
        .json({ error: 'PROPERTY_UNAVAILABLE', message: CONFLICT_MESSAGE })
    }
    if (err instanceof BookingInactiveError) {
      return res
        .status(409)
        .json({ error: 'PROPERTY_UNAVAILABLE', message: INACTIVE_MESSAGE })
    }
    if (err instanceof CouponInvalidError) {
      const errorByReason: Record<string, string> = {
        NOT_FOUND: 'COUPON_NOT_FOUND',
        DEACTIVATED: 'COUPON_DEACTIVATED',
        EXPIRED: 'COUPON_EXPIRED',
        USAGE_EXCEEDED: 'COUPON_USAGE_EXCEEDED',
      }
      return res.status(400).json({
        error: errorByReason[err.reason] ?? 'COUPON_INVALID',
        message: 'That coupon could not be applied.',
        details: err.couponCode ? { couponCode: err.couponCode } : undefined,
      })
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

export async function trackBookingHandler(req: Request, res: Response) {
  const code = typeof req.params.bookingId === 'string' ? req.params.bookingId : ''
  if (code.trim().length === 0) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A Booking ID is required.' })
  }

  try {
    const tracked = await trackBookingByCode(prisma, code)
    return res.json({ booking: tracked })
  } catch (err) {
    if (err instanceof NotFoundError) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'No booking found with that Booking ID.',
      })
    }
    throw err
  }
}