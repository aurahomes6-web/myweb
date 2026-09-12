import type { PrismaClient } from '../generated/prisma/client.js'
import { AirbnbStatus, BookingStatus, type GuestGender } from '../generated/prisma/enums.js'
import { addDays, toUtcDate, toDateKey } from '../lib/dateUtils.js'
import { maskAadhaar } from '../lib/bookingValidation.js'
import type { CreateBookingInput, BookingGuestInput } from '../lib/bookingValidation.js'
import type { AirbnbDetailsInput, AirbnbGuestInput } from '../lib/airbnbValidation.js'
import type { PropertyUpdateInput } from '../lib/propertyValidation.js'
import { collectConflicts, anyConflict, conflictMessage } from './overlapService.js'

/**
 * Admin-only booking and Airbnb operations.
 *
 * Every function here assumes the caller is an authenticated admin — full
 * Aadhaar numbers are returned directly in detail serializers. List endpoints
 * mask Aadhaar so accidental copy-paste from browser memory is safe.
 *
 * A fake Prisma client with a working $transaction shim can be passed as the
 * `client` parameter in unit tests.
 */

// ── errors ─────────────────────────────────────────────────────────────────

export class NotFoundError extends Error {
  override readonly name = 'NotFoundError' as const
}
export class ConflictError extends Error {
  override readonly name = 'ConflictError' as const
}
export class BadRequestError extends Error {
  override readonly name = 'BadRequestError' as const
}

// ── DTOs ───────────────────────────────────────────────────────────────────

interface AdminPropertyRef {
  id: string
  name: string
  slug: string
  shortLabel: string
}

export interface AdminGuestDto {
  id: string
  fullName: string
  aadhaarNumber: string
  aadhaarNumberMasked: string
  gender: GuestGender
  age: number
  phone: string | null
  isPrimary: boolean
}

export interface AdminBookingDto {
  id: string
  code: string
  propertyId: string
  property: AdminPropertyRef
  checkIn: string
  checkOut: string
  nights: number
  guestCount: number
  primaryPhone: string
  notes: string | null
  status: BookingStatus
  createdAt: string
  updatedAt: string
  guests: AdminGuestDto[]
}

export interface AdminAirbnbDto {
  id: string
  propertyId: string | null
  property: AdminPropertyRef | null
  reservationNumber: string
  guestName: string
  primaryPhone: string
  checkIn: string
  checkOut: string
  nights: number
  guestCount: number
  status: AirbnbStatus
  notes: string | null
  createdAt: string
  updatedAt: string
  guests: AdminGuestDto[]
}

export interface AdminPropertyDto {
  id: string
  slug: string
  name: string
  shortLabel: string
  description: string
  shortDescription: string
  capacity: number
  bedrooms: number
  beds: number | null
  bathrooms: number
  sqft: number
  amenities: string[]
  accent: string
  visual: string
  location: string | null
}

// ── row shapes (match each query's select/include) ─────────────────────────

interface GuestRow {
  id: string
  fullName: string
  aadhaarNumber: string
  gender: GuestGender
  age: number
  phone?: string | null
  isPrimary?: boolean
}

interface PropertyRefRow {
  id: string
  name: string
  slug: string
  shortLabel: string
}

function propertyRef(row: PropertyRefRow | null): AdminPropertyRef {
  if (!row) throw new ConflictError('Property data missing from join.')
  return { id: row.id, name: row.name, slug: row.slug, shortLabel: row.shortLabel }
}

function nightsBetweenDates(checkIn: Date, checkOut: Date): number {
  return Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24))
}

// ── guest serialisation ────────────────────────────────────────────────────

function serializeGuest(guest: GuestRow, fullAadhaar: boolean): AdminGuestDto {
  return {
    id: guest.id,
    fullName: guest.fullName,
    aadhaarNumber: fullAadhaar ? guest.aadhaarNumber : maskAadhaar(guest.aadhaarNumber),
    aadhaarNumberMasked: maskAadhaar(guest.aadhaarNumber),
    gender: guest.gender,
    age: guest.age,
    phone: guest.phone ?? null,
    isPrimary: guest.isPrimary ?? false,
  }
}

// ── blocked-date materialisation ───────────────────────────────────────────

function materializeBlockedDateRows(
  propertyId: string,
  checkIn: string,
  checkOut: string,
  airbnbReservationId: string
): Array<{ propertyId: string; date: Date; reason: string; airbnbReservationId: string }> {
  const rows = []
  for (let key = checkIn; key < checkOut; key = addDays(key, 1)) {
    rows.push({
      propertyId,
      date: toUtcDate(key),
      reason: 'Airbnb reservation',
      airbnbReservationId,
    })
  }
  return rows
}

