import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildWhatsAppMessage,
  getWhatsAppStatus,
  sendBookingNotification,
} from '../src/services/notificationService.js'
import { GuestGender } from '../src/generated/prisma/enums.js'

const ENV = 'AURA_WHATSAPP_NUMBER'
const original = process.env[ENV]

async function withEnv<T>(value: string | undefined, fn: () => Promise<T> | T): Promise<T> {
  if (value === undefined) delete process.env[ENV]
  else process.env[ENV] = value
  try {
    return await fn()
  } finally {
    if (original === undefined) delete process.env[ENV]
    else process.env[ENV] = original
  }
}

test('notification reports NOT_CONFIGURED without a recipient number', () => {
  withEnv(undefined, () => {
    const status = getWhatsAppStatus()
    assert.equal(status.status, 'NOT_CONFIGURED')
    assert.equal(status.sent, false)
    assert.equal(status.recipient, undefined)
  })
})

test('notification reports PROVIDER_PENDING (never a fake send) when number is set', () => {
  withEnv('+919481130067', () => {
    const status = getWhatsAppStatus()
    assert.equal(status.status, 'PROVIDER_PENDING')
    assert.equal(status.sent, false)
    assert.equal(status.recipient, '919481130067')
  })
})

test('buildWhatsAppMessage includes booking fields, nights, and the masked Aadhaar', () => {
  const message = buildWhatsAppMessage({
    code: 'AURATEST1234',
    propertyName: 'Aura Cozy Penthouse',
    checkIn: '2030-01-10',
    checkOut: '2030-01-13',
    guestCount: 1,
    primaryPhone: '9812345678',
    guests: [
      { fullName: 'Asha Rao', aadhaarNumber: '123456789012', gender: GuestGender.FEMALE, age: 34 },
    ],
  })
  assert.ok(message.startsWith('AURA HOMES — NEW BOOKING'))
  assert.ok(message.includes('Booking ID: AURATEST1234'))
  assert.ok(message.includes('Property: Aura Cozy Penthouse'))
  assert.ok(message.includes('Check-in: 2030-01-10'))
  assert.ok(message.includes('Check-out: 2030-01-13'))
  assert.ok(message.includes('Guests: 1'))
  assert.ok(message.includes('Nights: 3'))
  assert.ok(message.includes('Asha Rao'))
  assert.ok(message.includes('Primary guest:'))
  assert.ok(message.includes('+91 9812345678'))
  assert.ok(message.includes('Female'))
  assert.ok(message.includes('Age 34'))
  // Aadhaar is MASKED to the last 4 digits only — the full number never appears.
  assert.ok(message.includes('Aadhaar: ********9012'))
  assert.ok(!message.includes('123456789012'))
})

test('sendBookingNotification does not throw and never claims a send', async () => {
  await withEnv('+919481130067', async () => {
    const result = await sendBookingNotification({
      code: 'AURATEST1234',
      propertyName: 'Test Home',
      checkIn: '2030-01-10',
      checkOut: '2030-01-13',
      guestCount: 1,
      primaryPhone: '9812345678',
      guests: [
        { fullName: 'Asha Rao', aadhaarNumber: '123456789012', gender: GuestGender.FEMALE, age: 34 },
      ],
    })
    // A booking must never fail because of the notification; a send that
    // cannot happen is reported as not sent, never faked.
    assert.equal(result.sent, false)
  })
})

test('sendBookingNotification with no recipient stays NOT_CONFIGURED', async () => {
  await withEnv(undefined, async () => {
    const result = await sendBookingNotification({
      code: 'AURATEST1234',
      propertyName: 'Test Home',
      checkIn: '2030-01-10',
      checkOut: '2030-01-13',
      guestCount: 1,
      primaryPhone: '9812345678',
      guests: [
        { fullName: 'Asha Rao', aadhaarNumber: '123456789012', gender: GuestGender.FEMALE, age: 34 },
      ],
    })
    assert.equal(result.status, 'NOT_CONFIGURED')
    assert.equal(result.sent, false)
  })
})