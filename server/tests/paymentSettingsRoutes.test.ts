import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { PrismaClient } from '../src/generated/prisma/client.js'
import type { ObjectStorage } from '../src/storage/storage.js'
import {
  ADMIN_COOKIE_NAME,
  adminConfig,
  issueSession,
  requireConfiguredAdmin,
  requireCsrfHeader,
  sessionCookie,
  type AdminConfig,
} from '../src/lib/adminAuth.js'
import {
  makeAdminGetPaymentSettingsHandler,
  makeAdminUpdatePaymentSettingsHandler,
  makeAdminUploadPaymentQrHandler,
  makePublicPaymentSettingsHandler,
} from '../src/controllers/paymentSettingsController.js'
import { uploadImageMiddleware } from '../src/controllers/adminController.js'
import { DEFAULT_PAYMENT_SETTINGS } from '../src/services/paymentSettingsService.js'

// Auth is built from env at admin-route load time, so the test env must be set
// BEFORE importing the admin router.
process.env.ADMIN_USERNAME = 'ps-admin'
process.env.ADMIN_PASSWORD = 'ps-pass'
process.env.ADMIN_SESSION_SECRET = 'ps-secret-123'
process.env.NODE_ENV = 'development'

const { default: adminRouter } = await import('../src/routes/admin.js')
const config: AdminConfig = adminConfig(process.env) as AdminConfig

// ── fake db + storage ──────────────────────────────────────────────────────

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

class FakeStorage implements ObjectStorage {
  constructor(private readonly url: string | null) {}
  async put(): Promise<{ url: string; key: string }> {
    if (this.url === null) throw new Error('blob backend down')
    return { url: this.url, key: 'payment/qr.jpg' }
  }
  async delete(): Promise<void> {}
}

// ── admin router app (auth/validation guards) ─────────────────────────────

const guardApp = express()
guardApp.use(express.json())
guardApp.use('/api/admin', adminRouter)

const guardServer = createServer(guardApp)
await new Promise<void>((resolve) => guardServer.listen(0, resolve))
const guardBase = `http://127.0.0.1:${(guardServer.address() as AddressInfo).port}/api/admin`

function sessionCookieHeader(): Record<string, string> {
  return { Cookie: sessionCookie(ADMIN_COOKIE_NAME, issueSession(config), config) }
}

// ── behavior app (injected fake db/storage) ───────────────────────────────

function makeBehaviorApp(db: FakePaymentSettingsDb, storage?: ObjectStorage) {
  const app = express()
  app.use(express.json())

  app.get('/api/payment-settings', makePublicPaymentSettingsHandler(asClient(db)))
  app.get('/api/admin/payment-settings', requireConfiguredAdmin(config), makeAdminGetPaymentSettingsHandler(asClient(db)))
  app.put(
    '/api/admin/payment-settings',
    requireCsrfHeader,
    requireConfiguredAdmin(config),
    makeAdminUpdatePaymentSettingsHandler(asClient(db))
  )
  app.post(
    '/api/admin/payment-settings/qr',
    requireCsrfHeader,
    requireConfiguredAdmin(config),
    uploadImageMiddleware,
    makeAdminUploadPaymentQrHandler(asClient(db), storage)
  )
  return app
}

async function withBehaviorServer(
  db: FakePaymentSettingsDb,
  storage: ObjectStorage | undefined,
  run: (base: string) => Promise<void>
) {
  const server = createServer(makeBehaviorApp(db, storage))
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    await run(base)
  } finally {
    server.closeAllConnections()
    server.close()
  }
}

function csrfHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return { 'X-Requested-With': 'XMLHttpRequest', ...headers }
}

// ── guards (real admin router, no DB touched) ─────────────────────────────

test('GET /api/admin/payment-settings rejects requests without an admin session', async () => {
  const res = await fetch(`${guardBase}/payment-settings`)
  assert.equal(res.status, 401)
})

test('PUT /api/admin/payment-settings rejects requests without the CSRF header', async () => {
  const headers = { 'Content-Type': 'application/json', ...sessionCookieHeader() }
  const res = await fetch(`${guardBase}/payment-settings`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({}),
  })
  assert.equal(res.status, 403)
})

