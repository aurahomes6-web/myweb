import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isAadhaarNumber, isIndianPhone, maskAadhaar, parseGender, validateCreateBooking } from '../src/lib/bookingValidation.js'

function baseBody() {
  return {
    propertyId: 'aura-cozy-penthouse-1',
    checkIn: '2030-01-10',
    checkOut: '2030-01-13',
    guestCount: 2,
    primaryPhone: '9812345678',
    guests: [
      { fullName: 'Asha Rao', aadhaarNumber: '123456789012', gender: 'Female', age: 34 },
      { fullName: 'Vikram Rao', aadhaarNumber: '987654321098', gender: 'MALE', age: 36 },
    ],
  }
}

test('validates and normalizes a correct booking payload', () => {
  const result = validateCreateBooking(baseBody())
  assert.equal(result.ok, true)
  assert.deepStrictEqual(result.ok && result.value.guests[0], {
    fullName: 'Asha Rao',
    aadhaarNumber: '123456789012',
    gender: 'FEMALE',
    age: 34,
    phone: '9812345678',
  })
  assert.equal(result.ok && result.value.primaryPhone, '9812345678')
})

test('rejects missing full name', () => {
  const body = baseBody()
  body.guests[0].fullName = ''
  const result = validateCreateBooking(body)
  assert.equal(result.ok, false)
  assert.ok(!result.ok && result.issues.some((i) => i.field === 'guests[0].fullName'))
})

test('rejects invalid Aadhaar numbers', () => {
  const body = baseBody()
  body.guests[1].aadhaarNumber = '12345'
  const result = validateCreateBooking(body)
  assert.equal(result.ok, false)
  assert.ok(!result.ok && result.issues.some((i) => i.field === 'guests[1].aadhaarNumber'))
})

test('accepts Aadhaar with spaces and normalizes', () => {
  const body = baseBody()
  body.guests[0].aadhaarNumber = '1234 5678 9012'
  const result = validateCreateBooking(body)
  assert.equal(result.ok, true)
  assert.equal(result.ok && result.value.guests[0].aadhaarNumber, '123456789012')
})

test('rejects invalid gender and low or high age', () => {
  const body = baseBody()
  body.guestCount = 1
  body.guests = [{ fullName: 'P', aadhaarNumber: '123456789012', gender: 'alien', age: 0 }]
  const result = validateCreateBooking(body)
  assert.equal(result.ok, false)
  assert.ok(!result.ok && result.issues.some((i) => i.field === 'guests[0].gender'))
  assert.ok(!result.ok && result.issues.some((i) => i.field === 'guests[0].age'))
})

test('accepts boundary ages 1 and 120', () => {
  const body = { ...baseBody(), guestCount: 2 }
  body.guests = [
    { fullName: 'B1', aadhaarNumber: '111111111111', gender: 'MALE', age: 1 },
    { fullName: 'B2', aadhaarNumber: '222222222222', gender: 'Female', age: 120 },
  ]
  assert.equal(validateCreateBooking(body).ok, true)
})

test('rejects guest count mismatch', () => {
  const body = baseBody()
  body.guestCount = 3
  const result = validateCreateBooking(body)
  assert.equal(result.ok, false)
  assert.ok(!result.ok && result.issues.some((i) => i.field === 'guests'))
})

test('rejects invalid primary phone', () => {
  const body = baseBody()
  body.primaryPhone = '12345'
  const result = validateCreateBooking(body)
  assert.equal(result.ok, false)
  assert.ok(!result.ok && result.issues.some((i) => i.field === 'primaryPhone'))
})

test('isAadhaarNumber helper accepts trimmed 12-digit string', () => {
  assert.equal(isAadhaarNumber('123456789012'), true)
  assert.equal(isAadhaarNumber('1234 5678 9012'), true)
  assert.equal(isAadhaarNumber('1234-5678-9012'), true)
  assert.equal(isAadhaarNumber('12345678901'), false)
})

