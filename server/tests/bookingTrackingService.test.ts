import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PrismaClient } from '../src/generated/prisma/client.js'
import { BookingStatus, PaymentStatus } from '../src/generated/prisma/enums.js'
import {
  NotFoundError,
  trackBookingByCode,
} from '../src/services/bookingTrackingService.js'

// ── minimal in-memory Prisma stand-in ──────────────────────────────────────

let codeCounter = 0
function nextCode(): string {
  codeCounter += 1
  return `AURATRACK${codeCounter}`
}

class FakeTrackDb {
  rows: Array<Record<string, unknown>> = []

  add(row: Record<string, unknown>) {
    this.rows.push(row)
    return row
  }

  booking = {
    findUnique: async ({ where }: { where: Record<string, any> }) => {
      const row = this.rows.find((r) => r.code === where.code)
      return row
        ? {
            ...row,
            property: {
              id: 'prop-1',
              name: 'Aura Cozy Penthouse',
              slug: 'aura-cozy-penthouse',
              shortLabel: 'Penthouse',
            },
          }
        : null
    },
  }
}

function trackingRow(overrides: Record<string, unknown> = {}): Record<string, any> {
  return {
    id: 'internal-id-should-never-leak',
    code: nextCode(),
    propertyId: 'prop-1',
    checkIn: new Date('2030-01-10T00:00:00.000Z'),
    checkOut: new Date('2030-01-13T00:00:00.000Z'),
    guestCount: 2,
    primaryPhone: '9812345678',
    status: BookingStatus.CONFIRMED,
    paymentStatus: PaymentStatus.PENDING,
    utr: 'RECR103123456',
    paymentSubmittedAt: new Date('2030-01-05T12:00:00.000Z'),
    paymentAcceptedAt: null,
    paymentRejectedAt: null,
    rejectionMessage: null,
    originalPricePaise: 300000,
    discountPaise: 0,
    finalPricePaise: 300000,
    notes: 'Late arrival',
    guests: [
      { fullName: 'Asha Rao', aadhaarNumber: '123456789012' },
    ],
    ...overrides,
  }
}

const db = new FakeTrackDb()
const client = db as unknown as PrismaClient

test('trackBookingByCode returns a safe public snapshot with property and pricing', async () => {
  const row = trackingRow()
  db.rows.push(row)

  const tracked = await trackBookingByCode(client, row.code)
  assert.equal(tracked.code, row.code)
  assert.equal(tracked.status, BookingStatus.CONFIRMED)
  assert.equal(tracked.paymentStatus, PaymentStatus.PENDING)
  assert.equal(tracked.checkIn, '2030-01-10')
  assert.equal(tracked.checkOut, '2030-01-13')
  assert.equal(tracked.nights, 3)
  assert.equal(tracked.guestCount, 2)
  assert.equal(tracked.originalPricePaise, 300000)
  assert.equal(tracked.finalPricePaise, 300000)
  assert.equal(tracked.property.name, 'Aura Cozy Penthouse')
  assert.equal(tracked.property.slug, 'aura-cozy-penthouse')
})

test('trackBookingByCode never leaks id, UTR, guests, phones or notes', async () => {
  const row = trackingRow()
  db.rows.push(row)

  const tracked = await trackBookingByCode(client, row.code) as unknown as Record<string, unknown>
  assert.equal(tracked.id, undefined)
  assert.equal(tracked.primaryPhone, undefined)
  assert.equal(tracked.utr, undefined)
  assert.equal(tracked.guests, undefined)
  assert.equal(tracked.notes, undefined)
  // Not even a masked UTR may appear on a public tracking page.
  assert.equal(JSON.stringify(tracked).includes('RECR103'), false)
  // Not even masked Aadhaar may appear.
  assert.equal(JSON.stringify(tracked).includes('123456789012'), false)
})

test('trackBookingByCode normalises uppercase and trims the code', async () => {
  const row = trackingRow()
  db.rows.push(row)

  const tracked = await trackBookingByCode(client, `  ${row.code.toLowerCase()}  `)
  assert.equal(tracked.code, row.code)
})

test('trackBookingByCode carries the rejection reason for rejected payments', async () => {
  const row = trackingRow({
    status: BookingStatus.CANCELLED,
    paymentStatus: PaymentStatus.REJECTED,
    paymentRejectedAt: new Date('2030-01-06T10:00:00.000Z'),
    rejectionMessage: 'UPI name mismatch.',
  })
  db.rows.push(row)

  const tracked = await trackBookingByCode(client, row.code)
  assert.equal(tracked.status, BookingStatus.CANCELLED)
  assert.equal(tracked.paymentStatus, PaymentStatus.REJECTED)
  assert.equal(tracked.rejectionMessage, 'UPI name mismatch.')
  assert.ok(tracked.paymentRejectedAt)
})

test('trackBookingByCode throws NotFoundError for an unknown code', async () => {
  db.rows.length = 0
  await assert.rejects(async () => trackBookingByCode(client, 'AURANOPE1234'), (err) => {
    assert.ok(err instanceof NotFoundError)
    return true
  })
})