// ── shared Prisma include objects ──────────────────────────────────────────

const propertyRefInclude = {
  property: { select: { id: true, name: true, slug: true, shortLabel: true } },
} as const

const bookingGuestInclude = {
  guestRecords: {
    select: {
      id: true, fullName: true, aadhaarNumber: true,
      gender: true, age: true, phone: true, isPrimary: true,
    },
  },
} as const

const airbnbGuestInclude = {
  guestRecords: {
    select: { id: true, fullName: true, aadhaarNumber: true, gender: true, age: true },
  },
} as const

const propertyFieldSelect = {
  id: true, slug: true, name: true, shortLabel: true, description: true,
  shortDescription: true, capacity: true, bedrooms: true, beds: true,
  bathrooms: true, sqft: true, amenities: true, accent: true, visual: true,
  location: true,
} as const

// ── BOOKINGS ───────────────────────────────────────────────────────────────

function serializeBookingDto(row: unknown, fullAadhaar: boolean): AdminBookingDto {
  const r = row as {
    id: string
    code: string
    propertyId: string
    checkIn: Date
    checkOut: Date
    guestCount: number
    primaryPhone: string
    notes: string | null
    status: BookingStatus
    createdAt: Date
    updatedAt: Date
    property: PropertyRefRow | null
    guestRecords: GuestRow[]
  }
  return {
    id: r.id,
    code: r.code,
    propertyId: r.propertyId,
    property: propertyRef(r.property),
    checkIn: toDateKey(r.checkIn),
    checkOut: toDateKey(r.checkOut),
    nights: nightsBetweenDates(r.checkIn, r.checkOut),
    guestCount: r.guestCount,
    primaryPhone: r.primaryPhone,
    notes: r.notes,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    guests: r.guestRecords.map((g) => serializeGuest(g, fullAadhaar)),
  }
}

export async function listBookings(
  client: PrismaClient,
  status?: BookingStatus
): Promise<AdminBookingDto[]> {
  const bookings = await client.booking.findMany({
    where: status !== undefined && status !== null ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    include: { ...propertyRefInclude, ...bookingGuestInclude },
  })
  return bookings.map((b) => serializeBookingDto(b, false))
}

export async function getBooking(client: PrismaClient, id: string): Promise<AdminBookingDto> {
  const booking = await client.booking.findUnique({
    where: { id },
    include: { ...propertyRefInclude, ...bookingGuestInclude },
  })
  if (!booking) throw new NotFoundError('Booking not found.')
  return serializeBookingDto(booking, true)
}

export async function updateBooking(
  client: PrismaClient,
  id: string,
  input: CreateBookingInput
): Promise<AdminBookingDto> {
  const existing = await client.booking.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw new NotFoundError('Booking not found.')

  const property = await client.property.findFirst({
    where: { OR: [{ id: input.propertyId }, { slug: input.propertyId }] },
    select: { id: true, capacity: true },
  })
  if (!property) throw new NotFoundError('Property not found.')
  if (input.guestCount > property.capacity) {
    throw new BadRequestError(`This property sleeps up to ${property.capacity} guests.`)
  }

  const conflicts = await collectConflicts(client, {
    propertyId: property.id,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    excludeBookingId: id,
  })
  if (anyConflict(conflicts)) throw new ConflictError(conflictMessage(conflicts))

  const booking = await client.$transaction(async (tx) => {
    await tx.guest.deleteMany({ where: { bookingId: id } })
    return tx.booking.update({
      where: { id },
      data: {
        propertyId: property.id,
        checkIn: toUtcDate(input.checkIn),
        checkOut: toUtcDate(input.checkOut),
        guestCount: input.guestCount,
        primaryPhone: input.primaryPhone,
        notes: input.notes || null,
        guestRecords: {
          create: input.guests.map((g: BookingGuestInput, idx: number) => ({
            fullName: g.fullName,
            aadhaarNumber: g.aadhaarNumber,
            gender: g.gender,
            age: g.age,
            phone: g.phone ?? null,
            isPrimary: idx === 0,
          })),
        },
      },
      include: { ...propertyRefInclude, ...bookingGuestInclude },
    })
  })
  return serializeBookingDto(booking , true)
}

