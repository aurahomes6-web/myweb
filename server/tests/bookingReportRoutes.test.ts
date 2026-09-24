import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  ADMIN_COOKIE_NAME,
  adminConfig,
  issueSession,
  sessionCookie,
  type AdminConfig,
} from '../src/lib/adminAuth.js'

// Auth is built from env at route-module load time, so the test env must be
// set BEFORE importing the admin router.
process.env.ADMIN_USERNAME = 'report-admin'
process.env.ADMIN_PASSWORD = 'report-pass'
process.env.ADMIN_SESSION_SECRET = 'report-secret-123'
process.env.NODE_ENV = 'development'

const { default: adminRouter } = await import('../src/routes/admin.js')
const { makeBookingsReportHandler } = await import('../src/controllers/adminController.js')
const config: AdminConfig = adminConfig(process.env) as AdminConfig

// ── minimal in-memory Prisma stand-in for the handler ──────────────────────

class FakeReportDb {
  bookings: Array<Record<string, unknown>> = []
  booking: any = {
    count: async ({ where }: any = {}): Promise<number> => {
      const cond = where?.createdAt
      if (!cond) return this.bookings.length
      return this.bookings.filter((r) => {
        const value = r.createdAt as Date
        if (cond.gte && value < cond.gte) return false
        if (cond.lt && value >= cond.lt) return false
        return true
      }).length
    },
    findMany: async ({ where, include }: any = {}): Promise<unknown[]> => {
      const cond = where?.createdAt
      const rows = this.bookings.filter((r) => {
        if (!cond) return true
        const value = r.createdAt as Date
        if (cond.gte && value < cond.gte) return false
        if (cond.lt && value >= cond.lt) return false
        return true
      })
      return rows.map((r) => ({
        ...r,
        property: { id: 'prop-1', name: 'Aura Cozy Penthouse 1', slug: 'aura-cozy-penthouse-1', shortLabel: 'Penthouse 01' },
        guestRecords: include?.guestRecords ? [] : undefined,
      }))
    },
  }
}

const fakeDb = new FakeReportDb()

const app = express()
app.use(express.json())
app.use('/api/admin', adminRouter)
// Bare handler mount (no auth middleware) so the report RESPONSE shape can be
// exercised end-to-end against the fake; the auth guards are tested on the
// real router above.
app.get('/report', makeBookingsReportHandler(fakeDb as never))

