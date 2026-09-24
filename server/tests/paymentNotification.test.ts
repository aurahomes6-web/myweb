import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildWhatsAppMessage } from '../src/services/notificationService.js'
import { GuestGender, PaymentStatus } from '../src/generated/prisma/enums.js'
import type { BookingNotificationPayload } from '../src/services/notificationService.js'

function basePayload(): BookingNotificationPayload {
  return {
    code: 'AURATEST1234',
    propertyName: 'Aura Cozy Penthouse',
    checkIn: '2030-01-10',
    checkOut: '2030-01-13',
    guestCount: 1,
    primaryPhone: '9812345678',
    guests: [
      { fullName: 'Asha Rao', aadhaarNumber: '123456789012', gender: GuestGender.FEMALE, age: 34 },
    ],
    pricing: {
      originalPricePaise: 300000,
      discountPaise: 0,
      finalPricePaise: 300000,
    },
  }
}

test('buildWhatsAppMessage has no payment lines when payment info is absent', () => {
  const message = buildWhatsAppMessage(basePayload())
  assert.ok(!message.includes('Payment Status'))
  assert.ok(!message.includes('UTR:'))
})

test('buildWhatsAppMessage appends payment, amount and UTR with verification state when present', () => {
  const message = buildWhatsAppMessage({
    ...basePayload(),
    payment: {
      status: PaymentStatus.PENDING,
      utr: 'RECR103123456',
      finalPricePaise: 300000,
    },
  })
  assert.ok(message.includes('Payment: PAID'))
  assert.ok(message.includes('Amount Paid: ₹3,000'))
  assert.ok(message.includes('UTR: RECR103123456'))
  assert.ok(message.includes('Verification: PENDING ADMIN VERIFICATION'))
  assert.ok(!message.includes('Payment Status:'))
})

test('buildWhatsAppMessage keeps the standard fields alongside payment info', () => {
  const message = buildWhatsAppMessage({
    ...basePayload(),
    payment: {
      status: PaymentStatus.PENDING,
      utr: 'RECR103123456',
      finalPricePaise: 300000,
    },
  })
  assert.ok(message.startsWith('AURA HOMES — NEW BOOKING'))
  assert.ok(message.includes('Booking ID: AURATEST1234'))
  assert.ok(message.includes('Asha Rao'))
  assert.ok(message.includes('Primary guest:'))
  assert.ok(message.includes('Please carry a valid Government-issued ID for all guests at check-in.'))
})