export async function cancelBooking(client: PrismaClient, id: string): Promise<AdminBookingDto> {
  const existing = await client.booking.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw new NotFoundError('Booking not found.')

  const booking = await client.booking.update({
    where: { id },
    data: { status: BookingStatus.CANCELLED },
    include: { ...propertyRefInclude, ...bookingGuestInclude },
  })
  return serializeBookingDto(booking , true)
}

// ── AIRBNB RESERVATIONS ────────────────────────────────────────────────────

function serializeAirbnbDto(row: unknown, fullAadhaar: boolean): AdminAirbnbDto {
  const r = row as {
    id: string
    propertyId: string | null
    reservationNumber: string
    guestName: string
    primaryPhone: string
    checkIn: Date
    checkOut: Date
    guestCount: number
    status: AirbnbStatus
    notes: string | null
    createdAt: Date
    updatedAt: Date
    property: PropertyRefRow | null
    guestRecords: GuestRow[]
  }
  return {
    id: r.id,
    propertyId: r.propertyId ?? null,
    property: r.property ? propertyRef(r.property) : null,
    reservationNumber: r.reservationNumber,
    guestName: r.guestName,
    primaryPhone: r.primaryPhone,
    checkIn: toDateKey(r.checkIn),
    checkOut: toDateKey(r.checkOut),
    nights: nightsBetweenDates(r.checkIn, r.checkOut),
    guestCount: r.guestCount,
    status: r.status,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    guests: r.guestRecords.map((g) => serializeGuest(g, fullAadhaar)),
  }
}

export async function listAirbnb(
  client: PrismaClient,
  includeCancelled = false
): Promise<AdminAirbnbDto[]> {
  const reservations = await client.airbnbReservation.findMany({
    where: includeCancelled ? undefined : { status: AirbnbStatus.ACTIVE },
    orderBy: { createdAt: 'desc' },
    include: { ...propertyRefInclude, ...airbnbGuestInclude },
  })
  return reservations.map(
    (r) => serializeAirbnbDto(r , false)
  )
}

export async function getAirbnb(client: PrismaClient, id: string): Promise<AdminAirbnbDto> {
  const reservation = await client.airbnbReservation.findUnique({
    where: { id },
    include: { ...propertyRefInclude, ...airbnbGuestInclude },
  })
  if (!reservation) throw new NotFoundError('Airbnb reservation not found.')
  return serializeAirbnbDto(reservation , true)
}

export async function createAirbnb(
  client: PrismaClient,
  input: AirbnbDetailsInput & { propertyId: string | null; notes?: string }
): Promise<AdminAirbnbDto> {
  // Unassigned submissions (propertyId null) come from the public WhatsApp
  // flow: they are recorded for the admin dashboard but block no nights yet.
  const property = input.propertyId
    ? await client.property.findFirst({
        where: { OR: [{ id: input.propertyId }, { slug: input.propertyId }] },
        select: { id: true, capacity: true },
      })
    : null
  if (input.propertyId && !property) throw new NotFoundError('Property not found.')
  if (property && input.guestCount > property.capacity) {
    throw new BadRequestError(`This property sleeps up to ${property.capacity} guests.`)
  }

  if (property) {
    const conflicts = await collectConflicts(client, {
      propertyId: property.id,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
    })
    if (anyConflict(conflicts)) throw new ConflictError(conflictMessage(conflicts))
  }

  const reservation = await client.$transaction(async (tx) => {
    const created = await tx.airbnbReservation.create({
      data: {
        propertyId: property?.id ?? null,
        reservationNumber: input.reservationNumber,
        guestName: input.guestName,
        primaryPhone: input.primaryPhone,
        checkIn: toUtcDate(input.checkIn),
        checkOut: toUtcDate(input.checkOut),
        guestCount: input.guestCount,
        notes: input.notes || null,
        guestRecords: {
          create: input.guests.map((g: AirbnbGuestInput) => ({
            fullName: g.fullName,
            aadhaarNumber: g.aadhaarNumber,
            gender: g.gender,
            age: g.age,
          })),
        },
      },
      include: { ...propertyRefInclude, ...airbnbGuestInclude },
    })

    if (property) {
      await tx.blockedDate.createMany({
        data: materializeBlockedDateRows(property.id, input.checkIn, input.checkOut, created.id),
      })
    }

    return created
  })

  return serializeAirbnbDto(reservation , true)
}

