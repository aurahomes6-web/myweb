import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isUtrReference,
  normalizeUtr,
  parseRejectionMessage,
} from '../src/lib/paymentValidation.js'

test('normalizeUtr trims, removes whitespace and uppercases', () => {
  assert.equal(normalizeUtr('  abcd 1234 efgh  '), 'ABCD1234EFGH')
  assert.equal(normalizeUtr('abc 1234 xyz'), 'ABC1234XYZ')
  assert.equal(normalizeUtr('AbC123456780'), 'ABC123456780')
})

test('normalizeUtr rejects non-strings and blank values', () => {
  assert.equal(normalizeUtr(undefined), null)
  assert.equal(normalizeUtr(null), null)
  assert.equal(normalizeUtr(123456), null)
  assert.equal(normalizeUtr('   '), null)
  assert.equal(normalizeUtr(''), null)
})

test('isUtrReference accepts 12–22 character alphanumeric references', () => {
  // Typical 12-character UTRs.
  assert.equal(isUtrReference('ABCD12345678'), true)
  // Whitespace/grouping is normalised first.
  assert.equal(isUtrReference('abcd 1234 5678'), true)
  assert.equal(isUtrReference(' 1234567890AB '), true)
  // Max length is 22 characters.
  assert.equal(isUtrReference('A'.repeat(22)), true)
})

test('isUtrReference rejects wrong lengths and symbols', () => {
  assert.equal(isUtrReference('ABC123'), false)
  assert.equal(isUtrReference('A'.repeat(23)), false)
  assert.equal(isUtrReference('ABCD-12345678'), false)
  assert.equal(isUtrReference('ABCD_12345678'), false)
  assert.equal(isUtrReference('ABCD 1234 56!8'), false)
  assert.equal(isUtrReference(123), false)
})

test('parseRejectionMessage trims and caps at 500 characters', () => {
  assert.equal(parseRejectionMessage('  UPI name mismatch.  '), 'UPI name mismatch.')
  const max = parseRejectionMessage('x'.repeat(500))
  assert.ok(max !== null)
  assert.equal(max.length, 500)
  assert.equal(parseRejectionMessage('x'.repeat(501)), null)
})

test('parseRejectionMessage returns null for absent or blank input', () => {
  assert.equal(parseRejectionMessage(undefined), null)
  assert.equal(parseRejectionMessage(''), null)
  assert.equal(parseRejectionMessage('   '), null)
  assert.equal(parseRejectionMessage(null), null)
})