const server = createServer(app)
await new Promise<void>((resolve) => server.listen(0, resolve))
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin`

function sessionCookieHeader(): Record<string, string> {
  return { Cookie: sessionCookie(ADMIN_COOKIE_NAME, issueSession(config), config) }
}

// ── auth + CSRF guards (real router, no DB touched) ────────────────────────

test('GET /api/admin/reports/bookings rejects requests without an admin session', async () => {
  const res = await fetch(`${base}/reports/bookings?from=2026-03-01&to=2026-03-31`)
  assert.equal(res.status, 401)
})

test('GET /api/admin/reports/bookings rejects a session without the CSRF header', async () => {
  const res = await fetch(`${base}/reports/bookings?from=2026-03-01&to=2026-03-31`, {
    headers: sessionCookieHeader(),
  })
  assert.equal(res.status, 403)
})

test('GET /api/admin/reports/bookings rejects an unauthenticated request even with the CSRF header', async () => {
  const res = await fetch(`${base}/reports/bookings?from=2026-03-01&to=2026-03-31`, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  })
  assert.equal(res.status, 401)
})

test('GET /api/admin/reports/bookings requires both range params', async () => {
  const res = await fetch(`${base}/reports/bookings?from=2026-03-01`, {
    headers: { ...sessionCookieHeader(), 'X-Requested-With': 'XMLHttpRequest' },
  })
  assert.equal(res.status, 400)
  const body = (await res.json()) as { error: string; details: Array<{ field: string }> }
  assert.equal(body.error, 'VALIDATION_ERROR')
  assert.deepStrictEqual(body.details.map((d) => d.field), ['to'])
})

test('GET /api/admin/reports/bookings rejects malformed dates', async () => {
  const res = await fetch(`${base}/reports/bookings?from=not-a-date&to=2026-31-02`, {
    headers: { ...sessionCookieHeader(), 'X-Requested-With': 'XMLHttpRequest' },
  })
  assert.equal(res.status, 400)
  const body = (await res.json()) as { error: string; details: Array<{ field: string }> }
  assert.equal(body.error, 'VALIDATION_ERROR')
  assert.deepStrictEqual(body.details.map((d) => d.field), ['from', 'to'])
})

test('GET /api/admin/reports/bookings rejects an inverted range', async () => {
  const res = await fetch(`${base}/reports/bookings?from=2026-03-31&to=2026-03-01`, {
    headers: { ...sessionCookieHeader(), 'X-Requested-With': 'XMLHttpRequest' },
  })
  assert.equal(res.status, 400)
  const body = (await res.json()) as { error: string; details: Array<{ field: string }> }
  assert.deepStrictEqual(body.details.map((d) => d.field), ['to'])
})

test('GET /api/admin/reports/bookings rejects an oversized range', async () => {
  const res = await fetch(`${base}/reports/bookings?from=2024-01-01&to=2026-12-31`, {
    headers: { ...sessionCookieHeader(), 'X-Requested-With': 'XMLHttpRequest' },
  })
  assert.equal(res.status, 400)
  const body = (await res.json()) as { error: string; details: Array<{ field: string }> }
  assert.deepStrictEqual(body.details.map((d) => d.field), ['to'])
})

// ── response shape (handler with fake client) ──────────────────────────────

test('report for an empty period returns a clear JSON empty marker (no file)', async () => {
  const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/report?from=2026-01-01&to=2026-01-31`)
  assert.equal(res.status, 200)
  const contentType = res.headers.get('Content-Type') ?? ''
  assert.ok(contentType.includes('application/json'), `expected JSON, got ${contentType}`)
  const body = (await res.json()) as { empty: boolean; message: string }
  assert.equal(body.empty, true)
  assert.equal(body.message, 'No bookings found for the selected period.')
})

test('report streams a real XLSX with the correct content type and filename', async () => {
  fakeDb.bookings.push({
    id: 'b1',
    code: 'AH-0001',
    checkIn: new Date('2026-03-10T00:00:00.000Z'),
    checkOut: new Date('2026-03-12T00:00:00.000Z'),
    guestCount: 2,
    primaryPhone: '+91 9000000001',
    notes: null,
    status: 'CONFIRMED',
    paymentStatus: 'PENDING',
    utr: 'UTR123456789',
    paymentSubmittedAt: new Date('2026-03-10T18:30:00.000Z'),
    paymentAcceptedAt: null,
    paymentRejectedAt: null,
    rejectionMessage: null,
    originalPricePaise: 600000,
    discountPaise: 60000,
    finalPricePaise: 540000,
    couponCode: 'AURA10',
    createdAt: new Date('2026-03-10T12:00:00.000Z'),
    updatedAt: new Date('2026-03-10T12:00:00.000Z'),
  })

  const res = await fetch(
    `http://127.0.0.1:${(server.address() as AddressInfo).port}/report?from=2026-03-01&to=2026-03-31`
  )
  assert.equal(res.status, 200)

  const contentType = res.headers.get('Content-Type') ?? ''
  assert.ok(
    contentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    `expected xlsx content type, got ${contentType}`
  )

  const disposition = res.headers.get('Content-Disposition') ?? ''
  assert.ok(
    disposition.includes('attachment') &&
      disposition.includes('filename="AURA_HOMES_BOOKINGS_2026-03-01_TO_2026-03-31.xlsx"'),
    `unexpected Content-Disposition: ${disposition}`
  )

  const bytes = Buffer.from(await res.arrayBuffer())
  assert.ok(bytes.length > 0, 'response body is not empty')
  assert.equal(bytes.slice(0, 2).toString('ascii'), 'PK', 'xlsx must be a zip container')
})

test('teardown: stop the ephemeral server', () => {
  server.closeAllConnections()
  server.close()
})