export async function updateAirbnb(
  client: PrismaClient,
  id: string,
  input: AirbnbDetailsInput & { propertyId: string | null; notes?: string }
): Promise<AdminAirbnbDto> {
  const existing = await client.airbnbReservation.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!existing) throw new NotFoundError('Airbnb reservation not found.')

  // propertyId null un-assigns a submission: validations and blocked nights
  // only apply once a home is chosen. Assigning or moving a reservation to a
  // home replaces its blocked nights and re-checks availability there.
  const property = input.propertyId
    ? await client.property.findFirst({
        where: { OR: [{ id: input.propertyId }, { slug: input.propertyId }] },
        select: { id: true, capacity: true },
      })
    : null
  if (input.propertyId && !property) throw new NotFoundError('Property not found.')
  if (property && input.guestCount > property.capacity) {
    throw new BadRequestError(`This property sleeps up to ${property.capacity} guests.`)
  }

  if (property) {
    const conflicts = await collectConflicts(client, {
      propertyId: property.id,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      excludeAirbnbId: id,
    })
    if (anyConflict(conflicts)) throw new ConflictError(conflictMessage(conflicts))
  }

  const reservation = await client.$transaction(async (tx) => {
    await tx.blockedDate.deleteMany({ where: { airbnbReservationId: id } })

    const updated = await tx.airbnbReservation.update({
      where: { id },
      data: {
        propertyId: property?.id ?? null,
        reservationNumber: input.reservationNumber,
        guestName: input.guestName,
        primaryPhone: input.primaryPhone,
        checkIn: toUtcDate(input.checkIn),
        checkOut: toUtcDate(input.checkOut),
        guestCount: input.guestCount,
        notes: input.notes || null,
        guestRecords: {
          deleteMany: {},
          create: input.guests.map((g: AirbnbGuestInput) => ({
            fullName: g.fullName,
            aadhaarNumber: g.aadhaarNumber,
            gender: g.gender,
            age: g.age,
          })),
        },
      },
      include: { ...propertyRefInclude, ...airbnbGuestInclude },
    })

    if (property) {
      await tx.blockedDate.createMany({
        data: materializeBlockedDateRows(property.id, input.checkIn, input.checkOut, updated.id),
      })
    }

    return updated
  })

  return serializeAirbnbDto(reservation , true)
}

export async function cancelAirbnb(client: PrismaClient, id: string): Promise<AdminAirbnbDto> {
  const existing = await client.airbnbReservation.findUnique({
    where: { id },
    select: { id: true, status: true },
  })
  if (!existing) throw new NotFoundError('Airbnb reservation not found.')
  if (existing.status !== AirbnbStatus.ACTIVE) {
    throw new ConflictError('This reservation is already cancelled.')
  }

  const reservation = await client.$transaction(async (tx) => {
    await tx.blockedDate.deleteMany({ where: { airbnbReservationId: id } })
    return tx.airbnbReservation.update({
      where: { id },
      data: { status: AirbnbStatus.CANCELLED },
      include: { ...propertyRefInclude, ...airbnbGuestInclude },
    })
  })

  return serializeAirbnbDto(reservation , true)
}

export async function deleteAirbnb(client: PrismaClient, id: string): Promise<{ deleted: true }> {
  const existing = await client.airbnbReservation.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!existing) throw new NotFoundError('Airbnb reservation not found.')
  // Cascading delete removes the reservation's blocked-date rows.
  await client.airbnbReservation.delete({ where: { id } })
  return { deleted: true }
}

// ── DATABASE CLEANUP ────────────────────────────────────────────────────────
//
// Destructive, admin-only maintenance operations (behind auth + CSRF + an
// explicit confirmation phrase at the route layer). They delete test/direct
// bookings, Airbnb reservations and blocked dates, but NEVER touch the
// Property rows or their configuration, and never drop tables/databases.

export interface CleanupResult {
  deletedBookings: number
  deletedGuests: number
  deletedReservations: number
  deletedAirbnbGuests: number
  deletedBlockedDates: number
}

function emptyCleanupResult(): CleanupResult {
  return {
    deletedBookings: 0,
    deletedGuests: 0,
    deletedReservations: 0,
    deletedAirbnbGuests: 0,
    deletedBlockedDates: 0,
  }
}

/** Delete all direct bookings and their guest records. Properties are kept. */
export async function clearBookings(client: PrismaClient): Promise<CleanupResult> {
  return client.$transaction(async (tx) => {
    const guests = await tx.guest.deleteMany({})
    const bookings = await tx.booking.deleteMany({})
    return { ...emptyCleanupResult(), deletedBookings: bookings.count, deletedGuests: guests.count }
  })
}

