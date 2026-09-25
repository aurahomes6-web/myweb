import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { PrismaClient } from '../src/generated/prisma/client.js'
import type { ObjectStorage, StoredBlob } from '../src/storage/storage.js'
import {
  ADMIN_COOKIE_NAME,
  adminConfig,
  issueSession,
  requireConfiguredAdmin,
  requireCsrfHeader,
  sessionCookie,
  type AdminConfig,
} from '../src/lib/adminAuth.js'
import { MAX_IMAGE_BYTES } from '../src/lib/uploadImage.js'
import { DEFAULT_HOMEPAGE_SETTINGS } from '../src/services/homepageSettingsService.js'

process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/aura_homes_test'
process.env.ADMIN_USERNAME = 'homepage-admin'
process.env.ADMIN_PASSWORD = 'homepage-pass'
process.env.ADMIN_SESSION_SECRET = 'homepage-secret-123'
process.env.NODE_ENV = 'development'

const [
  { default: adminRouter },
  {
    makeAdminDeleteHomepageVisualHandler,
    makeAdminGetHomepageSettingsHandler,
    makeAdminUpdateHomepageSettingsHandler,
    makeAdminUploadHomepageVisualHandler,
    makePublicHomepageSettingsHandler,
  },
  { uploadImageMiddleware },
] = await Promise.all([
  import('../src/routes/admin.js'),
  import('../src/controllers/homepageSettingsController.js'),
  import('../src/controllers/adminController.js'),
])

const config = adminConfig(process.env) as AdminConfig

type Row = Record<string, unknown>

const VALID_PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==',
    'base64'
  )
)

function matches(where: Record<string, unknown> | undefined, row: Row): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, value]) => row[key] === value)
}

class FakeHomepageSettingsDb {
  rows: Row[] = []

  homepageSettings: any = {
    findUnique: async ({ where }: any = {}) =>
      this.rows.find((row) => matches(where, row)) ?? null,
    upsert: async ({ where, create, update }: any = {}) => {
      const existing = this.rows.find((row) => matches(where, row))
      if (existing) {
        Object.assign(existing, update)
        existing.updatedAt = new Date()
        return { ...existing }
      }
      const row = {
        id: where.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...DEFAULT_HOMEPAGE_SETTINGS,
        ...create,
      }
      this.rows.push(row)
      return { ...row }
    },
    update: async ({ where, data }: any = {}) => {
      const existing = this.rows.find((row) => matches(where, row))
      if (!existing) throw new Error('No row to update')
      Object.assign(existing, data)
      existing.updatedAt = new Date()
      return { ...existing }
    },
  }
}

class FakeStorage implements ObjectStorage {
  puts: string[] = []
  deletes: string[] = []
  putError: Error | null = null

  async put(key: string): Promise<StoredBlob> {
    this.puts.push(key)
    if (this.putError) throw this.putError
    return { url: `https://unittest12345678.public.blob.vercel-storage.com/${key}`, key }
  }

  async getUrl(key: string): Promise<string | null> {
    return `https://unittest12345678.public.blob.vercel-storage.com/${key}`
  }

  async delete(key: string): Promise<void> {
    this.deletes.push(key)
  }
}

function asClient(fake: FakeHomepageSettingsDb): PrismaClient {
  return fake as unknown as PrismaClient
}

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'single',
    ...DEFAULT_HOMEPAGE_SETTINGS,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function sessionCookieHeader(): Record<string, string> {
  return { Cookie: sessionCookie(ADMIN_COOKIE_NAME, issueSession(config), config) }
}

function csrfHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return { 'X-Requested-With': 'XMLHttpRequest', ...headers }
}

function imageForm(
  mimetype: string,
  options: { include?: boolean; bytes?: number; content?: Uint8Array<ArrayBuffer> } = {}
): FormData {
  const form = new FormData()
  if (options.include !== false) {
    const content =
      options.content ?? (options.bytes === undefined ? VALID_PNG : new Uint8Array(options.bytes))
    form.append('image', new Blob([content], { type: mimetype }), 'homepage-visual.png')
  }
  return form
}

