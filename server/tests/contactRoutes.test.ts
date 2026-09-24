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
process.env.ADMIN_USERNAME = 'contact-admin'
process.env.ADMIN_PASSWORD = 'contact-pass'
process.env.ADMIN_SESSION_SECRET = 'contact-secret-123'
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

const CONTACT_PATH = '/contact'

test('GET /api/admin/contact rejects requests without a valid admin session', async () => {
  const res = await fetch(`${base}${CONTACT_PATH}`)
  assert.equal(res.status, 401)
})

test('PUT /api/admin/contact rejects requests without the CSRF header', async () => {
  const res = await fetch(`${base}${CONTACT_PATH}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...sessionCookieHeader() },
    body: JSON.stringify({
      email: 'bookings@aurahomes.com',
      phone: '+91 98765 43210',
      description: 'Private rooftop stays in Bengaluru',
    }),
  })
  assert.equal(res.status, 403)
})

test('PUT /api/admin/contact rejects requests without a valid admin session', async () => {
  const res = await fetch(`${base}${CONTACT_PATH}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({
      email: 'bookings@aurahomes.com',
      phone: '+91 98765 43210',
      description: 'Private rooftop stays in Bengaluru',
    }),
  })
  assert.equal(res.status, 401)
})

test('PUT /api/admin/contact validates fields server-side', async () => {
  const headers = {
    ...sessionCookieHeader(),
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/json',
  }

  const invalid = await fetch(`${base}${CONTACT_PATH}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ email: 'nope', phone: '', description: '' }),
  })
  assert.equal(invalid.status, 400)
  const invalidBody = (await invalid.json()) as { error: string; details: Array<{ field: string; message: string }> }
  assert.equal(invalidBody.error, 'VALIDATION_ERROR')
  assert.deepStrictEqual(invalidBody.details.map((d) => d.field).sort(), ['description', 'email', 'phone'])

  const missingBody = await fetch(`${base}${CONTACT_PATH}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ email: 'bookings@aurahomes.com' }),
  })
  assert.equal(missingBody.status, 400)
  const missing = (await missingBody.json()) as { error: string }
  assert.equal(missing.error, 'VALIDATION_ERROR')
})

test('teardown: stop the ephemeral server', () => {
  server.closeAllConnections()
  server.close()
})