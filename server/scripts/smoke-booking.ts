/**
 * Live booking smoke test (Phase 5 verification).
 *
 * Requires:
 *   - a running AURA HOMES API server (default http://localhost:3001)
 *   - real Supabase credentials in server/.env (never committed)
 *
 * Runs the real double-booking / conflict flow against the live database:
 *   1. Create a booking → expect 201 CONFIRMED, masked-only Aadhaar.
 *   2. Overlapping stay for the same property → expect 409 PROPERTY_UNAVAILABLE.
 *   3. Adjacent stay (check-in == prior check-out) → expect 201.
 *   4. Public lookup → expect booking + safe guest list, masked-only Aadhaar.
 *   5. Airbnb details flow → message prepared, NO website booking created.
 *   6. Duplicate Aadhaar across guests → expect 400 VALIDATION_ERROR.
 *   7. Cancel a booking directly, re-book the same dates → expect 201.
 *   8. Cleanup every test booking it created.
 */
import 'dotenv/config'
import assert from 'node:assert/strict'
import { prisma } from '../src/lib/db.js'
import { BookingStatus } from '../src/generated/prisma/enums.js'
import { addDays, todayKey } from '../src/lib/dateUtils.js'

const BASE_URL = process.env.SMOKE_BASE_URL ?? 'http://localhost:3001'

interface ApiError {
  error: string
  message?: string
}

async function request(path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const text = await response.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { status: response.status, body }
}

function createPayload(propertyId: string, checkIn: string, checkOut: string, offsetAadhaar = 0) {
  return {
    propertyId,
    checkIn,
    checkOut,
    guestCount: 2,
    primaryPhone: '9812345678',
    guests: [
      { fullName: 'Aarav Mehta', aadhaarNumber: '123456789012', gender: 'Male', age: 34 },
      { fullName: 'Ishita Mehta', aadhaarNumber: '987654321098', gender: 'Female', age: 31 },
    ],
  }
}

const createdCodes: string[] = []

async function cleanup() {
  if (createdCodes.length === 0) return
  await prisma.booking.deleteMany({ where: { code: { in: createdCodes } } })
}

