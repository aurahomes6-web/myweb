import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeProperty, type PublicSpaceAttribute } from '../src/controllers/propertyController.js'

function baseRow(): Parameters<typeof serializeProperty>[0] {
  return {
    id: 'prop-1',
    slug: 'aura-lakehouse',
    name: 'Aura Lakehouse',
    shortLabel: 'AL',
    description: 'desc',
    shortDescription: 'short',
    capacity: 4,
    minGuests: 2,
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
    sqft: 600,
    amenities: ['WiFi'],
    accent: 'gold',
    visual: 'modern',
    location: 'Nainital',
    pricePerNightPaise: 300000,
  }
}

test('serializeProperty exposes minGuests and maps maxGuests from capacity', () => {
  const serialized = serializeProperty(baseRow())
  assert.equal(serialized.minGuests, 2)
  assert.equal(serialized.maxGuests, 4)
  assert.equal(serialized.capacity, 4)
})

test('serializeProperty defers to capacity when minGuests is absent', () => {
  const row = baseRow()
  row.minGuests = undefined as unknown as number
  const serialized = serializeProperty(row)
  // maxGuests still resolves from capacity, matching DB default of 1 is applied in Prisma.
  assert.equal(serialized.maxGuests, 4)
})

test('serializeProperty includes ordered space attributes with icon and sort', () => {
  const row = baseRow()
  row.spaceAttributes = [
    { id: 'attr-3', label: 'Kitchen', value: 'Fully equipped', icon: 'kitchen', sort: 2 },
    { id: 'attr-1', label: 'Bedrooms', value: '1', icon: 'bed', sort: 0 },
    { id: 'attr-2', label: 'Balcony', value: '150 sqft', icon: null, sort: 1 },
  ]
  const serialized = serializeProperty(row)

  assert.equal(serialized.spaceAttributes.length, 3)
  // Prisma orders by sort ascending before serializing; the serializer preserves order.
  assert.deepStrictEqual(
    serialized.spaceAttributes.map((a) => `${a.id}:${a.sort}`),
    ['attr-3:2', 'attr-1:0', 'attr-2:1']
  )
  const kitchen = serialized.spaceAttributes[0]
  assert.equal(kitchen.label, 'Kitchen')
  assert.equal(kitchen.value, 'Fully equipped')
  assert.equal(kitchen.icon, 'kitchen')
  const balcony = serialized.spaceAttributes[2]
  assert.equal(balcony.icon, null)
})

test('serializeProperty defaults missing icons to null', () => {
  const row = baseRow()
  row.spaceAttributes = [
    { id: 'attr-1', label: 'Floor', value: '3rd floor', sort: 0 } as PublicSpaceAttribute,
  ]
  const serialized = serializeProperty(row)
  assert.equal(serialized.spaceAttributes[0].icon, null)
})

test('serializeProperty returns an empty array when no attributes exist', () => {
  const serialized = serializeProperty(baseRow())
  assert.deepStrictEqual(serialized.spaceAttributes, [])
})