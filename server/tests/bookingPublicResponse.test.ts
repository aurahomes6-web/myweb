import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  serializeGuestSafe,
  serializeBooking,
  type GuestRecordSelected,
} from '../src/controllers/bookingController.js'
import { BookingStatus, GuestGender } from '../src/generated/prisma/enums.js'
import type { Booking } from '../src/generated/prisma/client.js'

function dummyGuest(fullName: string, aadhaarNumber: string): GuestRecordSelected {
  return {
    fullName,
    gender: GuestGender.FEMALE,
    age: 34,
    phone: '9812345678',
    isPrimary: true,
    aadhaarNumber,
  }
}

function dummyBooking(): Booking {
  const base: Booking = {
    id: 'a1b2c3d4',
    code: 'AURATEST1234',
    propertyId: 'aura-cozy-penthouse-1',
    checkIn: new Date('2030-01-10T00:00:00.000Z'),
    checkOut: new Date('2030-01-13T00:00:00.000Z'),
    guestCount: 2,
    primaryPhone: '9812345678',
    notes: null,
    status: BookingStatus.CONFIRMED,
    createdAt: new Date('2030-01-01T09:00:00.000Z'),
    updatedAt: new Date('2030-01-01T09:00:00.000Z'),
  } as Booking
  return base
}

// Mirrors exactly what the public GET /api/bookings/:id handler returns.
function publicLookupResponse(): Record<string, unknown> {
  return serializeBooking(dummyBooking(), [
    serializeGuestSafe(dummyGuest('Asha Rao', '123456789012')),
    serializeGuestSafe(dummyGuest('Vikram Rao', '987654321098')),
  ])
}

test('public booking lookup is fully masked: no full Aadhaar and no WhatsApp message', () => {
  const body = publicLookupResponse()
  const json = JSON.stringify(body)

  assert.ok(!json.includes('123456789012'), 'full Aadhaar 1 leaked into public lookup')
  assert.ok(!json.includes('987654321098'), 'full Aadhaar 2 leaked into public lookup')
  assert.ok(!json.includes('1234567890'), 'Aadhaar prefix leaked into public lookup')
  assert.ok(!json.includes('"aadhaarNumber":'), 'raw Aadhaar key present in public lookup')
  assert.ok(body.whatsAppMessage === undefined, 'public lookup must never carry the WhatsApp message')
  assert.ok(
    json.includes('"aadhaarNumberMasked":"********9012"'),
    'masked Aadhaar must be returned instead'
  )
})

test('serializeGuestSafe keeps only the last 4 digits of every Aadhaar', () => {
  const safe = serializeGuestSafe(dummyGuest('Asha Rao', '123456789012'))
  assert.equal(safe.aadhaarNumberMasked, '********9012')
  assert.ok(!JSON.stringify(safe).includes('12345678901'))
  assert.ok(!JSON.stringify(safe).includes('123456789'))
})

test('create response may carry the WhatsApp message, and it is the ONLY container of the full Aadhaar', () => {
  const body: Record<string, unknown> = {
    ...publicLookupResponse(),
    whatsAppMessage: [
      'AURA HOMES — NEW BOOKING',
      'Booking ID: AURATEST1234',
      '1. Asha Rao | Aadhaar: 123456789012 | ...',
      '2. Vikram Rao | Aadhaar: 987654321098 | ...',
    ].join('\n'),
  }
  const json = JSON.stringify(body)
  const outside = JSON.stringify(body.whatsAppMessage ? { ...body, whatsAppMessage: undefined } : body)

  assert.ok(json.includes('123456789012'), 'full Aadhaar must exist inside the intentional message')
  assert.ok(json.includes('987654321098'), 'full Aadhaar must exist inside the intentional message')
  assert.ok(
    !outside.includes('123456789012') && !outside.includes('987654321098'),
    'full Aadhaar must not exist anywhere else in the response'
  )
})