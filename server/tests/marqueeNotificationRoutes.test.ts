import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { PrismaClient } from '../src/generated/prisma/client.js'
import {
  ADMIN_COOKIE_NAME,
  adminConfig,
  issueSession,
  sessionCookie,
  type AdminConfig,
} from '../src/lib/adminAuth.js'

process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/aura_homes_test'
process.env.ADMIN_USERNAME = 'marquee-admin'
process.env.ADMIN_PASSWORD = 'marquee-pass'
process.env.ADMIN_SESSION_SECRET = 'marquee-secret-123'
process.env.NODE_ENV = 'development'

const [{ default: adminRouter }, { makePublicMarqueeNotificationsHandler }] = await Promise.all([
  import('../src/routes/admin.js'),
  import('../src/controllers/marqueeNotificationController.js'),
])

const config = adminConfig(process.env) as AdminConfig

type Row = {
  id: string
  message: string
  isActive: boolean
  sort: number
  createdAt: Date
  updatedAt: Date
}

class FakeMarqueeNotificationDb {
  constructor(readonly rows: Row[]) {}

  marqueeNotification: any = {
    findMany: async ({ where, orderBy }: any = {}) => {
      const filtered = where
        ? this.rows.filter((row) => Object.entries(where).every(([key, value]) => row[key as keyof Row] === value))
        : [...this.rows]
      const order = orderBy ?? [{ sort: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]
      return [...filtered]
        .sort((left, right) => {
          for (const item of order) {
            for (const [key, direction] of Object.entries(item)) {
              const leftValue = left[key as keyof Row]
              const rightValue = right[key as keyof Row]
              if (leftValue === rightValue) continue
              const comparison =
                typeof leftValue === 'number' && typeof rightValue === 'number'
                  ? leftValue - rightValue
                  : String(leftValue).localeCompare(String(rightValue))
              return direction === 'desc' ? -comparison : comparison
            }
          }
          return 0
        })
        .map((row) => ({ ...row }))
    },
  }
}

function asClient(fake: FakeMarqueeNotificationDb): PrismaClient {
  return fake as unknown as PrismaClient
}

function sessionCookieHeader(): Record<string, string> {
  return { Cookie: sessionCookie(ADMIN_COOKIE_NAME, issueSession(config), config) }
}

const guardApp = express()
guardApp.use(express.json())
guardApp.use('/api/admin', adminRouter)
const guardServer = createServer(guardApp)
await new Promise<void>((resolve) => guardServer.listen(0, resolve))
const guardBase = `http://127.0.0.1:${(guardServer.address() as AddressInfo).port}/api/admin`

after(() => {
  guardServer.closeAllConnections()
  guardServer.close()
})

test('GET /api/admin/marquee-notifications requires an admin session', async () => {
  const response = await fetch(`${guardBase}/marquee-notifications`)
  assert.equal(response.status, 401)
})

test('POST /api/admin/marquee-notifications requires the CSRF header', async () => {
  const response = await fetch(`${guardBase}/marquee-notifications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...sessionCookieHeader() },
    body: JSON.stringify({ message: 'Welcome' }),
  })
  assert.equal(response.status, 403)
})

test('POST /api/admin/marquee-notifications requires an admin session', async () => {
  const response = await fetch(`${guardBase}/marquee-notifications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({ message: 'Welcome' }),
  })
  assert.equal(response.status, 401)
})

test('public marquee API returns only active messages in stable display order', async () => {
  const fake = new FakeMarqueeNotificationDb([
    {
      id: 'hidden-first',
      message: 'Hidden notice',
      isActive: false,
      sort: 0,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    {
      id: 'active-second',
      message: 'Second active notice',
      isActive: true,
      sort: 2,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
    {
      id: 'active-first',
      message: 'First active notice',
      isActive: true,
      sort: 1,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  ])
  const app = express()
  app.get('/api/marquee-notifications', makePublicMarqueeNotificationsHandler(asClient(fake)))
  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  try {
    const response = await fetch(`${base}/api/marquee-notifications`)
    assert.equal(response.status, 200)
    const body = (await response.json()) as Record<string, unknown>
    assert.deepStrictEqual(body, {
      notifications: [
        { id: 'active-first', message: 'First active notice' },
        { id: 'active-second', message: 'Second active notice' },
      ],
    })
    assert.deepStrictEqual(
      Object.keys((body.notifications as Array<Record<string, unknown>>)[0]).sort(),
      ['id', 'message']
    )
  } finally {
    server.closeAllConnections()
    server.close()
  }
})
