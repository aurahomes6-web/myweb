import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PrismaClient } from '../src/generated/prisma/client.js'
import { BookingStatus, PaymentStatus } from '../src/generated/prisma/enums.js'
import {
  ConflictError,
  NotFoundError,
  acceptPayment,
  listPayments,
  rejectPayment,
} from '../src/services/paymentService.js'

// ── minimal in-memory Prisma stand-in ──────────────────────────────────────

function matches(where: Record<string, any> | undefined, row: Record<string, any>): boolean {
  if (!where) return true
  for (const [key, cond] of Object.entries(where)) {
    const value = row[key]
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const op = cond as Record<string, any>
      if ('not' in op) {
        if (op.not === null) {
          if (value === null || value === undefined) return false
        } else if (value === op.not) return false
      }
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

function bookingRow(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    code: `AURA${id.toUpperCase()}`,
    propertyId: 'prop-1',
    checkIn: new Date('2030-01-10T00:00:00.000Z'),
    checkOut: new Date('2030-01-13T00:00:00.000Z'),
    guestCount: 2,
    primaryPhone: '9812345678',
    paymentStatus: PaymentStatus.PENDING,
    utr: 'RECR103123456',
    paymentSubmittedAt: new Date('2030-01-05T12:00:00.000Z'),
    paymentAcceptedAt: null,
    paymentRejectedAt: null,
    rejectionMessage: null,
    status: BookingStatus.CONFIRMED,
    originalPricePaise: 300000,
    discountPaise: 30000,
    finalPricePaise: 270000,
    ...overrides,
  }
}

class FakeBookingDb {
  rows: Array<Record<string, unknown>> = []

  booking = {
    findMany: async ({ where }: { where?: Record<string, any> } = {}) =>
      this.rows.filter((r) => matches(where, r)).map((r) => this.attach(r)),
    findUnique: async ({ where }: { where: Record<string, any> }) => {
      const row = this.rows.find((r) => r.id === where.id)
      return row ? this.attach(row) : null
    },
    update: async ({ where, data }: { where: Record<string, any>; data: Record<string, unknown> }) => {
      const index = this.rows.findIndex((r) => r.id === where.id)
      if (index === -1) throw new NotFoundError('booking missing')
      const merged = { ...this.rows[index], ...data }
      this.rows[index] = merged
      return this.attach(merged)
    },
  }

  private attach(row: Record<string, unknown>) {
    return {
      ...row,
      property: {
        id: 'prop-1',
        name: 'Aura Cozy Penthouse',
        slug: 'aura-cozy-penthouse',
        shortLabel: 'Penthouse',
      },
    }
  }
}

const db = new FakeBookingDb()
const client = db as unknown as PrismaClient

test('listPayments only returns bookings that have a payment record', async () => {
  const pending = bookingRow('b1')
  const withoutPayment = bookingRow('b2', { paymentStatus: null, utr: null, paymentSubmittedAt: null })
  db.rows.push(pending, withoutPayment)

  const payments = await listPayments(client)
  assert.equal(payments.length, 1)
  const payment = payments[0]
  assert.equal(payment.id, 'b1')
  assert.equal(payment.utr, 'RECR103123456')
  assert.equal(payment.bookingStatus, BookingStatus.CONFIRMED)
  assert.equal(payment.finalPricePaise, 270000)
  assert.equal(payment.property.name, 'Aura Cozy Penthouse')
  assert.equal(payment.nights, 3)
})

test('acceptPayment transitions PENDING → ACCEPTED and keeps the booking confirmed', async () => {
  db.rows.length = 0
  db.rows.push(bookingRow('b3'))

  const payment = await acceptPayment(client, 'b3')
  assert.equal(payment.paymentStatus, PaymentStatus.ACCEPTED)
  assert.ok(payment.paymentAcceptedAt)
  assert.equal(payment.paymentRejectedAt, null)
  assert.equal(payment.bookingStatus, BookingStatus.CONFIRMED)
})

test('rejectPayment transitions PENDING → REJECTED, stores the reason and cancels the booking', async () => {
  db.rows.length = 0
  db.rows.push(bookingRow('b4'))

  const payment = await rejectPayment(client, 'b4', 'UPI name mismatch; please use the account holder name.')
  assert.equal(payment.paymentStatus, PaymentStatus.REJECTED)
  assert.ok(payment.paymentRejectedAt)
  assert.equal(payment.rejectionMessage, 'UPI name mismatch; please use the account holder name.')
  // Rejecting releases the dates via booking.status = CANCELLED.
  assert.equal(payment.bookingStatus, BookingStatus.CANCELLED)
  assert.equal(payment.utr, 'RECR103123456')
})

test('rejectPayment without a message stores a null rejectionMessage', async () => {
  db.rows.length = 0
  db.rows.push(bookingRow('b5'))

  const payment = await rejectPayment(client, 'b5')
  assert.equal(payment.paymentStatus, PaymentStatus.REJECTED)
  assert.equal(payment.rejectionMessage, null)
  assert.equal(payment.bookingStatus, BookingStatus.CANCELLED)
})

test('acceptPayment rejects non-pending payments with ConflictError', async () => {
  db.rows.length = 0
  db.rows.push(bookingRow('b6', { paymentStatus: PaymentStatus.REJECTED }))

  await assert.rejects(async () => acceptPayment(client, 'b6'), (err) => {
    assert.ok(err instanceof ConflictError)
    return true
  })
})

test('rejectPayment rejects non-pending payments with ConflictError', async () => {
  db.rows.length = 0
  db.rows.push(bookingRow('b7', { paymentStatus: PaymentStatus.PENDING }))
  await acceptPayment(client, 'b7')

  await assert.rejects(async () => rejectPayment(client, 'b7', 'nope'), (err) => {
    assert.ok(err instanceof ConflictError)
    return true
  })
})

test('acceptPayment and rejectPayment throw NotFoundError for unknown ids', async () => {
  db.rows.length = 0
  await assert.rejects(async () => acceptPayment(client, 'missing'), (err) => {
    assert.ok(err instanceof NotFoundError)
    return true
  })
  await assert.rejects(async () => rejectPayment(client, 'missing'), (err) => {
    assert.ok(err instanceof NotFoundError)
    return true
  })
})
