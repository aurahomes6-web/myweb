import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSpaceConfig, SPACE_ICONS } from '../src/lib/spaceValidation.js'

function baseSpace(): Record<string, unknown> {
  return {
    minGuests: 1,
    maxGuests: 4,
    attributes: [
      { label: 'Bedrooms', value: '1', icon: 'bed' },
      { label: 'Kitchen', value: 'Fully equipped', icon: 'kitchen' },
    ],
  }
}

test('parses a complete valid space payload', () => {
  const result = parseSpaceConfig(baseSpace())
  assert.equal(result.ok, true)
  assert.ok(result.ok)
  assert.equal(result.value.minGuests, 1)
  assert.equal(result.value.maxGuests, 4)
  assert.deepStrictEqual(result.value.attributes, [
    { label: 'Bedrooms', value: '1', icon: 'bed' },
    { label: 'Kitchen', value: 'Fully equipped', icon: 'kitchen' },
  ])
})

test('capacity range: accepts min and max as numbers', () => {
  const result = parseSpaceConfig({ ...baseSpace(), minGuests: 2, maxGuests: 6 })
  assert.equal(result.ok, true)
  assert.ok(result.ok && result.value.minGuests === 2 && result.value.maxGuests === 6)
})

test('capacity range: accepts min and max as numeric strings', () => {
  const result = parseSpaceConfig({ ...baseSpace(), minGuests: '1', maxGuests: '10' })
  assert.equal(result.ok, true)
  assert.ok(result.ok && result.value.minGuests === 1 && result.value.maxGuests === 10)
})

test('capacity range: rejects max below min', () => {
  const result = parseSpaceConfig({ ...baseSpace(), minGuests: 4, maxGuests: 2 })
  assert.equal(result.ok, false)
  assert.ok(!result.ok && result.issues.some((i) => i.field === 'minGuests'))
})

test('capacity range: rejects non-positive guest counts', () => {
  for (const [field, value] of [['minGuests', 0], ['maxGuests', 0], ['minGuests', -1], ['maxGuests', -2]] as const) {
    const result = parseSpaceConfig({ ...baseSpace(), [field]: value })
    assert.equal(result.ok, false)
    assert.ok(!result.ok && result.issues.some((i) => i.field === field))
  }
})

test('capacity range: rejects a non-integer max', () => {
  const result = parseSpaceConfig({ ...baseSpace(), maxGuests: 2.5 })
  assert.equal(result.ok, false)
  assert.ok(!result.ok && result.issues.some((i) => i.field === 'maxGuests'))
})

test('accepts an empty attribute list', () => {
  const result = parseSpaceConfig({ ...baseSpace(), attributes: [] })
  assert.equal(result.ok, true)
  assert.ok(result.ok && result.value.attributes.length === 0)
})

test('rejects a missing attributes array', () => {
  const body = baseSpace()
  delete body.attributes
  const result = parseSpaceConfig(body)
  assert.equal(result.ok, false)
  assert.ok(!result.ok && result.issues.some((i) => i.field === 'attributes'))
})

test('trims labels and values while preserving order', () => {
  const result = parseSpaceConfig({
    ...baseSpace(),
    attributes: [
      { label: '  Balcony  ', value: ' 150 sqft ', icon: 'terrace' },
      { label: 'Floor', value: '3rd floor', icon: null },
    ],
  })
  assert.equal(result.ok, true)
  assert.deepStrictEqual(result.ok && result.value.attributes, [
    { label: 'Balcony', value: '150 sqft', icon: 'terrace' },
    { label: 'Floor', value: '3rd floor', icon: null },
  ])
})

test('rejects attributes with empty labels or values', () => {
  const noLabel = parseSpaceConfig({ ...baseSpace(), attributes: [{ label: '  ', value: '1' }] })
  assert.equal(noLabel.ok, false)
  assert.ok(!noLabel.ok && noLabel.issues.some((i) => i.field.endsWith('.label')))

  const noValue = parseSpaceConfig({ ...baseSpace(), attributes: [{ label: 'Bathrooms', value: '' }] })
  assert.equal(noValue.ok, false)
  assert.ok(!noValue.ok && noValue.issues.some((i) => i.field.endsWith('.value')))
})

test('rejects unknown icon identifiers', () => {
  const result = parseSpaceConfig({
    ...baseSpace(),
    attributes: [{ label: 'Custom', value: 'x', icon: 'not-an-icon' }],
  })
  assert.equal(result.ok, false)
  assert.ok(!result.ok && result.issues.some((i) => i.field.endsWith('.icon')))
})

test('accepts empty or absent icons', () => {
  const absent = parseSpaceConfig({
    ...baseSpace(),
    attributes: [{ label: 'A', value: '1' }],
  })
  assert.equal(absent.ok, true)
  assert.ok(absent.ok && absent.value.attributes[0].icon === null)

  const empty = parseSpaceConfig({
    ...baseSpace(),
    attributes: [{ label: 'A', value: '1', icon: '' }],
  })
  assert.equal(empty.ok, true)
  assert.ok(empty.ok && empty.value.attributes[0].icon === null)
})

test('every exported icon id maps to a client-renderable icon', () => {
  assert.ok(SPACE_ICONS.length > 0)
  assert.ok(SPACE_ICONS.includes('users'))
  assert.ok(SPACE_ICONS.includes('bed'))
})

test('rejects more than the allowed attribute count', () => {
  const attributes = Array.from({ length: 61 }, (_, i) => ({ label: `A${i}`, value: '1' }))
  const result = parseSpaceConfig({ ...baseSpace(), attributes })
  assert.equal(result.ok, false)
  assert.ok(!result.ok && result.issues.some((i) => i.field === 'attributes'))
})

test('rejects a body that is not an object', () => {
  assert.equal(parseSpaceConfig(null).ok, false)
  assert.equal(parseSpaceConfig([]).ok, false)
})