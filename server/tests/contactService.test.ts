import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PrismaClient } from '../src/generated/prisma/client.js'
import {
  DEFAULT_CONTACT_SETTINGS,
  getContactSettings,
  updateContactSettings,
} from '../src/services/contactService.js'

type Row = Record<string, unknown>

function matches(where: Record<string, unknown> | undefined, row: Row): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, value]) => row[key] === value)
}

class FakeContactDb {
  rows: Row[] = []
  $transaction = undefined

  contactSettings: any = {
    findUnique: async ({ where }: any = {}) => this.rows.find((r) => matches(where, r)) ?? null,
    upsert: async ({ where, create, update }: any = {}) => {
      const existing = this.rows.find((r) => matches(where, r))
      if (existing) {
        Object.assign(existing, update)
        existing.updatedAt = new Date()
        return { ...existing }
      }
      const row = { id: where.id, createdAt: new Date(), updatedAt: new Date(), ...create }
      this.rows.push(row)
      return { ...row }
    },
  }
}

function asClient(fake: FakeContactDb): PrismaClient {
  return fake as unknown as PrismaClient
}

test('getContactSettings returns the footer defaults when no row exists', async () => {
  const fake = new FakeContactDb()
  const contact = await getContactSettings(asClient(fake))
  assert.deepStrictEqual(contact, DEFAULT_CONTACT_SETTINGS)
})

test('getContactSettings returns the persisted row and nothing else', async () => {
  const fake = new FakeContactDb()
  fake.rows.push({
    id: 'single',
    email: 'bookings@aurahomes.com',
    phone: '+91 98765 43210',
    description: 'Private rooftop stays in Bengaluru',
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  const contact = await getContactSettings(asClient(fake))
  assert.deepStrictEqual(Object.keys(contact).sort(), ['description', 'email', 'phone'])
  assert.deepStrictEqual(contact, {
    email: 'bookings@aurahomes.com',
    phone: '+91 98765 43210',
    description: 'Private rooftop stays in Bengaluru',
  })
})

test('updateContactSettings creates the singleton row on the first save', async () => {
  const fake = new FakeContactDb()
  const saved = await updateContactSettings(asClient(fake), {
    email: 'bookings@aurahomes.com',
    phone: '+91 98765 43210',
    description: 'Private rooftop stays in Bengaluru',
  })

  assert.deepStrictEqual(saved, {
    email: 'bookings@aurahomes.com',
    phone: '+91 98765 43210',
    description: 'Private rooftop stays in Bengaluru',
  })
  assert.equal(fake.rows.length, 1)
  assert.equal(fake.rows[0].id, 'single')
})

test('updateContactSettings updates the existing row instead of adding one', async () => {
  const fake = new FakeContactDb()
  fake.rows.push({
    id: 'single',
    email: 'stay@aurahomes.com',
    phone: '+91 00000 00000',
    description: 'Premium penthouse locations',
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  await updateContactSettings(asClient(fake), {
    email: 'bookings@aurahomes.com',
    phone: '+91 98765 43210',
    description: 'Private rooftop stays in Bengaluru',
  })

  assert.equal(fake.rows.length, 1)
  assert.equal(fake.rows[0].email, 'bookings@aurahomes.com')
  assert.equal(fake.rows[0].phone, '+91 98765 43210')
  assert.equal(fake.rows[0].description, 'Private rooftop stays in Bengaluru')
})

test('saved values are read back by getContactSettings', async () => {
  const fake = new FakeContactDb()
  await updateContactSettings(asClient(fake), {
    email: 'stay@aurahomes.com',
    phone: '+91 00000 00000',
    description: 'Premium penthouse locations',
  })
  const contact = await getContactSettings(asClient(fake))
  assert.deepStrictEqual(contact, {
    email: 'stay@aurahomes.com',
    phone: '+91 00000 00000',
    description: 'Premium penthouse locations',
  })
})