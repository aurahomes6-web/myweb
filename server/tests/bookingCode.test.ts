import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BOOKING_CODE_RE, generateBookingCode } from '../src/lib/bookingCode.js'

test('booking code uses the AURA prefix and 10-character body', () => {
  const code = generateBookingCode()
  assert.match(code, BOOKING_CODE_RE)
  assert.ok(code.startsWith('AURA'), 'expected AURA prefix')
  assert.equal(code.length, 14)
})

test('booking code alphabet excludes ambiguous characters', () => {
  for (let i = 0; i < 500; i++) {
    const body = generateBookingCode().slice(4)
    assert.doesNotMatch(body, /[IO01]/, `ambiguous character in ${body}`)
  }
})

test('booking codes are effectively unique', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 1000; i++) seen.add(generateBookingCode())
  assert.equal(seen.size, 1000)
})