test('PUT /api/admin/payment-settings rejects requests without an admin session', async () => {
  const res = await fetch(`${guardBase}/payment-settings`, {
    method: 'PUT',
    headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({}),
  })
  assert.equal(res.status, 401)
})

test('PUT /api/admin/payment-settings validates fields before touching the database', async () => {
  const headers = {
    ...sessionCookieHeader(),
    ...csrfHeaders({ 'Content-Type': 'application/json' }),
  }
  const res = await fetch(`${guardBase}/payment-settings`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ upiId: 'not-an-upi-id', upiName: '', upiPhone: 'nope' }),
  })
  assert.equal(res.status, 400)
  const body = (await res.json()) as { error: string; details: Array<{ field: string }> }
  assert.equal(body.error, 'VALIDATION_ERROR')
  assert.deepStrictEqual(body.details.map((d) => d.field).sort(), ['upiId', 'upiName', 'upiPhone'])
})

test('teardown: stop the guard server', () => {
  guardServer.closeAllConnections()
  guardServer.close()
})

// ── public GET ─────────────────────────────────────────────────────────────

test('GET /api/payment-settings returns exactly the four public fields', async () => {
  const db = new FakePaymentSettingsDb()
  await withBehaviorServer(db, undefined, async (base) => {
    const res = await fetch(`${base}/api/payment-settings`)
    assert.equal(res.status, 200)
    const body = (await res.json()) as Record<string, unknown>
    assert.deepStrictEqual(Object.keys(body).sort(), ['qrCodeUrl', 'upiId', 'upiName', 'upiPhone'])
    assert.deepStrictEqual(body, {
      upiName: DEFAULT_PAYMENT_SETTINGS.upiName,
      upiId: DEFAULT_PAYMENT_SETTINGS.upiId,
      upiPhone: DEFAULT_PAYMENT_SETTINGS.upiPhone,
      qrCodeUrl: '/qr.jpeg',
    })
  })
})

// ── admin GET (behavior) ───────────────────────────────────────────────────

test('GET /api/admin/payment-settings (injected) returns settings with the fallback source', async () => {
  const db = new FakePaymentSettingsDb()
  await withBehaviorServer(db, undefined, async (base) => {
    const res = await fetch(`${base}/api/admin/payment-settings`, {
      headers: sessionCookieHeader(),
    })
    assert.equal(res.status, 200)
    const body = (await res.json()) as { settings: Record<string, unknown> }
    assert.deepStrictEqual(body.settings, {
      upiName: DEFAULT_PAYMENT_SETTINGS.upiName,
      upiId: DEFAULT_PAYMENT_SETTINGS.upiId,
      upiPhone: DEFAULT_PAYMENT_SETTINGS.upiPhone,
      qrCodeUrl: '/qr.jpeg',
      qrSource: 'fallback',
    })
  })
})

// ── admin update ───────────────────────────────────────────────────────────