test('Aadhaar must be EXACTLY 12 digits — 11 or 13 digits are rejected', () => {
  const eleven = baseBody()
  eleven.guests[1].aadhaarNumber = '12345678901' // 11 digits
  const elevenResult = validateCreateBooking(eleven)
  assert.equal(
    elevenResult.ok,
    false,
    '11-digit Aadhaar must be rejected' + JSON.stringify(elevenResult)
  )

  const thirteen = baseBody()
  thirteen.guests[1].aadhaarNumber = '1234567890123' // 13 digits
  const thirteenResult = validateCreateBooking(thirteen)
  assert.equal(
    thirteenResult.ok,
    false,
    '13-digit Aadhaar must be rejected' + JSON.stringify(thirteenResult)
  )

  const letters = baseBody()
  letters.guests[1].aadhaarNumber = '12345678901A'
  assert.equal(validateCreateBooking(letters).ok, false, 'non-digit Aadhaar must be rejected')

  assert.equal(isAadhaarNumber('123456789012'), true, 'valid 12-digit must stay accepted')
})

test('isIndianPhone accepts +91 prefix and 10-digit mobile', () => {
  assert.equal(isIndianPhone('9812345678'), true)
  assert.equal(isIndianPhone('+91 98123 45678'), true)
  assert.equal(isIndianPhone('0123456789'), false)
})

test('parseGender accepts both enum key and display label', () => {
  assert.equal(parseGender('MALE'), 'MALE')
  assert.equal(parseGender('Prefer not to say'), 'PREFER_NOT_TO_SAY')
  assert.equal(parseGender('alien'), null)
})

test('rejects duplicate Aadhaar numbers across guests', () => {
  const body = baseBody()
  body.guests[1].aadhaarNumber = '123456789012' // same as guest 0
  const result = validateCreateBooking(body)
  assert.equal(result.ok, false)
  const issues = !result.ok ? result.issues : []
  const aadhaarIssue = issues.filter((i) => i.field === 'guests[1].aadhaarNumber')
  assert.ok(
    aadhaarIssue.some((i) => /unique Aadhaar/i.test(i.message)),
    `expected unique-Aadhaar message, got ${JSON.stringify(issues)}`
  )
})

test('rejects two completely identical guest records', () => {
  const body = baseBody()
  body.guests[1] = { ...body.guests[0] }
  const result = validateCreateBooking(body)
  assert.equal(result.ok, false)
  const issues = !result.ok ? result.issues : []
  assert.ok(
    issues.some((i) => i.field === 'guests[1].fullName' && /identical/i.test(i.message)),
    `expected identical-guest message, got ${JSON.stringify(issues)}`
  )
})

test('allows identical names when Aadhaar numbers differ (Aadhaar is authoritative)', () => {
  const body = baseBody()
  body.guests[1] = {
    fullName: 'Asha Rao',
    aadhaarNumber: '777788889999',
    gender: 'Female',
    age: 34,
  }
  const result = validateCreateBooking(body)
  assert.equal(
    result.ok,
    true,
    !result.ok ? JSON.stringify(result.issues) : 'expected valid booking'
  )
})

test('maskAadhaar keeps only the last 4 digits', () => {
  assert.equal(maskAadhaar('123456789012'), '********9012')
})

test('maskAadhaar ignores separators and handles short inputs', () => {
  assert.equal(maskAadhaar('1234 5678 9012'), '********9012')
  assert.equal(maskAadhaar('9'), '9')
  assert.equal(maskAadhaar(''), '')
})

test('maskAadhaar never leaks the non-last-4 digits', () => {
  const masked = maskAadhaar('123456789012')
  assert.ok(!masked.includes('12345678901'))
  assert.ok(!masked.includes('123456789'))
  assert.equal(masked, '********9012')
  assert.equal(masked.length, 12)
})
