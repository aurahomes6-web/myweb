import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PrismaClient } from '../src/generated/prisma/client.js'
import { toUtcDate } from '../src/lib/dateUtils.js'
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  cancelAirbnb,
  cancelBooking,
  clearAirbnb,
  clearAirbnbBlockedDates,
  clearAllBookingData,
  clearBookings,
  createAirbnb,
  createBookingDateBlock,
  deleteAirbnb,
  deleteProperty,
  getAirbnb,
  getBooking,
  getPropertySpace,
  listAirbnb,
  listBookings,
  updateAirbnb,
  updateBooking,
  updateProperty,
  updatePropertySpace,
} from '../src/services/adminService.js'
import { collectConflicts } from '../src/services/overlapService.js'

// ── minimal in-memory Prisma stand-in ──────────────────────────────────────

function matches(where: Record<string, any> | undefined, row: Record<string, any>): boolean {
  if (!where) return true
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'OR') {
      if (!(cond as unknown[]).some((c) => matches(c as Record<string, any>, row))) return false
      continue
    }
    if (key === 'AND') {
      if (!(cond as unknown[]).every((c) => matches(c as Record<string, any>, row))) return false
      continue
    }
    const value = row[key]
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const op = cond as Record<string, any>
      if ('not' in op) {
        if (op.not === null) {
          if (value === null || value === undefined) return false
        } else if (value === op.not) return false
      }
      if ('lt' in op && !(value < op.lt)) return false
      if ('lte' in op && !(value <= op.lte)) return false
      if ('gt' in op && !(value > op.gt)) return false
      if ('gte' in op && !(value >= op.gte)) return false
      continue
    }
    if (cond === null) {
      if (value !== null && value !== undefined) return false
    } else if (value !== cond) {
      return false
    }
  }
  return true
}

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

const PROPERTY_REF_SELECT = { id: true, name: true, slug: true, shortLabel: true }

class FakeDb {
  properties: Array<Record<string, unknown>> = []
  bookings: Array<Record<string, unknown>> = []
  bookingGuests: Array<Record<string, unknown>> = []
  airbnbs: Array<Record<string, unknown>> = []
  airbnbGuests: Array<Record<string, unknown>> = []
  blockedDates: Array<Record<string, unknown>> = []
  bookingDateBlocks: Array<Record<string, unknown>> = []
  spaceAttributes: Array<Record<string, unknown>> = []
  couponUsage: any = {
    deleteMany: async ({ where }: any = {}) => ({ count: 0 }),
    create: async ({ data }: any = {}) => ({ id: 'usage-1', ...data }),
  }
  propertyImage: any = {
    count: async () => 0,
  }

  $transaction = (async (fn: (tx: never) => unknown) =>
    (fn as (tx: FakeDb) => Promise<unknown>)(this)) as unknown as PrismaClient['$transaction']

  queryRawCalls: unknown[][] = []
  $queryRaw = async (...args: unknown[]) => {
    this.queryRawCalls.push(args)
    return []
  }

  private propertyFor(propertyId: string): Record<string, unknown> | null {
    return this.properties.find((p) => p.id === propertyId) ?? null
  }

  private spaceAttrsFor(propertyId: string) {
    return this.spaceAttributes
      .filter((attr) => attr.propertyId === propertyId)
      .sort((a, b) => (a.sort as number) - (b.sort as number))
      .map((attr) => ({
        id: attr.id,
        label: attr.label,
        value: attr.value,
        icon: attr.icon ?? null,
        sort: attr.sort,
      }))
  }

  private presentProperty(p: Record<string, unknown>) {
    const ref: Record<string, unknown> = {}
    for (const key of Object.keys(PROPERTY_REF_SELECT)) ref[key] = p[key]
    return ref
  }

  private attachBooking(row: Record<string, unknown>) {
    row.property = this.propertyFor(row.propertyId as string)
      ? this.presentProperty(this.propertyFor(row.propertyId as string) as Record<string, unknown>)
      : null
    row.guestRecords = this.bookingGuests
      .filter((g) => g.bookingId === row.id)
      .map((g) => ({ ...g, isPrimary: g.isPrimary ?? false, phone: g.phone ?? null }))
    return row
  }

  private attachAirbnb(row: Record<string, unknown>) {
    row.property = this.propertyFor(row.propertyId as string)
      ? this.presentProperty(this.propertyFor(row.propertyId as string) as Record<string, unknown>)
      : null
    row.guestRecords = this.airbnbGuests
      .filter((g) => g.reservationId === row.id)
      .map((g) => ({ ...g }))
    return row
  }

  // ── property ──
  property: any = {
    findMany: async ({ orderBy, select }: any = {}) => {
      let rows = [...this.properties]
      if (orderBy && orderBy.createdAt === 'desc') rows.reverse()
      const project = (r: Record<string, unknown>) => {
        if (!select) return { ...r }
        const out: Record<string, unknown> = {}
        for (const key of Object.keys(select)) {
          out[key] = key === 'spaceAttributes' ? this.spaceAttrsFor(r.id as string) : r[key]
        }
        return out
      }
      return rows.map(project)
    },
    findFirst: async ({ where, select }: any = {}) => {
      const row = this.properties.find((r) => matches(where, r)) ?? null
      if (!row) return null
      if (!select) return row
      const out: Record<string, unknown> = {}
      for (const key of Object.keys(select)) {
        out[key] = key === 'spaceAttributes' ? this.spaceAttrsFor(row.id as string) : row[key]
      }
      return out
    },
    findUnique: async ({ where, select }: any = {}) => {
      const row = this.properties.find((r) => matches(where, r)) ?? null
      if (!row) return null
      if (!select) return row
      const out: Record<string, unknown> = {}
      for (const key of Object.keys(select)) {
        out[key] = key === 'spaceAttributes' ? this.spaceAttrsFor(row.id as string) : row[key]
      }
      return out
    },
    update: async ({ where, data, select }: any = {}) => {
      const row = this.properties.find((r) => matches(where, r))
      assert.ok(row, 'property.update: row not found')
      Object.assign(row, data)
      row.updatedAt = new Date()
      if (!select) return row
      const out: Record<string, unknown> = {}
      for (const key of Object.keys(select)) {
        out[key] = key === 'spaceAttributes' ? this.spaceAttrsFor(row.id as string) : row[key]
      }
      return out
    },
    delete: async ({ where }: any = {}) => {
      const idx = this.properties.findIndex((r) => matches(where, r))
      assert.ok(idx >= 0, 'property.delete: row not found')
      this.properties.splice(idx, 1)
    },
  }