async function run(): Promise<void> {
  const health = await request('/api/health')
  assert.equal(health.status, 200, 'GET /api/health should return 200')

  const properties = await request('/api/properties')
  assert.equal(properties.status, 200, 'GET /api/properties should return 200')
  const propsBody = (properties.body as { properties?: Array<{ id: string; slug: string; name: string; capacity: number }> }).properties
  assert.ok(Array.isArray(propsBody) && propsBody.length > 0, 'No properties seeded — run npm run db:seed first')
  const property = propsBody[0]

  const start = addDays(todayKey(), 45)
  const end = addDays(start, 3)
  const middle = addDays(start, 1)
  const next = addDays(end, 2)

  // 1. Create the real booking.
  const first = await request('/api/bookings', {
    method: 'POST',
    body: JSON.stringify(createPayload(property.slug, start, end)),
  })
  assert.equal(first.status, 201, 'First booking should be created (201)')
  const firstBooking = first.body as Record<string, unknown>
  assert.equal(firstBooking.status, 'CONFIRMED')
  const firstJson = JSON.stringify(firstBooking)
  assert.ok(!firstJson.includes('123456789012'), 'Full Aadhaar must never appear in API responses')
  assert.ok(!firstJson.includes('987654321098'), 'Full Aadhaar must never appear in API responses')
  assert.ok(!firstJson.includes('"aadhaarNumber":'), 'Raw Aadhaar key must never appear in API responses')
  assert.ok(firstJson.includes('"aadhaarNumberMasked":"********9012"'), 'Masked Aadhaar must be returned instead')
  const firstCode = firstBooking.code as string
  createdCodes.push(firstCode)
  console.log(`PASS  1. created ${property.slug} ${start}→${end} code ${firstCode}`)

  // 2. Overlapping stay → 409.
  const overlap = await request('/api/bookings', {
    method: 'POST',
    body: JSON.stringify(createPayload(property.slug, middle, next)),
  })
  assert.equal(overlap.status, 409, 'Overlapping booking should be rejected (409)')
  const overlapBody = overlap.body as ApiError
  assert.equal(overlapBody.error, 'PROPERTY_UNAVAILABLE')
  console.log('PASS  2. overlapping stay rejected with 409 PROPERTY_UNAVAILABLE')

  // 3. Adjacent stay (check-in == previous check-out) → 201.
  const adjacent = await request('/api/bookings', {
    method: 'POST',
    body: JSON.stringify(createPayload(property.slug, end, next)),
  })
  assert.equal(adjacent.status, 201, 'Adjacent stay should be allowed (201)')
  const adjacentCode = (adjacent.body as { code: string }).code
  createdCodes.push(adjacentCode)
  console.log(`PASS  3. adjacent stay allowed with code ${adjacentCode}`)

  // 4. Public lookup returns safe fields with only masked Aadhaar.
  const lookup = await request(`/api/bookings/${encodeURIComponent(firstCode)}`)
  assert.equal(lookup.status, 200)
  const lookupJson = JSON.stringify(lookup.body)
  assert.ok(!lookupJson.includes('123456789012'), 'Lookup must not expose the full Aadhaar')
  assert.ok(!lookupJson.includes('"aadhaarNumber":'), 'Lookup must not expose the raw Aadhaar key')
  assert.ok(lookupJson.includes('"aadhaarNumberMasked":"********9012"'), 'Lookup must return only masked Aadhaar')
  const lookupBody = lookup.body as {
    guests: Array<{ fullName: string; isPrimary: boolean; aadhaarNumberMasked: string }>
  }
  assert.ok(Array.isArray(lookupBody.guests) && lookupBody.guests.length === 2)
  assert.equal(lookupBody.guests[0].isPrimary, true)
  assert.equal(lookupBody.guests[0].aadhaarNumberMasked, '********9012')
  console.log('PASS  4. public lookup returns safe guests with only masked Aadhaar')

  // 5. Airbnb details flow prepares a WhatsApp message and creates NO website booking.
  const bookingCountBefore = await prisma.booking.count()
  const airbnb = await request('/api/airbnb/details', {
    method: 'POST',
    body: JSON.stringify({
      reservationNumber: 'HMY9TR4US9',
      guestName: 'Aarav Mehta',
      primaryPhone: '9812345678',
      checkIn: start,
      checkOut: end,
      guestCount: 2,
      guests: [
        { fullName: 'Aarav Mehta', aadhaarNumber: '123456789012', gender: 'Male', age: 34 },
        { fullName: 'Ishita Mehta', aadhaarNumber: '987654321098', gender: 'Female', age: 31 },
      ],
    }),
  })
  assert.equal(airbnb.status, 200, 'Airbnb details should be accepted (200)')
  const airbnbBody = airbnb.body as { status: string; message: string; recipient?: string }
  assert.equal(airbnbBody.status, 'ok')
  assert.equal(airbnbBody.recipient, '919481130067')
  assert.ok(airbnbBody.message.includes('AIRBNB RESERVATION'), 'airbnb message header missing')
  assert.ok(airbnbBody.message.includes('HMY9TR4US9'), 'airbnb reservation number missing')
  assert.ok(airbnbBody.message.includes('Aadhaar: ********9012'), 'masked aadhaar missing')
  assert.ok(!airbnbBody.message.includes('123456789012'), 'full aadhaar leaked into airbnb message')
  const bookingCountAfter = await prisma.booking.count()
  assert.equal(
    bookingCountAfter,
    bookingCountBefore,
    'Airbnb flow must NOT create a website booking record'
  )
  console.log('PASS  5. airbnb details prepared for WhatsApp without creating a booking')

  // 6. Duplicate Aadhaar across guests is rejected by the backend.
  const duplicateAadhaar = createPayload(property.slug, start, end)
  duplicateAadhaar.guests[1] = { ...duplicateAadhaar.guests[0] }
  const dupResponse = await request('/api/bookings', {
    method: 'POST',
    body: JSON.stringify(duplicateAadhaar),
  })
  assert.equal(dupResponse.status, 400, 'Duplicate Aadhaar booking should be rejected (400)')
  const dupBody = dupResponse.body as ApiError & { details?: Array<{ field: string; message: string }> }
  assert.equal(dupBody.error, 'VALIDATION_ERROR')
  assert.ok(
    (dupBody.details ?? []).some((d) => /unique Aadhaar/i.test(d.message)),
    `expected unique-Aadhaar validation detail, got ${JSON.stringify(dupBody)}`
  )
  console.log('PASS  6. duplicate Aadhaar across guests rejected with 400 VALIDATION_ERROR')

  // 7. Cancelled bookings free their dates.
  await prisma.booking.update({ where: { code: firstCode }, data: { status: BookingStatus.CANCELLED } })
  const rebook = await request('/api/bookings', {
    method: 'POST',
    body: JSON.stringify(createPayload(property.slug, start, end)),
  })
  assert.equal(rebook.status, 201, 'Re-booking cancelled dates should succeed (201)')
  const rebookCode = (rebook.body as { code: string }).code
  createdCodes.push(rebookCode)
  console.log(`PASS  7. cancelled booking freed dates; re-booked ${rebookCode}`)

  console.log('\nALL LIVE SMOKE ASSERTIONS PASSED against the real Supabase database.')
}

run()
  .then(async () => {
    await cleanup()
    console.log(`CLEANUP   removed ${createdCodes.length} test booking(s)`)
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error('SMOKE TEST FAILED:', error)
    await cleanup().catch(() => undefined)
    await prisma.$disconnect().catch(() => undefined)
    process.exitCode = 1
  })