test('PUT /api/admin/payment-settings (injected) saves the UPI details', async () => {
  const db = new FakePaymentSettingsDb()
  await withBehaviorServer(db, undefined, async (base) => {
    const res = await fetch(`${base}/api/admin/payment-settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...sessionCookieHeader(),
        ...csrfHeaders(),
      },
      body: JSON.stringify({
        upiName: 'AURA HOMES',
        upiId: 'payments@aurahomes',
        upiPhone: '+91 98765 43210',
      }),
    })
    assert.equal(res.status, 200)
    const body = (await res.json()) as { settings: Record<string, unknown> }
    assert.equal(body.settings.upiName, 'AURA HOMES')
    assert.equal(body.settings.upiId, 'payments@aurahomes')
    assert.equal(body.settings.upiPhone, '+91 98765 43210')
    assert.equal(body.settings.qrSource, 'fallback')
    assert.equal(db.rows.length, 1)
    assert.equal(db.rows[0].upiName, 'AURA HOMES')
  })
})

// ── QR upload ──────────────────────────────────────────────────────────────

function qrForm(mimetype: string, include = true): FormData {
  const form = new FormData()
  if (include) form.append('image', new Blob([Buffer.from('fake-qr-bytes')], { type: mimetype }), 'qr.png')
  return form
}

test('POST /api/admin/payment-settings/qr uploads and persists the Blob URL', async () => {
  const db = new FakePaymentSettingsDb()
  const storage = new FakeStorage('https://blob.example/qr-uploaded.jpg')
  await withBehaviorServer(db, storage, async (base) => {
    const res = await fetch(`${base}/api/admin/payment-settings/qr`, {
      method: 'POST',
      headers: { ...sessionCookieHeader(), ...csrfHeaders() },
      body: qrForm('image/png'),
    })
    assert.equal(res.status, 200)
    const body = (await res.json()) as { settings: Record<string, unknown> }
    assert.equal(body.settings.qrCodeUrl, 'https://blob.example/qr-uploaded.jpg')
    assert.equal(body.settings.qrSource, 'blob')
    // Persisted in the singleton row and readable back by the public endpoint.
    assert.equal(db.rows[0].qrCodeUrl, 'https://blob.example/qr-uploaded.jpg')
    const publicRes = await fetch(`${base}/api/payment-settings`)
    const publicBody = (await publicRes.json()) as { qrCodeUrl: string }
    assert.equal(publicBody.qrCodeUrl, 'https://blob.example/qr-uploaded.jpg')
  })
})

test('POST /api/admin/payment-settings/qr rejects non-image uploads', async () => {
  const db = new FakePaymentSettingsDb()
  const storage = new FakeStorage('https://blob.example/qr.jpg')
  await withBehaviorServer(db, storage, async (base) => {
    const res = await fetch(`${base}/api/admin/payment-settings/qr`, {
      method: 'POST',
      headers: { ...sessionCookieHeader(), ...csrfHeaders() },
      body: qrForm('text/plain'),
    })
    assert.equal(res.status, 400)
    const body = (await res.json()) as { error: string }
    assert.equal(body.error, 'INVALID_IMAGE')
    assert.equal(db.rows.length, 0)
  })
})

test('POST /api/admin/payment-settings/qr rejects requests with no image', async () => {
  const db = new FakePaymentSettingsDb()
  const storage = new FakeStorage('https://blob.example/qr.jpg')
  await withBehaviorServer(db, storage, async (base) => {
    const res = await fetch(`${base}/api/admin/payment-settings/qr`, {
      method: 'POST',
      headers: { ...sessionCookieHeader(), ...csrfHeaders() },
      body: qrForm('image/png', false),
    })
    assert.equal(res.status, 400)
    const body = (await res.json()) as { error: string; details: Array<{ field: string }> }
    assert.equal(body.error, 'VALIDATION_ERROR')
    assert.deepStrictEqual(body.details.map((d) => d.field), ['image'])
    assert.equal(db.rows.length, 0)
  })
})

test('POST /api/admin/payment-settings/qr keeps the previous QR when storage fails', async () => {
  const db = new FakePaymentSettingsDb()
  const storage = new FakeStorage(null)
  await withBehaviorServer(db, storage, async (base) => {
    const res = await fetch(`${base}/api/admin/payment-settings/qr`, {
      method: 'POST',
      headers: { ...sessionCookieHeader(), ...csrfHeaders() },
      body: qrForm('image/png'),
    })
    assert.equal(res.status, 400)
    const body = (await res.json()) as { error: string; message: string }
    assert.equal(body.error, 'VALIDATION_ERROR')
    assert.match(body.message, /could not be uploaded/i)
    // Nothing was persisted — the previously working QR stays active.
    assert.equal(db.rows.length, 0)
  })
})

test('POST /api/admin/payment-settings/qr refuses non-browser-loadable storage URLs', async () => {
  const db = new FakePaymentSettingsDb()
  const storage = new FakeStorage('memory://payment/qr-1.png')
  await withBehaviorServer(db, storage, async (base) => {
    const res = await fetch(`${base}/api/admin/payment-settings/qr`, {
      method: 'POST',
      headers: { ...sessionCookieHeader(), ...csrfHeaders() },
      body: qrForm('image/png'),
    })
    assert.equal(res.status, 400)
    const body = (await res.json()) as { error: string }
    assert.equal(body.error, 'VALIDATION_ERROR')
    assert.equal(db.rows.length, 0)
  })
})