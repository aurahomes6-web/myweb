import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePropertyUpdate } from '../src/lib/propertyValidation.js'

function baseProperty(): Record<string, unknown> {
  return {
    name: 'Aura Cozy Penthouse 1',
    shortLabel: 'Cozy 1BHK in the clouds',
    description: 'A quiet, light-filled stay with skyline views.',
    shortDescription: 'Cosy penthouse with skyline views.',
    capacity: 3,
    bedrooms: 1,
    beds: 2,
    bathrooms: 1,
    sqft: 450,
    amenities: ['Private balcony', 'Smart TV', 'Wi-Fi'],
    accent: '#8B5CF6',
    visual: 'purple',
    location: 'Whitefield, Bengaluru',
    pricePerNightPaise: 250000,
  }
}

test('parses a complete valid property payload', () => {
  const result = parsePropertyUpdate(baseProperty())
  assert.equal(result.ok, true)
  assert.ok(result.ok)
  assert.equal(result.value.beds, 2)
  assert.deepStrictEqual(result.value.amenities, ['Private balcony', 'Smart TV', 'Wi-Fi'])
  assert.equal(result.value.location, 'Whitefield, Bengaluru')
})

test('accepts an unset beds field', () => {
  const body = baseProperty()
  body.beds = undefined
  const result = parsePropertyUpdate(body)
  assert.equal(result.ok, true)
  assert.ok(result.ok && result.value.beds === null)
})

test('rejects empty required text fields', () => {
  const body = baseProperty()
  body.description = '   '
  const result = parsePropertyUpdate(body)
  assert.equal(result.ok, false)
  assert.ok(!result.ok && result.issues.some((i) => i.field === 'description'))
})

test('rejects non-positive integers', () => {
  for (const field of ['capacity', 'bedrooms', 'bathrooms', 'sqft'] as const) {
    const body = baseProperty()
    body[field] = 0
    const result = parsePropertyUpdate(body)
    assert.equal(result.ok, false)
    assert.ok(!result.ok && result.issues.some((i) => i.field === field))
  }
})

test('rejects an empty facilities list', () => {
  const body = baseProperty()
  body.amenities = []
  const result = parsePropertyUpdate(body)
  assert.equal(result.ok, false)
  assert.ok(!result.ok && result.issues.some((i) => i.field === 'amenities'))
})

test('dedupes facilities while trimming whitespace', () => {
  const body = baseProperty()
  body.amenities = [' Wi-Fi ', 'Wi-Fi', 'Smart TV']
  const result = parsePropertyUpdate(body)
  assert.equal(result.ok, true)
  assert.deepStrictEqual(result.ok && result.value.amenities, ['Wi-Fi', 'Smart TV'])
})

test('rejects a body that is not an object', () => {
  const result = parsePropertyUpdate(null)
  assert.equal(result.ok, false)
})

test('rejects an invalid beds value while keeping other checks', () => {
  const body = baseProperty()
  body.beds = 'two'
  const result = parsePropertyUpdate(body)
  assert.equal(result.ok, false)
  assert.ok(!result.ok && result.issues.some((i) => i.field === 'beds'))
})