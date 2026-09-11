import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_STAY_NIGHTS, rangesOverlap, validateRange } from '../src/lib/dateRange.js'

test('overlapping ranges collide', () => {
  assert.equal(rangesOverlap('2030-01-10', '2030-01-13', '2030-01-12', '2030-01-14'), true)
  assert.equal(rangesOverlap('2030-01-10', '2030-01-13', '2030-01-10', '2030-01-13'), true)
  assert.equal(rangesOverlap('2030-01-12', '2030-01-14', '2030-01-10', '2030-01-13'), true)
})

test('adjacent ranges do not collide', () => {
  assert.equal(rangesOverlap('2030-01-10', '2030-01-13', '2030-01-13', '2030-01-15'), false)
  assert.equal(rangesOverlap('2030-01-13', '2030-01-15', '2030-01-10', '2030-01-13'), false)
})

test('disjoint ranges do not collide', () => {
  assert.equal(rangesOverlap('2030-01-10', '2030-01-12', '2030-01-20', '2030-01-22'), false)
})

test('validateRange accepts a forward-looking stay', () => {
  assert.equal(validateRange('2030-01-10', '2030-01-13'), null)
})

test('validateRange rejects invalid formats and reversed ranges', () => {
  assert.match(validateRange('not-a-date', '2030-01-13') ?? '', /valid YYYY-MM-DD/)
  assert.match(validateRange('2030-01-13', '2030-01-10') ?? '', /after checkIn/)
  assert.match(validateRange('2030-01-10', '2030-01-10') ?? '', /after checkIn/)
})

test('validateRange rejects past check-in and overlong stays', () => {
  assert.match(validateRange('2000-01-01', '2000-01-03') ?? '', /past/)
  assert.match(validateRange('2030-01-01', '2030-01-01') ?? '', /after checkIn/)
  const tooLong = new Date('2030-01-01')
  tooLong.setDate(tooLong.getDate() + MAX_STAY_NIGHTS + 1)
  const outKey = tooLong.toISOString().slice(0, 10)
  assert.match(validateRange('2030-01-01', outKey) ?? '', /night limit/)
})
