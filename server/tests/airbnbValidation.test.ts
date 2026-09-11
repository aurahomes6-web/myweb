import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateAirbnbDetails,
  normalizeReservationNumber,
  maskAadhaar,
} from '../src/lib/airbnbValidation.js'
import { buildAirbnbWhatsAppMessage } from '../src/services/notificationService.js'

function baseBody() {
  return {
    reservationNumber: 'ABC-123 456',
    guestName: 'Rahul Kumar',
    primaryPhone: '9876543210',
    checkIn: '2026-09-15',
    checkOut: '2026-09-18',
    guestCount: 2,
    guests: [
      { fullName: 'Rahul Kumar', aadhaarNumber: '123456789012', gender: 'Male', age: 28 },
      { fullName: 'Priya Kumar', aadhaarNumber: '987654321098', gender: 'FEMALE', age: 26 },
    ],
  }
}

function issuesOf(body: unknown): Array<{ field: string; message: string }> {
  const result = validateAirbnbDetails(body)
  assert.equal(result.ok, false, 'expected an invalid result')
  return result.ok ? [] : result.issues
}

function expectIssue(body: unknown, field: string, pattern: RegExp): void {
  const issues = issuesOf(body)
  assert.ok(
    issues.some((i) => i.field === field && pattern.test(i.message)),
    `expected issue on "${field}" matching ${pattern}, got ${JSON.stringify(issues)}`
  )
}

test('accepts and normalises a valid Airbnb details payload', () => {
  const result = validateAirbnbDetails(baseBody())
  assert.equal(result.ok, true)
  assert.ok(result.ok && result.value)
  assert.equal(result.ok && result.value.reservationNumber, 'ABC123456')
  assert.equal(result.ok && result.value.primaryPhone, '9876543210')
  assert.equal(result.ok && result.value.guestCount, 2)
  assert.equal(result.ok && result.value.guests[0].gender, 'MALE')
})

test('rejects a missing Airbnb reservation number', () => {
  const body = baseBody()
  body.reservationNumber = '   '
  expectIssue(body, 'reservationNumber', /required/i)
})

test('rejects an invalid Airbnb reservation number', () => {
  const body = baseBody()
  body.reservationNumber = 'AB!'
  expectIssue(body, 'reservationNumber', /invalid/i)
})

test('rejects a missing guest / reservation name', () => {
  const body = baseBody()
  body.guestName = ''
  expectIssue(body, 'guestName', /required/i)
})

test('rejects a missing primary phone and invalid phone', () => {
  const missing = baseBody()
  missing.primaryPhone = ''
  expectIssue(missing, 'primaryPhone', /required/i)

  const invalid = baseBody()
  invalid.primaryPhone = '12345'
  expectIssue(invalid, 'primaryPhone', /invalid/i)
})

test('rejects invalid dates and reversed ranges', () => {
  const reversed = baseBody()
  reversed.checkOut = '2026-09-10' // before check-in
  expectIssue(reversed, 'checkIn/checkOut', /after check-in/i)

  const badFormat = baseBody()
  badFormat.checkIn = '15-09-2026'
  expectIssue(badFormat, 'checkIn/checkOut', /valid YYYY-MM-DD/i)
})

test('rejects missing date fields', () => {
  const body = baseBody()
  body.checkIn = ''
  expectIssue(body, 'checkIn/checkOut', /valid YYYY-MM-DD/i)
})

test('rejects an invalid or mismatched guest count', () => {
  const badType = baseBody()
  badType.guestCount = 'abc' as unknown as number
  expectIssue(badType, 'guestCount', /required/i)

  const mismatch = baseBody()
  mismatch.guestCount = 3 // but only 2 guest rows
  expectIssue(mismatch, 'guests', /mismatch/i)
})

test('rejects missing guest information', () => {
  const body = baseBody()
  body.guests[1] = { fullName: '', aadhaarNumber: '', gender: '', age: 0 }
  const issues = issuesOf(body)
  assert.ok(issues.some((i) => i.field === 'guests[1].fullName'))
  assert.ok(issues.some((i) => i.field === 'guests[1].aadhaarNumber'))
  assert.ok(issues.some((i) => i.field === 'guests[1].gender'))
  assert.ok(issues.some((i) => i.field === 'guests[1].age'))
})

test('rejects duplicate Aadhaar numbers across guests', () => {
  const body = baseBody()
  body.guests[1] = { ...body.guests[0] }
  expectIssue(body, 'guests[1].aadhaarNumber', /unique Aadhaar/i)
})

test('rejects two completely identical guest records', () => {
  const body = baseBody()
  // Complete duplicate of guest 1 — same name, gender AND age. The Aadhaar is
  // also the same, so both the unique-Aadhaar and identical-record checks fire.
  body.guests[1] = { ...body.guests[0], aadhaarNumber: '123456789012' }
  expectIssue(body, 'guests[1].aadhaarNumber', /unique Aadhaar/i)
  expectIssue(body, 'guests[1].fullName', /identical to Guest 1/i)
})

test('normalises reservation numbers (uppercase, strips separators)', () => {
  assert.equal(normalizeReservationNumber('  hm2y9ys24d '), 'HM2Y9YS24D')
  assert.equal(normalizeReservationNumber('abc-123 456'), 'ABC123456')
})

test('maskAadhaar keeps only the last 4 digits', () => {
  assert.equal(maskAadhaar('123456789012'), '********9012')
})

test('WhatsApp message contains reservation number, guest details and dates', () => {
  const result = validateAirbnbDetails(baseBody())
  assert.ok(result.ok)
  if (!result.ok) return
  const message = buildAirbnbWhatsAppMessage(result.value)

  assert.ok(message.includes('🏠 AURA HOMES'))
  assert.ok(message.includes('AIRBNB RESERVATION'))
  assert.ok(message.includes('Airbnb Reservation No: ABC123456'))
  assert.ok(message.includes('Guest Name: Rahul Kumar'))
  assert.ok(message.includes('Phone: 9876543210'))
  assert.ok(message.includes('Check-in: 15 Sep 2026'))
  assert.ok(message.includes('Check-out: 18 Sep 2026'))
  assert.ok(message.includes('Guests: 2'))
  assert.ok(message.includes('Guest 1'))
  assert.ok(message.includes('Name: Rahul Kumar'))
  assert.ok(message.includes('Guest 2'))
  assert.ok(message.includes('Name: Priya Kumar'))
  assert.ok(message.includes('Gender: Female'))
  assert.ok(message.includes('Age: 26'))
})

test('WhatsApp message contains ONLY the last 4 Aadhaar digits', () => {
  const result = validateAirbnbDetails(baseBody())
  assert.ok(result.ok)
  if (!result.ok) return
  const message = buildAirbnbWhatsAppMessage(result.value)

  assert.ok(message.includes('Aadhaar: ********9012'))
  assert.ok(message.includes('Aadhaar: ********1098'))
  assert.ok(!message.includes('123456789012'), 'full Aadhaar 1 leaked into message')
  assert.ok(!message.includes('987654321098'), 'full Aadhaar 2 leaked into message')
  assert.ok(!message.includes('1234567890'), 'prefix of Aadhaar leaked into message')
})