function makeBehaviorApp(db: FakeHomepageSettingsDb, storage: ObjectStorage) {
  const app = express()
  app.use(express.json())
  app.get('/api/homepage-settings', makePublicHomepageSettingsHandler(asClient(db)))
  app.get(
    '/api/admin/homepage-settings',
    requireConfiguredAdmin(config),
    makeAdminGetHomepageSettingsHandler(asClient(db))
  )
  app.put(
    '/api/admin/homepage-settings',
    requireCsrfHeader,
    requireConfiguredAdmin(config),
    makeAdminUpdateHomepageSettingsHandler(asClient(db))
  )
  app.post(
    '/api/admin/homepage-settings/visual',
    requireCsrfHeader,
    requireConfiguredAdmin(config),
    uploadImageMiddleware,
    makeAdminUploadHomepageVisualHandler(asClient(db), storage)
  )
  app.delete(
    '/api/admin/homepage-settings/visual',
    requireCsrfHeader,
    requireConfiguredAdmin(config),
    makeAdminDeleteHomepageVisualHandler(asClient(db), storage)
  )
  app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: 'INTERNAL_ERROR' })
  })
  return app
}

async function withBehaviorServer(
  db: FakeHomepageSettingsDb,
  storage: ObjectStorage,
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

const guardApp = express()
guardApp.use(express.json())
guardApp.use('/api/admin', adminRouter)
const guardServer = createServer(guardApp)
await new Promise<void>((resolve) => guardServer.listen(0, resolve))
const guardBase = `http://127.0.0.1:${(guardServer.address() as AddressInfo).port}/api/admin`

test('GET /api/admin/homepage-settings requires an admin session', async () => {
  const response = await fetch(`${guardBase}/homepage-settings`)
  assert.equal(response.status, 401)
})

test('PUT /api/admin/homepage-settings requires the CSRF header', async () => {
  const response = await fetch(`${guardBase}/homepage-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...sessionCookieHeader() },
    body: JSON.stringify({ visualImageAlt: 'Rooftop terrace suite' }),
  })
  assert.equal(response.status, 403)
})

test('PUT /api/admin/homepage-settings requires an admin session', async () => {
  const response = await fetch(`${guardBase}/homepage-settings`, {
    method: 'PUT',
    headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ visualImageAlt: 'Rooftop terrace suite' }),
  })
  assert.equal(response.status, 401)
})

test('POST /api/admin/homepage-settings/visual requires the CSRF header', async () => {
  const response = await fetch(`${guardBase}/homepage-settings/visual`, {
    method: 'POST',
    headers: sessionCookieHeader(),
    body: imageForm('image/png'),
  })
  assert.equal(response.status, 403)
})

test('DELETE /api/admin/homepage-settings/visual requires the CSRF header', async () => {
  const response = await fetch(`${guardBase}/homepage-settings/visual`, {
    method: 'DELETE',
    headers: sessionCookieHeader(),
  })
  assert.equal(response.status, 403)
})

test('GET /api/homepage-settings returns only safe public fields and the fallback', async () => {
  const db = new FakeHomepageSettingsDb()
  const storage = new FakeStorage()
  await withBehaviorServer(db, storage, async (base) => {
    const response = await fetch(`${base}/api/homepage-settings`)
    assert.equal(response.status, 200)
    const body = (await response.json()) as Record<string, unknown>
    assert.deepStrictEqual(Object.keys(body).sort(), ['visualImageAlt', 'visualImageUrl'])
    assert.deepStrictEqual(body, {
      visualImageUrl: null,
      visualImageAlt: DEFAULT_HOMEPAGE_SETTINGS.visualImageAlt,
    })
  })
})

test('PUT /api/admin/homepage-settings updates alt text and persists it across requests', async () => {
  const db = new FakeHomepageSettingsDb()
  const storage = new FakeStorage()
  await withBehaviorServer(db, storage, async (base) => {
    const response = await fetch(`${base}/api/admin/homepage-settings`, {
      method: 'PUT',
      headers: csrfHeaders({
        'Content-Type': 'application/json',
        ...sessionCookieHeader(),
      }),
      body: JSON.stringify({ visualImageAlt: 'Rooftop terrace suite' }),
    })
    assert.equal(response.status, 200)
    const body = (await response.json()) as {
      settings: { visualImageAlt: string; visualSource: string }
    }
    assert.equal(body.settings.visualImageAlt, 'Rooftop terrace suite')
    assert.equal(body.settings.visualSource, 'fallback')

    const publicResponse = await fetch(`${base}/api/homepage-settings`)
    const publicBody = (await publicResponse.json()) as { visualImageAlt: string }
    assert.equal(publicBody.visualImageAlt, 'Rooftop terrace suite')
  })
})

test('PUT /api/admin/homepage-settings validates alt text length', async () => {
  const db = new FakeHomepageSettingsDb()
  const storage = new FakeStorage()
  await withBehaviorServer(db, storage, async (base) => {
    const response = await fetch(`${base}/api/admin/homepage-settings`, {
      method: 'PUT',
      headers: csrfHeaders({
        'Content-Type': 'application/json',
        ...sessionCookieHeader(),
      }),
      body: JSON.stringify({ visualImageAlt: 'x'.repeat(161) }),
    })
    assert.equal(response.status, 400)
    const body = (await response.json()) as { error: string; details: Array<{ field: string }> }
    assert.equal(body.error, 'VALIDATION_ERROR')
    assert.deepStrictEqual(body.details.map((detail) => detail.field), ['visualImageAlt'])
  })
})

test('POST /api/admin/homepage-settings/visual uploads, persists, and exposes the custom visual', async () => {
  const db = new FakeHomepageSettingsDb()
  const storage = new FakeStorage()
  await withBehaviorServer(db, storage, async (base) => {
    const response = await fetch(`${base}/api/admin/homepage-settings/visual`, {
      method: 'POST',
      headers: csrfHeaders(sessionCookieHeader()),
      body: imageForm('image/png'),
    })
    assert.equal(response.status, 200)
    const body = (await response.json()) as {
      settings: { visualImageUrl: string; visualSource: string }
    }
    assert.match(
      body.settings.visualImageUrl,
      /^https:\/\/unittest12345678\.public\.blob\.vercel-storage\.com\/homepage\/visual-/
    )
    assert.equal(body.settings.visualSource, 'custom')
    assert.equal(db.rows.length, 1)

    const publicResponse = await fetch(`${base}/api/homepage-settings`)
    const publicBody = (await publicResponse.json()) as { visualImageUrl: string }
    assert.equal(publicBody.visualImageUrl, body.settings.visualImageUrl)
  })
})

test('POST /api/admin/homepage-settings/visual rejects a missing image', async () => {
  const db = new FakeHomepageSettingsDb()
  const storage = new FakeStorage()
  await withBehaviorServer(db, storage, async (base) => {
    const response = await fetch(`${base}/api/admin/homepage-settings/visual`, {
      method: 'POST',
      headers: csrfHeaders(sessionCookieHeader()),
      body: imageForm('image/png', { include: false }),
    })
    assert.equal(response.status, 400)
    const body = (await response.json()) as { error: string; details: Array<{ field: string }> }
    assert.equal(body.error, 'VALIDATION_ERROR')
    assert.deepStrictEqual(body.details.map((detail) => detail.field), ['image'])
  })
})

test('POST /api/admin/homepage-settings/visual rejects non-image MIME types', async () => {
  const db = new FakeHomepageSettingsDb()
  const storage = new FakeStorage()
  await withBehaviorServer(db, storage, async (base) => {
    const response = await fetch(`${base}/api/admin/homepage-settings/visual`, {
      method: 'POST',
      headers: csrfHeaders(sessionCookieHeader()),
      body: imageForm('text/plain'),
    })
    assert.equal(response.status, 400)
    const body = (await response.json()) as { error: string }
    assert.equal(body.error, 'INVALID_IMAGE')
    assert.equal(db.rows.length, 0)
  })
})

test('POST /api/admin/homepage-settings/visual rejects corrupt or mismatched image content', async () => {
  const db = new FakeHomepageSettingsDb()
  db.rows.push(makeRow({ visualImageUrl: 'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-11111111-1111-4111-8111-111111111111.png' }))
  const storage = new FakeStorage()
  const forms = [
    imageForm('image/png', { content: new TextEncoder().encode('not an image') }),
    imageForm('image/jpeg'),
  ]

  await withBehaviorServer(db, storage, async (base) => {
    for (const body of forms) {
      const response = await fetch(`${base}/api/admin/homepage-settings/visual`, {
        method: 'POST',
        headers: csrfHeaders(sessionCookieHeader()),
        body,
      })
      assert.equal(response.status, 400)
      const payload = (await response.json()) as { error: string; message: string }
      assert.equal(payload.error, 'VALIDATION_ERROR')
      assert.match(payload.message, /not a valid/i)
    }
  })

  assert.equal(db.rows[0].visualImageUrl, 'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-11111111-1111-4111-8111-111111111111.png')
  assert.deepStrictEqual(storage.puts, [])
  assert.deepStrictEqual(storage.deletes, [])
})

test('POST /api/admin/homepage-settings/visual rejects images over 10 MB', async () => {
  const db = new FakeHomepageSettingsDb()
  const storage = new FakeStorage()
  await withBehaviorServer(db, storage, async (base) => {
    const response = await fetch(`${base}/api/admin/homepage-settings/visual`, {
      method: 'POST',
      headers: csrfHeaders(sessionCookieHeader()),
      body: imageForm('image/png', { bytes: MAX_IMAGE_BYTES + 1 }),
    })
    assert.equal(response.status, 400)
    const body = (await response.json()) as { error: string; message: string }
    assert.equal(body.error, 'INVALID_IMAGE')
    assert.match(body.message, /10 MB or smaller/i)
  })
})

test('failed visual upload preserves the previously active homepage image', async () => {
  const db = new FakeHomepageSettingsDb()
  db.rows.push(makeRow({ visualImageUrl: 'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-old.jpg' }))
  const storage = new FakeStorage()
  storage.putError = new Error('blob unavailable')

  await withBehaviorServer(db, storage, async (base) => {
    const response = await fetch(`${base}/api/admin/homepage-settings/visual`, {
      method: 'POST',
      headers: csrfHeaders(sessionCookieHeader()),
      body: imageForm('image/png'),
    })
    assert.equal(response.status, 503)
    const body = (await response.json()) as { error: string; message: string }
    assert.equal(body.error, 'STORAGE_UNAVAILABLE')
    assert.match(body.message, /storage is unavailable/i)

    const publicResponse = await fetch(`${base}/api/homepage-settings`)
    const publicBody = (await publicResponse.json()) as { visualImageUrl: string }
    assert.equal(publicBody.visualImageUrl, 'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-old.jpg')
  })
})

test('DELETE /api/admin/homepage-settings/visual resets to the exact fallback behavior', async () => {
  const db = new FakeHomepageSettingsDb()
  db.rows.push(
    makeRow({
      visualImageUrl: 'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-22222222-2222-4222-8222-222222222222.webp',
      visualImageAlt: 'Rooftop terrace suite',
    })
  )
  const storage = new FakeStorage()

  await withBehaviorServer(db, storage, async (base) => {
    const response = await fetch(`${base}/api/admin/homepage-settings/visual`, {
      method: 'DELETE',
      headers: csrfHeaders(sessionCookieHeader()),
    })
    assert.equal(response.status, 200)
    const body = (await response.json()) as {
      settings: { visualImageUrl: null; visualImageAlt: string; visualSource: string }
    }
    assert.equal(body.settings.visualImageUrl, null)
    assert.equal(body.settings.visualImageAlt, 'Rooftop terrace suite')
    assert.equal(body.settings.visualSource, 'fallback')
    assert.deepStrictEqual(storage.deletes, ['homepage/visual-22222222-2222-4222-8222-222222222222.webp'])

    const publicResponse = await fetch(`${base}/api/homepage-settings`)
    const publicBody = (await publicResponse.json()) as { visualImageUrl: null }
    assert.equal(publicBody.visualImageUrl, null)
  })
})

test('teardown stops the admin guard server', () => {
  guardServer.closeAllConnections()
  guardServer.close()
})
