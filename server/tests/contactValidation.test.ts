import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseContactSettings } from '../src/lib/contactValidation.js'

function baseBody(): Record<string, unknown> {
  return {
    email: 'bookings@aurahomes.com',
    phone: '+91 98765 43210',
    description: 'Private rooftop stays in Bengaluru',
  }
}

test('parses a complete valid contact payload', () => {
  const result = parseContactSettings(baseBody())
  assert.equal(result.ok, true)
  assert.ok(result.ok)
  assert.deepStrictEqual(result.value, {
    email: 'bookings@aurahomes.com',
    phone: '+91 98765 43210',
    description: 'Private rooftop stays in Bengaluru',
  })
})

test('accepts the original footer values', () => {
  const result = parseContactSettings({
    email: 'stay@aurahomes.com',
    phone: '+91 00000 00000',
    description: 'Premium penthouse locations',
  })
  assert.equal(result.ok, true)
})

test('trims every field while preserving its inner content', () => {
  const result = parseContactSettings({
    email: '  stay@aurahomes.com  ',
    phone: '  +91 00000 00000  ',
    description: '  Premium penthouse locations  ',
  })
  assert.equal(result.ok, true)
  assert.ok(result.ok)
  assert.deepStrictEqual(result.value, {
    email: 'stay@aurahomes.com',
    phone: '+91 00000 00000',
    description: 'Premium penthouse locations',
  })
})

test('rejects an invalid email address', () => {
  for (const email of ['', '   ', 'not-an-email', 'missing@tld', 'spaces in@mail.com']) {
    const result = parseContactSettings({ ...baseBody(), email })
    assert.equal(result.ok, false)
    assert.ok(!result.ok && result.issues.some((i) => i.field === 'email'), `expected email issue for "${email}"`)
  }
})

test('rejects a missing phone or description', () => {
  const noPhone = parseContactSettings({ ...baseBody(), phone: '   ' })
  assert.equal(noPhone.ok, false)
  assert.ok(!noPhone.ok && noPhone.issues.some((i) => i.field === 'phone'))

  const noDescription = parseContactSettings({ ...baseBody(), description: '' })
  assert.equal(noDescription.ok, false)
  assert.ok(!noDescription.ok && noDescription.issues.some((i) => i.field === 'description'))
})

test('collects every field issue in a single response', () => {
  const result = parseContactSettings({ email: 'bad', phone: '', description: '   ' })
  assert.equal(result.ok, false)
  assert.ok(!result.ok)
  const fields = result.issues.map((i) => i.field)
  assert.deepStrictEqual(fields.sort(), ['description', 'email', 'phone'])
})

test('rejects a phone longer than the allowed length', () => {
  const result = parseContactSettings({ ...baseBody(), phone: '+91 '.repeat(20) })
  assert.equal(result.ok, false)
  assert.ok(!result.ok && result.issues.some((i) => i.field === 'phone'))
})

test('rejects non-string field types', () => {
  const result = parseContactSettings({ ...baseBody(), phone: 919876543210 })
  assert.equal(result.ok, false)
  assert.ok(!result.ok && result.issues.some((i) => i.field === 'phone'))
})

test('rejects a body that is not an object', () => {
  for (const body of [null, undefined, 'text', 42, []]) {
    const result = parseContactSettings(body)
    assert.equal(result.ok, false)
    assert.ok(!result.ok && result.issues.some((i) => i.field === 'body'))
  }
})