/** Delete all Airbnb reservations, their guest records and their blocked nights. */
export async function clearAirbnb(client: PrismaClient): Promise<CleanupResult> {
  return client.$transaction(async (tx) => {
    const guests = await tx.airbnbGuest.deleteMany({})
    const blocked = await tx.blockedDate.deleteMany({ where: { airbnbReservationId: { not: null } } })
    const reservations = await tx.airbnbReservation.deleteMany({})
    return {
      ...emptyCleanupResult(),
      deletedReservations: reservations.count,
      deletedAirbnbGuests: guests.count,
      deletedBlockedDates: blocked.count,
    }
  })
}

/** Delete only the blocked nights generated by Airbnb reservations. */
export async function clearAirbnbBlockedDates(client: PrismaClient): Promise<CleanupResult> {
  return client.$transaction(async (tx) => {
    const blocked = await tx.blockedDate.deleteMany({ where: { airbnbReservationId: { not: null } } })
    return { ...emptyCleanupResult(), deletedBlockedDates: blocked.count }
  })
}

/** Delete every booking-related row (bookings, guests, Airbnb, all blocked dates) while preserving the properties. */
export async function clearAllBookingData(client: PrismaClient): Promise<CleanupResult> {
  return client.$transaction(async (tx) => {
    const guests = await tx.guest.deleteMany({})
    const airbnbGuests = await tx.airbnbGuest.deleteMany({})
    const blocked = await tx.blockedDate.deleteMany({})
    const bookings = await tx.booking.deleteMany({})
    const reservations = await tx.airbnbReservation.deleteMany({})
    return {
      deletedBookings: bookings.count,
      deletedGuests: guests.count,
      deletedReservations: reservations.count,
      deletedAirbnbGuests: airbnbGuests.count,
      deletedBlockedDates: blocked.count,
    }
  })
}

// ── PROPERTIES ─────────────────────────────────────────────────────────────

export async function listProperties(client: PrismaClient): Promise<AdminPropertyDto[]> {
  const properties = await client.property.findMany({
    orderBy: { name: 'asc' },
    select: propertyFieldSelect,
  })
  return properties.map((p) => ({ ...p, beds: p.beds ?? null }))
}

function serializePropertyRow(p: Record<string, unknown>): AdminPropertyDto {
  return {
    id: p.id as string,
    slug: p.slug as string,
    name: p.name as string,
    shortLabel: p.shortLabel as string,
    description: p.description as string,
    shortDescription: p.shortDescription as string,
    capacity: p.capacity as number,
    bedrooms: p.bedrooms as number,
    beds: (p.beds as number | null) ?? null,
    bathrooms: p.bathrooms as number,
    sqft: p.sqft as number,
    amenities: p.amenities as string[],
    accent: p.accent as string,
    visual: p.visual as string,
    location: (p.location as string | null) ?? null,
  }
}

export async function updateProperty(
  client: PrismaClient,
  id: string,
  input: PropertyUpdateInput
): Promise<AdminPropertyDto> {
  const property = await client.property.findUnique({ where: { id }, select: { id: true } })
  if (!property) throw new NotFoundError('Property not found.')

  const updated = await client.property.update({
    where: { id },
    data: {
      name: input.name,
      shortLabel: input.shortLabel,
      description: input.description,
      shortDescription: input.shortDescription,
      capacity: input.capacity,
      bedrooms: input.bedrooms,
      beds: input.beds,
      bathrooms: input.bathrooms,
      sqft: input.sqft,
      amenities: input.amenities,
      accent: input.accent,
      visual: input.visual,
      location: input.location,
    },
    select: propertyFieldSelect,
  })
  return serializePropertyRow(updated)
}

export async function deleteProperty(client: PrismaClient, id: string): Promise<{ deleted: true }> {
  const property = await client.property.findUnique({ where: { id }, select: { id: true } })
  if (!property) throw new NotFoundError('Property not found.')

  const [bookingCount, airbnbCount, blockedCount] = await Promise.all([
    client.booking.count({ where: { propertyId: id } }),
    client.airbnbReservation.count({ where: { propertyId: id } }),
    client.blockedDate.count({ where: { propertyId: id, airbnbReservationId: null } }),
  ])
  if (bookingCount > 0 || airbnbCount > 0 || blockedCount > 0) {
    throw new ConflictError(
      'This property still has bookings, Airbnb reservations, or manually blocked dates.'
    )
  }

  await client.property.delete({ where: { id } })
  return { deleted: true }
}