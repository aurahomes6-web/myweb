import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PrismaClient } from '../src/generated/prisma/client.js'
import {
  DEFAULT_PAYMENT_SETTINGS,
  QR_FALLBACK_PATH,
  getAdminPaymentSettings,
  getPaymentSettings,
  getPublicPaymentSettings,
  resolveQrCodeUrl,
  setPaymentSettingsQr,
  updatePaymentSettingsDetails,
} from '../src/services/paymentSettingsService.js'

type Row = Record<string, unknown>

function matches(where: Record<string, unknown> | undefined, row: Row): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, value]) => row[key] === value)
}

class FakePaymentSettingsDb {
  rows: Row[] = []
  $transaction = undefined

  paymentSettings: any = {
    findUnique: async ({ where }: any = {}) => this.rows.find((r) => matches(where, r)) ?? null,
    upsert: async ({ where, create, update }: any = {}) => {
      const existing = this.rows.find((r) => matches(where, r))
      if (existing) {
        Object.assign(existing, update)
        existing.updatedAt = new Date()
        return { ...existing }
      }
      const row = {
        id: where.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...DEFAULT_PAYMENT_SETTINGS,
        ...create,
      }
      this.rows.push(row)
      return { ...row }
    },
    update: async ({ where, data }: any = {}) => {
      const existing = this.rows.find((r) => matches(where, r))
      if (!existing) throw new Error('No row to update')
      Object.assign(existing, data)
      existing.updatedAt = new Date()
      return { ...existing }
    },
  }
}

function asClient(fake: FakePaymentSettingsDb): PrismaClient {
  return fake as unknown as PrismaClient
}

const EDITED = {
  upiName: 'AURA HOMES',
  upiId: 'payments@aurahomes',
  upiPhone: '+91 98765 43210',
}

test('getPaymentSettings creates the singleton row with the current defaults when none exists', async () => {
  const fake = new FakePaymentSettingsDb()
  const row = await getPaymentSettings(asClient(fake))

  assert.equal(row.id, 'single')
  assert.equal(row.upiName, DEFAULT_PAYMENT_SETTINGS.upiName)
  assert.equal(row.upiId, DEFAULT_PAYMENT_SETTINGS.upiId)
  assert.equal(row.upiPhone, DEFAULT_PAYMENT_SETTINGS.upiPhone)
  // Empty stored QR → the static asset stays the active fallback.
  assert.equal(row.qrCodeUrl, '')
  assert.equal(fake.rows.length, 1)
})

test('getPublicPaymentSettings returns exactly the four public fields', async () => {
  const fake = new FakePaymentSettingsDb()
  fake.rows.push({
    id: 'single',
    ...EDITED,
    qrCodeUrl: 'https://blob.example/qr-1.jpg',
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  const settings = await getPublicPaymentSettings(asClient(fake))
  assert.deepStrictEqual(Object.keys(settings).sort(), ['qrCodeUrl', 'upiId', 'upiName', 'upiPhone'])
  assert.deepStrictEqual(settings, { ...EDITED, qrCodeUrl: 'https://blob.example/qr-1.jpg' })
})

test('getPublicPaymentSettings resolves an empty QR to the static fallback asset', async () => {
  const fake = new FakePaymentSettingsDb()
  const settings = await getPublicPaymentSettings(asClient(fake))
  assert.equal(settings.qrCodeUrl, QR_FALLBACK_PATH)
})

test('getAdminPaymentSettings flags blob vs fallback QR sources', async () => {
  const unset = new FakePaymentSettingsDb()
  const before = await getAdminPaymentSettings(asClient(unset))
  assert.equal(before.qrSource, 'fallback')
  assert.equal(before.qrCodeUrl, QR_FALLBACK_PATH)

  const set = new FakePaymentSettingsDb()
  set.rows.push({
    id: 'single',
    ...DEFAULT_PAYMENT_SETTINGS,
    qrCodeUrl: 'https://blob.example/qr-2.png',
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  const after = await getAdminPaymentSettings(asClient(set))
  assert.equal(after.qrSource, 'blob')
  assert.equal(after.qrCodeUrl, 'https://blob.example/qr-2.png')
})

test('updatePaymentSettingsDetails creates the singleton row on the first save', async () => {
  const fake = new FakePaymentSettingsDb()
  const saved = await updatePaymentSettingsDetails(asClient(fake), EDITED)

  assert.deepStrictEqual(
    { upiName: saved.upiName, upiId: saved.upiId, upiPhone: saved.upiPhone },
    EDITED
  )
  assert.equal(saved.qrSource, 'fallback')
  assert.equal(fake.rows.length, 1)
  assert.equal(fake.rows[0].id, 'single')
  assert.equal(fake.rows[0].qrCodeUrl, '')
})

test('updatePaymentSettingsDetails updates the existing row and preserves the QR', async () => {
  const fake = new FakePaymentSettingsDb()
  fake.rows.push({
    id: 'single',
    ...DEFAULT_PAYMENT_SETTINGS,
    qrCodeUrl: 'https://blob.example/current-qr.png',
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  await updatePaymentSettingsDetails(asClient(fake), EDITED)

  assert.equal(fake.rows.length, 1)
  assert.equal(fake.rows[0].upiName, EDITED.upiName)
  assert.equal(fake.rows[0].upiId, EDITED.upiId)
  assert.equal(fake.rows[0].upiPhone, EDITED.upiPhone)
  assert.equal(fake.rows[0].qrCodeUrl, 'https://blob.example/current-qr.png')
})

test('setPaymentSettingsQr persists the Blob URL and flips the source to blob', async () => {
  const fake = new FakePaymentSettingsDb()
  const saved = await setPaymentSettingsQr(asClient(fake), 'https://blob.example/qr-new.jpg')

  assert.equal(saved.qrCodeUrl, 'https://blob.example/qr-new.jpg')
  assert.equal(saved.qrSource, 'blob')

  const publicSettings = await getPublicPaymentSettings(asClient(fake))
  assert.equal(publicSettings.qrCodeUrl, 'https://blob.example/qr-new.jpg')
})

test('a saved QR is returned by the public endpoint (persistence read-back)', async () => {
  const fake = new FakePaymentSettingsDb()
  await updatePaymentSettingsDetails(asClient(fake), EDITED)
  await setPaymentSettingsQr(asClient(fake), 'https://blob.example/qr-persist.png')

  const settings = await getPublicPaymentSettings(asClient(fake))
  assert.deepStrictEqual(settings, {
    ...EDITED,
    qrCodeUrl: 'https://blob.example/qr-persist.png',
  })
})

test('resolveQrCodeUrl returns the stored URL when present, else the fallback', () => {
  assert.equal(resolveQrCodeUrl({ qrCodeUrl: 'https://blob.example/qr.png' }), 'https://blob.example/qr.png')
  assert.equal(resolveQrCodeUrl({ qrCodeUrl: '' }), QR_FALLBACK_PATH)
  assert.equal(resolveQrCodeUrl({ qrCodeUrl: '   ' }), QR_FALLBACK_PATH)
})