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
  createAirbnb,
  deleteAirbnb,
  deleteProperty,
  getAirbnb,
  getBooking,
  listAirbnb,
  listBookings,
  updateAirbnb,
  updateBooking,
  updateProperty,
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
          if (value !== null && value !== undefined) return false
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

  $transaction = (async (fn: (tx: never) => unknown) =>
    (fn as (tx: FakeDb) => Promise<unknown>)(this)) as unknown as PrismaClient['$transaction']

  private propertyFor(propertyId: string): Record<string, unknown> | null {
    return this.properties.find((p) => p.id === propertyId) ?? null
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
        for (const key of Object.keys(select)) out[key] = r[key]
        return out
      }
      return rows.map(project)
    },
    findFirst: async ({ where, select }: any = {}) => {
      const row = this.properties.find((r) => matches(where, r)) ?? null
      if (!row) return null
      if (!select) return row
      const out: Record<string, unknown> = {}
      for (const key of Object.keys(select)) out[key] = row[key]
      return out
    },
    findUnique: async ({ where, select }: any = {}) => {
      const row = this.properties.find((r) => matches(where, r)) ?? null
      if (!row) return null
      if (!select) return row
      const out: Record<string, unknown> = {}
      for (const key of Object.keys(select)) out[key] = row[key]
      return out
    },
    update: async ({ where, data, select }: any = {}) => {
      const row = this.properties.find((r) => matches(where, r))
      assert.ok(row, 'property.update: row not found')
      Object.assign(row, data)
      row.updatedAt = new Date()
      if (!select) return row
      const out: Record<string, unknown> = {}
      for (const key of Object.keys(select)) out[key] = row[key]
      return out
    },
    delete: async ({ where }: any = {}) => {
      const idx = this.properties.findIndex((r) => matches(where, r))
      assert.ok(idx >= 0, 'property.delete: row not found')
      this.properties.splice(idx, 1)
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
  }

  // ── booking guests ──
  guest: any = {
    deleteMany: async ({ where }: any = {}) => {
      this.bookingGuests = this.bookingGuests.filter((g) => !matches(where, g as Record<string, unknown>))
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
    count: async ({ where }: any = {}) => this.airbnbs.filter((r) => matches(where, r)).length,
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
      this.blockedDates = this.blockedDates.filter((r) => !matches(where, r))
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
    bedrooms: 1,
    beds: 2,
    bathrooms: 1,
    sqft: 450,
    amenities: ['Balcony', 'Wi-Fi'],
    accent: '#8B5CF6',
    visual: 'purple',
    location: 'Whitefield',
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
  propertyId?: string
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
    propertyId: overrides.propertyId ?? 'prop-1',
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
  assert.equal(created.property.slug, 'aura-cozy-penthouse-1')
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

test('createAirbnb rejects duplicate confirmation numbers', async () => {
  const fake = makeDb()
  seedProperty(fake)
  await createAirbnb(asClient(fake), airbnbBody())
  await assert.rejects(
    () => createAirbnb(asClient(fake), airbnbBody({ checkIn: '2026-11-01', checkOut: '2026-11-03' })),
    (err: unknown) => err instanceof ConflictError
  )
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

test('updateBooking replaces guest records and keeps cancelled status intact', async () => {
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
  })

  assert.equal(updated.name, 'Aura Sky Penthouse')
  assert.equal(updated.beds, 3)
  assert.deepStrictEqual(updated.amenities, ['Ocean view', 'Jacuzzi'])
  assert.equal(updated.capacity, 4)
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