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
process.env.ADMIN_USERNAME = 'payment-admin'
process.env.ADMIN_PASSWORD = 'payment-pass'
process.env.ADMIN_SESSION_SECRET = 'payment-secret-123'
process.env.NODE_ENV = 'development'

const { default: adminRouter } = await import('../src/routes/admin.js')
const config: AdminConfig = adminConfig(process.env) as AdminConfig

const app = express()
app.use(express.json())
app.use('/api/admin', adminRouter)

const server = createServer(app)
await new Promise<void>((resolve) => server.listen(0, resolve))
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin`

function sessionCookieHeader(): Record<string, string> {
  return { Cookie: sessionCookie(ADMIN_COOKIE_NAME, issueSession(config), config) }
}

const PAYMENTS_PATH = '/payments'

test('GET /api/admin/payments rejects requests without a valid admin session', async () => {
  const res = await fetch(`${base}${PAYMENTS_PATH}`)
  assert.equal(res.status, 401)
})

test('POST /api/admin/payments/:id/accept rejects requests without a session', async () => {
  const res = await fetch(`${base}${PAYMENTS_PATH}/booking-1/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({}),
  })
  assert.equal(res.status, 401)
})

test('POST /api/admin/payments/:id/accept rejects requests without the CSRF header', async () => {
  const res = await fetch(`${base}${PAYMENTS_PATH}/booking-1/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...sessionCookieHeader() },
    body: JSON.stringify({}),
  })
  assert.equal(res.status, 403)
})

test('POST /api/admin/payments/:id/reject rejects requests without the CSRF header', async () => {
  const res = await fetch(`${base}${PAYMENTS_PATH}/booking-1/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...sessionCookieHeader() },
    body: JSON.stringify({ rejectionMessage: 'UTR mismatch.' }),
  })
  assert.equal(res.status, 403)
})

test('POST /api/admin/payments/:id/reject validates the rejection message before touching data', async () => {
  const res = await fetch(`${base}${PAYMENTS_PATH}/booking-1/reject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...sessionCookieHeader(),
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ rejectionMessage: 'x'.repeat(501) }),
  })
  assert.equal(res.status, 400)
  const body = (await res.json()) as { error: string; details: Array<{ field: string }> }
  assert.equal(body.error, 'VALIDATION_ERROR')
  assert.deepStrictEqual(body.details.map((d) => d.field), ['rejectionMessage'])
})

test('teardown: stop the ephemeral server', () => {
  server.closeAllConnections()
  server.close()
})