  // ── the space attributes ──
  propertySpaceAttribute: any = {
    findMany: async ({ where, orderBy }: any = {}) => {
      let rows = this.spaceAttributes.filter((r) => matches(where, r))
      if (orderBy && orderBy.sort === 'asc') {
        rows = [...rows].sort((a, b) => (a.sort as number) - (b.sort as number))
      }
      return rows.map((r) => ({ ...r }))
    },
    deleteMany: async ({ where }: any = {}) => {
      const doomed = this.spaceAttributes.filter((r) => matches(where, r))
      this.spaceAttributes = this.spaceAttributes.filter((r) => !matches(where, r))
      return { count: doomed.length }
    },
    createMany: async ({ data }: any = {}) => {
      for (const entry of data ?? []) {
        this.spaceAttributes.push({
          id: nextId('spaceattr'),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...entry,
        })
      }
      return { count: (data ?? []).length }
    },
  }

  // ── booking ──
  booking: any = {
    findMany: async ({ where, include }: any = {}) => {
      const rows = this.bookings.filter((r) => matches(where, r))
      return include && include.guestRecords ? rows.map((r) => this.attachBooking({ ...r })) : rows.map((r) => ({ ...r }))
    },
    findFirst: async ({ where, include, select }: any = {}) => {
      const row = this.bookings.find((r) => matches(where, r)) ?? null
      if (!row) return null
      if (select) {
        const out: Record<string, unknown> = {}
        for (const key of Object.keys(select)) out[key] = row[key]
        return out
      }
      return include && include.guestRecords ? this.attachBooking({ ...row }) : { ...row }
    },
    findUnique: async ({ where, include, select }: any = {}) => {
      const row = this.bookings.find((r) => matches(where, r)) ?? null
      if (!row) return null
      if (select) {
        const out: Record<string, unknown> = {}
        for (const key of Object.keys(select)) out[key] = row[key]
        return out
      }
      return include && include.guestRecords ? this.attachBooking({ ...row }) : { ...row }
    },
    create: async ({ data, include }: any = {}) => {
      const id = (data.id as string) ?? nextId('booking')
      const guests = data.guestRecords?.create ?? []
      delete data.guestRecords
      const row: Record<string, unknown> = {
        ...data,
        id,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      this.bookings.push(row)
      guests.forEach((g: Record<string, unknown>, idx: number) => {
        this.bookingGuests.push({
          id: nextId('guest'),
          bookingId: id,
          ...g,
          isPrimary: g.isPrimary ?? idx === 0,
        })
      })
      return include && include.guestRecords ? this.attachBooking({ ...row }) : { ...row }
    },
    update: async ({ where, data, include }: any = {}) => {
      const row = this.bookings.find((r) => matches(where, r))
      assert.ok(row, 'booking.update: row not found')
      if (data.guestRecords) {
        this.bookingGuests = this.bookingGuests.filter((g) => g.bookingId !== row.id)
        const creates = data.guestRecords.create ?? []
        creates.forEach((g: Record<string, unknown>, idx: number) => {
          this.bookingGuests.push({
            id: nextId('guest'),
            bookingId: row.id,
            ...g,
            isPrimary: g.isPrimary ?? idx === 0,
          })
        })
        delete data.guestRecords
      }
      Object.assign(row, data)
      row.updatedAt = new Date()
      return include && include.guestRecords ? this.attachBooking({ ...row }) : { ...row }
    },
    count: async ({ where }: any = {}) => this.bookings.filter((r) => matches(where, r)).length,
    deleteMany: async ({ where }: any = {}) => {
      const doomed = this.bookings.filter((r) => matches(where, r))
      this.bookings = this.bookings.filter((r) => !matches(where, r))
      const ids = new Set(doomed.map((r) => r.id as string))
      this.bookingGuests = this.bookingGuests.filter((g) => !ids.has(g.bookingId as string))
      return { count: doomed.length }
    },
  }

  // ── booking guests ──
  guest: any = {
    deleteMany: async ({ where }: any = {}) => {
      const before = this.bookingGuests.length
      this.bookingGuests = this.bookingGuests.filter((g) => !matches(where, g as Record<string, unknown>))
      return { count: before - this.bookingGuests.length }
    },
  }

  // ── airbnb guests ──
  airbnbGuest: any = {
    deleteMany: async ({ where }: any = {}) => {
      const before = this.airbnbGuests.length
      this.airbnbGuests = this.airbnbGuests.filter((g) => !matches(where, g as Record<string, unknown>))
      return { count: before - this.airbnbGuests.length }
    },
  }

  // ── airbnb ──
  airbnbReservation: any = {
    findMany: async ({ where, include }: any = {}) => {
      const rows = this.airbnbs.filter((r) => matches(where, r))
      return include && include.guestRecords
        ? rows.map((r) => this.attachAirbnb({ ...r }))
        : rows.map((r) => ({ ...r }))
    },
    findFirst: async ({ where, include, select }: any = {}) => {
      const row = this.airbnbs.find((r) => matches(where, r)) ?? null
      if (!row) return null
      if (select) {
        const out: Record<string, unknown> = {}
        for (const key of Object.keys(select)) out[key] = row[key]
        return out
      }
      return include && include.guestRecords ? this.attachAirbnb({ ...row }) : { ...row }
    },
    findUnique: async ({ where, include, select }: any = {}) => {
      const row = this.airbnbs.find((r) => matches(where, r)) ?? null
      if (!row) return null
      if (select) {
        const out: Record<string, unknown> = {}
        for (const key of Object.keys(select)) out[key] = row[key]
        return out
      }
      return include && include.guestRecords ? this.attachAirbnb({ ...row }) : { ...row }
    },
    create: async ({ data, include }: any = {}) => {
      const id = nextId('airbnb')
      const guests = data.guestRecords?.create ?? []
      delete data.guestRecords
      const row: Record<string, unknown> = {
        ...data,
        id,
        status: data.status ?? 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      this.airbnbs.push(row)
      guests.forEach((g: Record<string, unknown>) => {
        this.airbnbGuests.push({ id: nextId('aguest'), reservationId: id, ...g })
      })
      return include && include.guestRecords ? this.attachAirbnb({ ...row }) : { ...row }
    },
    update: async ({ where, data, include }: any = {}) => {
      const row = this.airbnbs.find((r) => matches(where, r))
      assert.ok(row, 'airbnb.update: row not found')
      if (data.guestRecords) {
        this.airbnbGuests = this.airbnbGuests.filter((g) => g.reservationId !== row.id)
        const creates = data.guestRecords.create ?? []
        creates.forEach((g: Record<string, unknown>) => {
          this.airbnbGuests.push({ id: nextId('aguest'), reservationId: row.id, ...g })
        })
        delete data.guestRecords
      }
      Object.assign(row, data)
      row.updatedAt = new Date()
      return include && include.guestRecords ? this.attachAirbnb({ ...row }) : { ...row }
    },
    delete: async ({ where }: any = {}) => {
      const row = this.airbnbs.find((r) => matches(where, r))
      assert.ok(row, 'airbnb.delete: row not found')
      this.airbnbs = this.airbnbs.filter((r) => r.id !== (row.id as string))
      this.airbnbGuests = this.airbnbGuests.filter((g) => g.reservationId !== row.id)
      // cascade: reservation's blocked rows disappear
      this.blockedDates = this.blockedDates.filter((b) => b.airbnbReservationId !== row.id)
    },
    deleteMany: async ({ where }: any = {}) => {
      const doomed = this.airbnbs.filter((r) => matches(where, r))
      this.airbnbs = this.airbnbs.filter((r) => !matches(where, r))
      const ids = new Set(doomed.map((r) => r.id as string))
      this.airbnbGuests = this.airbnbGuests.filter((g) => !ids.has(g.reservationId as string))
      this.blockedDates = this.blockedDates.filter((b) => !ids.has(b.airbnbReservationId as string))
      return { count: doomed.length }
    },
    count: async ({ where }: any = {}) => this.airbnbs.filter((r) => matches(where, r)).length,
  }

  bookingDateBlock: any = {
    findMany: async ({ where }: any = {}) =>
      this.bookingDateBlocks.filter((r) => matches(where, r)).map((r) => ({ ...r })),
    findFirst: async ({ where }: any = {}) => {
      const row = this.bookingDateBlocks.find((r) => matches(where, r)) ?? null
      return row ? { ...row } : null
    },
    create: async ({ data }: any = {}) => {
      const row = {
        id: nextId('booking-date-block'),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      }
      this.bookingDateBlocks.push(row)
      return { ...row }
    },
    deleteMany: async ({ where }: any = {}) => {
      const doomed = this.bookingDateBlocks.filter((r) => matches(where, r))
      this.bookingDateBlocks = this.bookingDateBlocks.filter((r) => !matches(where, r))
      return { count: doomed.length }
    },
  }

  // ── blocked dates ──
  blockedDate: any = {
    findFirst: async ({ where }: any = {}) => {
      const row = this.blockedDates.find((r) => matches(where, r)) ?? null
      return row ? { ...row } : null
    },
    createMany: async ({ data }: any = {}) => {
      for (const d of data ?? []) {
        this.blockedDates.push({ ...d })
      }
    },
    deleteMany: async ({ where }: any = {}) => {
      const before = this.blockedDates.length
      this.blockedDates = this.blockedDates.filter((r) => !matches(where, r))
      return { count: before - this.blockedDates.length }
    },
    count: async ({ where }: any = {}) => this.blockedDates.filter((r) => matches(where, r)).length,
  }
}

function makeDb(): FakeDb {
  return new FakeDb()
}

function asClient(fake: FakeDb): PrismaClient {
  return fake as unknown as PrismaClient
}

// ── fixtures ───────────────────────────────────────────────────────────────

function seedProperty(fake: FakeDb, overrides: Record<string, unknown> = {}) {
  const row = {
    id: overrides.id ?? 'prop-1',
    slug: overrides.slug ?? 'aura-cozy-penthouse-1',
    name: overrides.name ?? 'Aura Cozy Penthouse 1',
    shortLabel: 'Cozy 1BHK in the clouds',
    description: 'A quiet stay.',
    shortDescription: 'Cosy penthouse.',
    capacity: 3,
    minGuests: 1,
    isActive: true,
    bedrooms: 1,
    beds: 2,
    bathrooms: 1,
    sqft: 450,
    amenities: ['Balcony', 'Wi-Fi'],
    accent: '#8B5CF6',
    visual: 'purple',
    location: 'Whitefield',
    pricePerNightPaise: 280000,
    discountedPricePerNightPaise: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
  fake.properties.push(row)
  return row
}

interface BookingSeedOverrides {
  id?: string
  code?: string
  propertyId?: string
  checkIn?: Date
  checkOut?: Date
  guestCount?: number
  primaryPhone?: string
  notes?: string | null
  status?: string
  createdAt?: Date
  guests?: Array<Record<string, unknown>>
}

function seedBooking(fake: FakeDb, overrides: BookingSeedOverrides = {}) {
  const id = nextId('booking')
  const row = {
    id: overrides.id ?? id,
    code: overrides.code ?? `AURA${id.slice(-10).toUpperCase()}`,
    propertyId: overrides.propertyId ?? 'prop-1',
    checkIn: overrides.checkIn ?? toUtcDate('2026-10-20'),
    checkOut: overrides.checkOut ?? toUtcDate('2026-10-22'),
    guestCount: overrides.guestCount ?? 2,
    primaryPhone: overrides.primaryPhone ?? '9812345678',
    notes: overrides.notes ?? null,
    status: overrides.status ?? 'CONFIRMED',
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: new Date(),
  }
  fake.bookings.push(row)
  const guests = overrides.guests ?? [
    { fullName: 'Asha Rao', aadhaarNumber: '123456789012', gender: 'FEMALE', age: 34, isPrimary: true },
    { fullName: 'Vikram Rao', aadhaarNumber: '987654321098', gender: 'MALE', age: 36, isPrimary: false },
  ]
  for (const g of guests) fake.bookingGuests.push({ id: nextId('guest'), bookingId: row.id, ...g })
  return row
}

interface AirbnbBodyOverrides {
  propertyId?: string | null
  reservationNumber?: string
  guestName?: string
  primaryPhone?: string
  checkIn?: string
  checkOut?: string
  guestCount?: number
  notes?: string
  guests?: Array<{ fullName: string; aadhaarNumber: string; gender: 'MALE' | 'FEMALE' | 'OTHER'; age: number }>
}

function airbnbBody(overrides: AirbnbBodyOverrides = {}) {
  return {
    propertyId: overrides.propertyId !== undefined ? overrides.propertyId : 'prop-1',
    reservationNumber: overrides.reservationNumber ?? 'HMB1234',
    guestName: overrides.guestName ?? 'Jordan Lee',
    primaryPhone: overrides.primaryPhone ?? '9812345678',
    checkIn: overrides.checkIn ?? '2026-10-01',
    checkOut: overrides.checkOut ?? '2026-10-03',
    guestCount: overrides.guestCount ?? 2,
    notes: overrides.notes ?? 'Birthday stay',
    guests: overrides.guests ?? [
      { fullName: 'Jordan Lee', aadhaarNumber: '123456789012', gender: 'MALE' as const, age: 28 },
      { fullName: 'Maya Lee', aadhaarNumber: '987654321098', gender: 'FEMALE' as const, age: 26 },
    ],
  }
}

// ── tests ──────────────────────────────────────────────────────────────────

test('createAirbnb blocks availability by materialising blocked dates', async () => {
  const fake = makeDb()
  seedProperty(fake)
  const created = await createAirbnb(asClient(fake), airbnbBody())

  assert.equal(created.status, 'ACTIVE')
  assert.equal(created.property?.slug, 'aura-cozy-penthouse-1')
  assert.deepStrictEqual(created.guests.map((g) => g.fullName).sort(), ['Jordan Lee', 'Maya Lee'])

  const keys = fake.blockedDates.map((b) => (b.date as Date).toISOString().slice(0, 10)).sort()
  assert.deepStrictEqual(keys, ['2026-10-01', '2026-10-02'])

  for (const blocked of fake.blockedDates) {
    assert.equal(blocked.airbnbReservationId, created.id)
    assert.equal(blocked.reason, 'Airbnb reservation')
  }

  const conflict = await collectConflicts(asClient(fake), {
    propertyId: 'prop-1',
    checkIn: '2026-10-01',
    checkOut: '2026-10-03',
  })
  assert.deepStrictEqual(conflict, { booking: false, airbnb: true, manual: false })
})

test('createAirbnb rejects an overlapping direct booking', async () => {
  const fake = makeDb()
  seedProperty(fake)
  seedBooking(fake, { checkIn: toUtcDate('2026-10-01'), checkOut: toUtcDate('2026-10-03') })
  await assert.rejects(
    () => createAirbnb(asClient(fake), airbnbBody()),
    (err: unknown) => err instanceof ConflictError
  )
})

test('createAirbnb rejects an overlapping active Airbnb reservation', async () => {
  const fake = makeDb()
  seedProperty(fake)
  await createAirbnb(asClient(fake), airbnbBody({ checkIn: '2026-10-01', checkOut: '2026-10-03' }))
  await assert.rejects(
    () => createAirbnb(asClient(fake), airbnbBody({ reservationNumber: 'XYZ9999', checkIn: '2026-10-02', checkOut: '2026-10-04' })),
    (err: unknown) => err instanceof ConflictError
  )
})

test('createAirbnb accepts a non-overlapping window', async () => {
  const fake = makeDb()
  seedProperty(fake)
  await createAirbnb(asClient(fake), airbnbBody())
  const second = await createAirbnb(asClient(fake), airbnbBody({
    reservationNumber: 'XYZ9999',
    checkIn: '2026-10-05',
    checkOut: '2026-10-07',
  }))
  assert.equal(second.reservationNumber, 'XYZ9999')
})

test('createAirbnb accepts duplicate or empty confirmation numbers', async () => {
  const fake = makeDb()
  seedProperty(fake)
  // The reservation number is optional: two reservations may share an empty
  // number...
  await createAirbnb(asClient(fake), airbnbBody({ reservationNumber: '', checkIn: '2026-10-01', checkOut: '2026-10-03' }))
  const second = await createAirbnb(asClient(fake), airbnbBody({ reservationNumber: '', checkIn: '2026-10-05', checkOut: '2026-10-07' }))
  assert.equal(second.reservationNumber, '')
  // ...and non-empty numbers no longer have to be unique either.
  await createAirbnb(asClient(fake), airbnbBody({ reservationNumber: 'HMB9999', checkIn: '2026-10-09', checkOut: '2026-10-11' }))
  const dup = await createAirbnb(asClient(fake), airbnbBody({ reservationNumber: 'HMB9999', checkIn: '2026-10-13', checkOut: '2026-10-15' }))
  assert.equal(dup.reservationNumber, 'HMB9999')
  assert.equal((await listAirbnb(asClient(fake))).length, 4)
})

test('createAirbnb rejects more guests than capacity', async () => {
  const fake = makeDb()
  seedProperty(fake)
  const guests = Array.from({ length: 4 }, (_, i) => ({
    fullName: `Guest ${i + 1}`,
    aadhaarNumber: `00000000000${i + 1}`,
    gender: 'OTHER' as const,
    age: 30,
  }))
  await assert.rejects(
    () => createAirbnb(asClient(fake), airbnbBody({ guestCount: 4, guests })),
    (err: unknown) => err instanceof BadRequestError
  )
})

test('createAirbnb rejects an unknown property', async () => {
  const fake = makeDb()
  seedProperty(fake)
  await assert.rejects(
    () => createAirbnb(asClient(fake), airbnbBody({ propertyId: 'nope' })),
    (err: unknown) => err instanceof NotFoundError
  )
})

test('updateAirbnb re-materialises blocked dates after an edit', async () => {
  const fake = makeDb()
  seedProperty(fake)
  const created = await createAirbnb(asClient(fake), airbnbBody())
  const updated = await updateAirbnb(asClient(fake), created.id, airbnbBody({
    checkIn: '2026-10-08',
    checkOut: '2026-10-12',
  }))

  assert.equal(updated.checkIn, '2026-10-08')
  const keys = fake.blockedDates.map((b) => (b.date as Date).toISOString().slice(0, 10)).sort()
  assert.deepStrictEqual(keys, ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'])
  assert.ok(fake.blockedDates.every((b) => b.airbnbReservationId === created.id))
})

test('updateAirbnb rejects a window that now clashes with a booking', async () => {
  const fake = makeDb()
  seedProperty(fake)
  const created = await createAirbnb(asClient(fake), airbnbBody({ checkIn: '2026-10-01', checkOut: '2026-10-03' }))
  seedBooking(fake, { checkIn: toUtcDate('2026-10-10'), checkOut: toUtcDate('2026-10-12') })
  await assert.rejects(
    () => updateAirbnb(asClient(fake), created.id, airbnbBody({ checkIn: '2026-10-10', checkOut: '2026-10-12' })),
    (err: unknown) => err instanceof ConflictError
  )
})

test('cancelAirbnb releases its dates and marks the reservation cancelled', async () => {
  const fake = makeDb()
  seedProperty(fake)
  const created = await createAirbnb(asClient(fake), airbnbBody())
  assert.equal(fake.blockedDates.length, 2)

  const cancelled = await cancelAirbnb(asClient(fake), created.id)
  assert.equal(cancelled.status, 'CANCELLED')
  assert.equal(fake.blockedDates.length, 0)

  const conflict = await collectConflicts(asClient(fake), {
    propertyId: 'prop-1',
    checkIn: '2026-10-01',
    checkOut: '2026-10-03',
  })
  assert.deepStrictEqual(conflict, { booking: false, airbnb: false, manual: false })
})

test('cancelling an already-cancelled reservation is rejected', async () => {
  const fake = makeDb()
  seedProperty(fake)
  const created = await createAirbnb(asClient(fake), airbnbBody())
  await cancelAirbnb(asClient(fake), created.id)
  await assert.rejects(
    () => cancelAirbnb(asClient(fake), created.id),
    (err: unknown) => err instanceof ConflictError
  )
})

test('deleteAirbnb removes the reservation and its blocked dates', async () => {
  const fake = makeDb()
  seedProperty(fake)
  const created = await createAirbnb(asClient(fake), airbnbBody())
  const result = await deleteAirbnb(asClient(fake), created.id)

  assert.deepStrictEqual(result, { deleted: true })
  assert.equal(fake.airbnbs.length, 0)
  assert.equal(fake.blockedDates.length, 0)
  assert.equal((await listAirbnb(asClient(fake))).length, 0)
})

test('listAirbnb hides cancelled reservations unless requested', async () => {
  const fake = makeDb()
  seedProperty(fake)
  const created = await createAirbnb(asClient(fake), airbnbBody())
  await cancelAirbnb(asClient(fake), created.id)

  assert.equal((await listAirbnb(asClient(fake))).length, 0)
  assert.equal((await listAirbnb(asClient(fake), true)).length, 1)
})

test('cancelled reservations no longer block availability for direct bookings', async () => {
  const fake = makeDb()
  seedProperty(fake)
  const created = await createAirbnb(asClient(fake), airbnbBody())
  await cancelAirbnb(asClient(fake), created.id)
  const conflict = await collectConflicts(asClient(fake), {
    propertyId: 'prop-1',
    checkIn: '2026-10-01',
    checkOut: '2026-10-03',
  })
  assert.deepStrictEqual(conflict, { booking: false, airbnb: false, manual: false })
})

test('a public submission persists as unassigned and blocks no nights', async () => {
  const fake = makeDb()
  seedProperty(fake)
  seedProperty(fake, { id: 'prop-2', slug: 'aura-lakehouse-2', name: 'Aura Lakehouse 2' })

  const created = await createAirbnb(asClient(fake), airbnbBody({ propertyId: null, reservationNumber: '' }))

  assert.equal(created.propertyId, null)
  assert.equal(created.property, null)
  assert.equal(created.status, 'ACTIVE')

  // No blocked nights are materialised for an unassigned submission.
  assert.equal(fake.blockedDates.length, 0)

  // It surfaces in the admin list and can be read back in full.
  const listed = await listAirbnb(asClient(fake))
  assert.equal(listed.length, 1)
  assert.equal(listed[0].id, created.id)
  const detail = await getAirbnb(asClient(fake), created.id)
  assert.equal(detail.id, created.id)
  assert.equal(detail.guests[0].fullName, 'Jordan Lee')

  // Unassigned reservations never block availability for any property.
  for (const propertyId of ['prop-1', 'prop-2']) {
    const conflict = await collectConflicts(asClient(fake), {
      propertyId,
      checkIn: '2026-10-01',
      checkOut: '2026-10-03',
    })
    assert.deepStrictEqual(conflict, { booking: false, airbnb: false, manual: false })
  }
})

test('multiple unassigned submissions each appear separately in the list', async () => {
  const fake = makeDb()
  seedProperty(fake)
  const first = await createAirbnb(asClient(fake), airbnbBody({ propertyId: null, reservationNumber: '' }))
  const second = await createAirbnb(asClient(fake), airbnbBody({ propertyId: null, reservationNumber: '', checkIn: '2026-10-05', checkOut: '2026-10-07' }))

  const listed = await listAirbnb(asClient(fake))
  assert.equal(listed.length, 2)
  assert.ok(listed.some((r) => r.id === first.id))
  assert.ok(listed.some((r) => r.id === second.id))
  assert.ok(listed.every((r) => r.propertyId === null && r.property === null))
})

test('updateAirbnb assigns a property and materialises blocked nights for an unassigned submission', async () => {
  const fake = makeDb()
  seedProperty(fake)
  const created = await createAirbnb(asClient(fake), airbnbBody({ propertyId: null }))

  const updated = await updateAirbnb(asClient(fake), created.id, airbnbBody({ propertyId: 'prop-1' }))

  assert.equal(updated.propertyId, 'prop-1')
  assert.equal(updated.property?.slug, 'aura-cozy-penthouse-1')
  const keys = fake.blockedDates.map((b) => (b.date as Date).toISOString().slice(0, 10)).sort()
  assert.deepStrictEqual(keys, ['2026-10-01', '2026-10-02'])
  assert.ok(fake.blockedDates.every((b) => b.airbnbReservationId === created.id))

  const conflict = await collectConflicts(asClient(fake), {
    propertyId: 'prop-1',
    checkIn: '2026-10-01',
    checkOut: '2026-10-03',
  })
  assert.deepStrictEqual(conflict, { booking: false, airbnb: true, manual: false })
})

test('updateAirbnb rejects assigning a property whose window clashes with a booking', async () => {
  const fake = makeDb()
  seedProperty(fake)
  const created = await createAirbnb(asClient(fake), airbnbBody({ propertyId: null }))
  seedBooking(fake, { checkIn: toUtcDate('2026-10-01'), checkOut: toUtcDate('2026-10-03') })

  await assert.rejects(
    () => updateAirbnb(asClient(fake), created.id, airbnbBody({ propertyId: 'prop-1' })),
    (err: unknown) => err instanceof ConflictError
  )
})

test('updateAirbnb reassigning another property moves its blocked nights', async () => {
  const fake = makeDb()
  seedProperty(fake)
  seedProperty(fake, { id: 'prop-2', slug: 'aura-lakehouse-2', name: 'Aura Lakehouse 2', capacity: 4 })
  const created = await createAirbnb(asClient(fake), airbnbBody()) // prop-1 by default
  assert.equal(fake.blockedDates.length, 2)

  const updated = await updateAirbnb(asClient(fake), created.id, airbnbBody({ propertyId: 'prop-2' }))

  assert.equal(updated.propertyId, 'prop-2')
  assert.equal(fake.blockedDates.length, 2)
  assert.ok(fake.blockedDates.every((b) => b.propertyId === 'prop-2'))
  assert.ok(fake.blockedDates.every((b) => b.airbnbReservationId === created.id))

  const old = await collectConflicts(asClient(fake), {
    propertyId: 'prop-1',
    checkIn: '2026-10-01',
    checkOut: '2026-10-03',
  })
  assert.deepStrictEqual(old, { booking: false, airbnb: false, manual: false })
})

test('updateAirbnb unassigning a reservation releases its blocked nights', async () => {
  const fake = makeDb()
  seedProperty(fake)
  const created = await createAirbnb(asClient(fake), airbnbBody())
  assert.equal(fake.blockedDates.length, 2)

  const updated = await updateAirbnb(asClient(fake), created.id, airbnbBody({ propertyId: null }))

  assert.equal(updated.propertyId, null)
  assert.equal(updated.property, null)
  assert.equal(fake.blockedDates.length, 0)

  const conflict = await collectConflicts(asClient(fake), {
    propertyId: 'prop-1',
    checkIn: '2026-10-01',
    checkOut: '2026-10-03',
  })
  assert.deepStrictEqual(conflict, { booking: false, airbnb: false, manual: false })
})

test('updateAirbnb lets the reservation number be cleared on an assigned record', async () => {
  const fake = makeDb()
  seedProperty(fake)
  const created = await createAirbnb(asClient(fake), airbnbBody())
  const updated = await updateAirbnb(asClient(fake), created.id, airbnbBody({ propertyId: 'prop-1', reservationNumber: '' }))
  assert.equal(updated.reservationNumber, '')
  assert.equal(fake.blockedDates.length, 2)
})

test('admin can update a normal booking when dates are available', async () => {
  const fake = makeDb()
  seedProperty(fake)
  const booking = seedBooking(fake)
  const guests = [
    { fullName: 'Asha Rao', aadhaarNumber: '123456789012', gender: 'FEMALE' as const, age: 34, phone: '9812345678' },
    { fullName: 'New Guest', aadhaarNumber: '555566667777', gender: 'MALE' as const, age: 40, phone: '9812345678' },
  ]
  const updated = await updateBooking(asClient(fake), booking.id, {
    propertyId: 'prop-1',
    checkIn: '2026-10-20',
    checkOut: '2026-10-24',
    guestCount: 2,
    primaryPhone: '9812345678',
    guests,
  })

  assert.equal(updated.checkOut, '2026-10-24')
  assert.equal(fake.bookingGuests.filter((g) => g.bookingId === booking.id).length, 2)
  const names = fake.bookingGuests.filter((g) => g.bookingId === booking.id).map((g) => g.fullName).sort()
  assert.deepStrictEqual(names, ['Asha Rao', 'New Guest'])
})

test('admin cannot update a normal booking into a manually blocked range', async () => {
  const fake = makeDb()
  seedProperty(fake)
  const booking = seedBooking(fake)
  await createBookingDateBlock(asClient(fake), 'prop-1', {
    startDate: '2026-10-20',
    endDate: '2026-10-22',
  })

  await assert.rejects(
    () => updateBooking(asClient(fake), booking.id, {
      propertyId: 'prop-1',
      checkIn: '2026-10-21',
      checkOut: '2026-10-23',
      guestCount: 2,
      primaryPhone: '9812345678',
      guests: [{ fullName: 'Asha', aadhaarNumber: '123456789012', gender: 'FEMALE' as const, age: 34 }],
    }),
    (err: unknown) => err instanceof ConflictError
  )
})

test('admin cannot update a normal booking onto an inactive property', async () => {
  const fake = makeDb()
  seedProperty(fake, { isActive: false })
  const booking = seedBooking(fake)

  await assert.rejects(
    () => updateBooking(asClient(fake), booking.id, {
      propertyId: 'prop-1',
      checkIn: '2026-10-20',
      checkOut: '2026-10-22',
      guestCount: 2,
      primaryPhone: '9812345678',
      guests: [{ fullName: 'Asha', aadhaarNumber: '123456789012', gender: 'FEMALE' as const, age: 34 }],
    }),
    (err: unknown) => err instanceof BadRequestError
  )
})

test('Airbnb reservations remain unaffected by manual BookingDateBlock rows', async () => {
  const fake = makeDb()
  seedProperty(fake)
  await createBookingDateBlock(asClient(fake), 'prop-1', {
    startDate: '2026-10-01',
    endDate: '2026-10-03',
  })

  const reservation = await createAirbnb(asClient(fake), airbnbBody())
  assert.equal(reservation.status, 'ACTIVE')
  assert.equal(fake.blockedDates.length, 2)
})

test('booking date block creation acquires the property row lock', async () => {
  const fake = makeDb()
  seedProperty(fake)

  await createBookingDateBlock(asClient(fake), 'prop-1', {
    startDate: '2026-10-01',
    endDate: '2026-10-03',
  })

  assert.equal(fake.queryRawCalls.length, 1)
})

test('updateBooking snapshots the discounted effective stay total', async () => {
  const fake = makeDb()
  seedProperty(fake, { discountedPricePerNightPaise: 240000 })
  const booking = seedBooking(fake)

  await updateBooking(asClient(fake), booking.id, {
    propertyId: 'prop-1',
    checkIn: '2026-10-20',
    checkOut: '2026-10-24',
    guestCount: 2,
    primaryPhone: '9812345678',
    guests: [
      { fullName: 'Asha', aadhaarNumber: '123456789012', gender: 'FEMALE', age: 34 },
    ],
  })

  const stored = fake.bookings.find((row) => row.id === booking.id)
  assert.equal(stored?.originalPricePaise, 1120000)
  assert.equal(stored?.discountPaise, 160000)
  assert.equal(stored?.finalPricePaise, 960000)
})

test('updateBooking rejects a window occupied by an Airbnb reservation', async () => {
  const fake = makeDb()
  seedProperty(fake)
  await createAirbnb(asClient(fake), airbnbBody())
  const booking = seedBooking(fake, { checkIn: toUtcDate('2026-09-01'), checkOut: toUtcDate('2026-09-03') })
  await assert.rejects(
    () => updateBooking(asClient(fake), booking.id, {
      propertyId: 'prop-1',
      checkIn: '2026-10-01',
      checkOut: '2026-10-03',
      guestCount: 2,
      primaryPhone: '9812345678',
      guests: [
        { fullName: 'Asha', aadhaarNumber: '123456789012', gender: 'FEMALE', age: 34, phone: '9812345678' },
      ],
    }),
    (err: unknown) => err instanceof ConflictError
  )
})

test('cancelBooking flips status to CANCELLED', async () => {
  const fake = makeDb()
  seedProperty(fake)
  const booking = seedBooking(fake)
  const cancelled = await cancelBooking(asClient(fake), booking.id)
  assert.equal(cancelled.status, 'CANCELLED')
})

test('listBookings masks Aadhaar while detail returns it in full', async () => {
  const fake = makeDb()
  seedProperty(fake)
  seedBooking(fake)

  const list = await listBookings(asClient(fake))
  assert.equal(list.length, 1)
  assert.equal(list[0].guests[0].aadhaarNumber, '********9012')
  assert.equal(list[0].guests[0].aadhaarNumberMasked, '********9012')

  const detail = await getBooking(asClient(fake), list[0].id)
  assert.equal(detail.guests[0].aadhaarNumber, '123456789012')
})

test('listAirbnb masks Aadhaar while detail returns it in full', async () => {
  const fake = makeDb()
  seedProperty(fake)
  const created = await createAirbnb(asClient(fake), airbnbBody())

  const list = await listAirbnb(asClient(fake))
  assert.equal(list[0].guests[0].aadhaarNumber, '********9012')

  const detail = await getAirbnb(asClient(fake), created.id)
  assert.equal(detail.guests[0].aadhaarNumber, '123456789012')
  assert.equal(detail.guests[0].fullName, 'Jordan Lee')
})

test('updateProperty persists editable fields including facilities', async () => {
  const fake = makeDb()
  seedProperty(fake)

  const updated = await updateProperty(asClient(fake), 'prop-1', {
    name: 'Aura Sky Penthouse',
    shortLabel: 'Renovated',
    description: 'Brand new description.',
    shortDescription: 'Fresh.',
    capacity: 4,
    bedrooms: 2,
    beds: 3,
    bathrooms: 2,
    sqft: 800,
    amenities: ['Ocean view', 'Jacuzzi'],
    accent: '#06B6D4',
    visual: 'cyan',
    location: 'Koramangala',
    pricePerNightPaise: 280000,
    discountedPricePerNightPaise: 240000,
  })

  assert.equal(updated.name, 'Aura Sky Penthouse')
  assert.equal(updated.beds, 3)
  assert.deepStrictEqual(updated.amenities, ['Ocean view', 'Jacuzzi'])
  assert.equal(updated.capacity, 4)
  assert.equal(updated.pricePerNightPaise, 280000)
  assert.equal(updated.discountedPricePerNightPaise, 240000)
})

test('deleteProperty is refused while bookings or reservations exist', async () => {
  const fake = makeDb()
  seedProperty(fake)
  seedBooking(fake)
  await assert.rejects(
    () => deleteProperty(asClient(fake), 'prop-1'),
    (err: unknown) => err instanceof ConflictError
  )

  const fake2 = makeDb()
  seedProperty(fake2)
  await createAirbnb(asClient(fake2), airbnbBody())
  await assert.rejects(
    () => deleteProperty(asClient(fake2), 'prop-1'),
    (err: unknown) => err instanceof ConflictError
  )
})

test('deleteProperty succeeds only for an empty property', async () => {
  const fake = makeDb()
  seedProperty(fake)
  const result = await deleteProperty(asClient(fake), 'prop-1')
  assert.deepStrictEqual(result, { deleted: true })
  assert.equal(fake.properties.length, 0)
})

test('deleteProperty rejects unknown id', async () => {
  const fake = makeDb()
  seedProperty(fake)
  await assert.rejects(
    () => deleteProperty(asClient(fake), 'missing'),
    (err: unknown) => err instanceof NotFoundError
  )
})

// ── THE SPACE ───────────────────────────────────────────────────────────────

test('updatePropertySpace saves a capacity range and attributes for one property only', async () => {
  const fake = makeDb()
  seedProperty(fake)
  seedProperty(fake, { id: 'prop-2', slug: 'aura-lakehouse-2', name: 'Aura Lakehouse 2', capacity: 4 })

  const space = await updatePropertySpace(asClient(fake), 'prop-1', {
    minGuests: 2,
    maxGuests: 6,
    attributes: [
      { label: 'Kitchen', value: 'Fully equipped', icon: 'kitchen' },
      { label: 'Balcony', value: '150 sqft', icon: 'terrace' },
    ],
  })

  assert.equal(space.minGuests, 2)
  assert.equal(space.maxGuests, 6)
  assert.deepStrictEqual(
    space.attributes.map((a) => a.label),
    ['Kitchen', 'Balcony']
  )

  // capacity stays the authoritative max so booking validation is unchanged.
  const prop1 = fake.properties.find((p) => p.id === 'prop-1')
  assert.equal(prop1?.capacity, 6)
  assert.equal(prop1?.minGuests, 2)

  // Penthouse 2 must be untouched.
  const other = await getPropertySpace(asClient(fake), 'prop-2')
  assert.equal(other.minGuests, 1)
  assert.equal(other.maxGuests, 4)
  assert.deepStrictEqual(other.attributes, [])
  assert.equal(fake.properties.find((p) => p.id === 'prop-2')?.capacity, 4)
})

test('updatePropertySpace supports add, edit, delete and reorder in one save', async () => {
  const fake = makeDb()
  seedProperty(fake)

  await updatePropertySpace(asClient(fake), 'prop-1', {
    minGuests: 1,
    maxGuests: 4,
    attributes: [
      { label: 'Bedrooms', value: '1', icon: 'bed' },
      { label: 'Bathrooms', value: '1', icon: 'bath' },
      { label: 'Interior', value: '600 sqft', icon: 'interior' },
    ],
  })

  const reordered = await updatePropertySpace(asClient(fake), 'prop-1', {
    minGuests: 1,
    maxGuests: 4,
    attributes: [
      { label: 'Interior', value: '600 sqft', icon: 'interior' },
      { label: 'Bathrooms', value: '2', icon: 'bath' },
    ],
  })

  // Interior moved first, Bathrooms edited 1 → 2, Bedrooms deleted.
  assert.deepStrictEqual(
    reordered.attributes.map((a) => `${a.label}=${a.value}`),
    ['Interior=600 sqft', 'Bathrooms=2']
  )
  // sort values are dense and ordered so the public page keeps the same order.
  assert.deepStrictEqual(reordered.attributes.map((a) => a.sort), [0, 1])
})

test('updatePropertySpace can clear every attribute but keeps the capacity range', async () => {
  const fake = makeDb()
  seedProperty(fake)
  await updatePropertySpace(asClient(fake), 'prop-1', {
    minGuests: 2,
    maxGuests: 8,
    attributes: [{ label: 'Parking', value: '1 vehicle', icon: 'parking' }],
  })

  const cleared = await updatePropertySpace(asClient(fake), 'prop-1', {
    minGuests: 2,
    maxGuests: 8,
    attributes: [],
  })

  assert.deepStrictEqual(cleared.attributes, [])
  assert.equal(cleared.minGuests, 2)
  assert.equal(cleared.maxGuests, 8)
  assert.equal(fake.spaceAttributes.length, 0)
})

test('getPropertySpace returns per-attribute ids and preserves saved order', async () => {
  const fake = makeDb()
  seedProperty(fake)
  await updatePropertySpace(asClient(fake), 'prop-1', {
    minGuests: 1,
    maxGuests: 4,
    attributes: [
      { label: 'Floor', value: '3rd floor', icon: null },
      { label: 'Parking', value: '1 vehicle', icon: 'parking' },
    ],
  })

  const space = await getPropertySpace(asClient(fake), 'prop-1')
  assert.equal(space.attributes.length, 2)
  assert.deepStrictEqual(space.attributes.map((a) => a.label), ['Floor', 'Parking'])
  assert.equal(space.attributes[0].icon, null)
  assert.equal(space.attributes[1].icon, 'parking')
  assert.ok(space.attributes.every((a) => a.id))
})

test('getPropertySpace and updatePropertySpace reject an unknown property', async () => {
  const fake = makeDb()
  seedProperty(fake)
  await assert.rejects(
    () => getPropertySpace(asClient(fake), 'missing'),
    (err: unknown) => err instanceof NotFoundError
  )
  await assert.rejects(
    () => updatePropertySpace(asClient(fake), 'missing', { minGuests: 1, maxGuests: 2, attributes: [] }),
    (err: unknown) => err instanceof NotFoundError
  )
})

// ── database cleanup ────────────────────────────────────────────────────────

test('clearBookings deletes bookings and guests but preserves properties', async () => {
  const fake = makeDb()
  seedProperty(fake)
  seedBooking(fake)
  seedBooking(fake, { checkIn: toUtcDate('2026-11-01'), checkOut: toUtcDate('2026-11-03') })

  const result = await clearBookings(asClient(fake))

  assert.equal(result.deletedBookings, 2)
  assert.equal(result.deletedGuests, 4)
  assert.equal(fake.bookings.length, 0)
  assert.equal(fake.bookingGuests.length, 0)
  assert.equal(fake.properties.length, 1)
})

test('clearAirbnb deletes reservations and their blocked nights but keeps manual blocked dates', async () => {
  const fake = makeDb()
  seedProperty(fake)
  await createAirbnb(asClient(fake), airbnbBody())
  await createAirbnb(asClient(fake), airbnbBody({ propertyId: null, reservationNumber: '' }))
  fake.blockedDates.push({
    id: 'manual-1',
    propertyId: 'prop-1',
    date: toUtcDate('2026-12-01'),
    reason: 'Owner blocked',
    airbnbReservationId: null,
  })

  const result = await clearAirbnb(asClient(fake))

  assert.equal(result.deletedReservations, 2)
  assert.equal(result.deletedAirbnbGuests, 4)
  assert.equal(result.deletedBlockedDates, 2)
  assert.equal(fake.airbnbs.length, 0)
  assert.equal(fake.airbnbGuests.length, 0)
  assert.equal(fake.blockedDates.length, 1) // manual night survives
  assert.equal(fake.properties.length, 1)
})

test('clearAirbnbBlockedDates removes only Airbnb-generated nights', async () => {
  const fake = makeDb()
  seedProperty(fake)
  await createAirbnb(asClient(fake), airbnbBody())
  fake.blockedDates.push({
    id: 'manual-1',
    propertyId: 'prop-1',
    date: toUtcDate('2026-12-01'),
    reason: 'Owner blocked',
    airbnbReservationId: null,
  })

  const result = await clearAirbnbBlockedDates(asClient(fake))

  assert.equal(result.deletedBlockedDates, 2)
  assert.equal(fake.blockedDates.length, 1)
  assert.equal(fake.airbnbs.length, 1) // reservations themselves survive
})

test('clearAllBookingData deletes everything booking-related while preserving property configuration', async () => {
  const fake = makeDb()
  seedProperty(fake)
  seedBooking(fake)
  await createAirbnb(asClient(fake), airbnbBody())
  fake.blockedDates.push({
    id: 'manual-1',
    propertyId: 'prop-1',
    date: toUtcDate('2026-12-01'),
    reason: 'Owner blocked',
    airbnbReservationId: null,
  })

  const result = await clearAllBookingData(asClient(fake))

  assert.equal(result.deletedBookings, 1)
  assert.equal(result.deletedGuests, 2)
  assert.equal(result.deletedReservations, 1)
  assert.equal(result.deletedAirbnbGuests, 2)
  assert.equal(result.deletedBlockedDates, 3) // airbnb nights + manual night
  assert.equal(fake.bookings.length, 0)
  assert.equal(fake.bookingGuests.length, 0)
  assert.equal(fake.airbnbs.length, 0)
  assert.equal(fake.airbnbGuests.length, 0)
  assert.equal(fake.blockedDates.length, 0)
  assert.equal(fake.properties.length, 1)
  assert.equal(fake.properties[0].name, 'Aura Cozy Penthouse 1')
})