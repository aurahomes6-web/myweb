import assert from 'node:assert/strict'
import test from 'node:test'
import { parseBookingDateBlock } from '../src/lib/bookingDateBlockValidation.js'

test('accepts an inclusive normal-booking date block', () => {
  const result = parseBookingDateBlock({ startDate: '2026-10-01', endDate: '2026-10-03' })
  assert.deepEqual(result, { ok: true, value: { startDate: '2026-10-01', endDate: '2026-10-03' } })
})

test('accepts a single-day normal-booking block', () => {
  const result = parseBookingDateBlock({ startDate: '2026-10-01', endDate: '2026-10-01' })
  assert.equal(result.ok, true)
})

test('rejects reversed and malformed normal-booking blocks', () => {
  const reversed = parseBookingDateBlock({ startDate: '2026-10-03', endDate: '2026-10-01' })
  assert.equal(reversed.ok, false)
  const malformed = parseBookingDateBlock({ startDate: '10/01/2026', endDate: '2026-10-03' })
  assert.equal(malformed.ok, false)
})
