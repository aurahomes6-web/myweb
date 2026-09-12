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
process.env.ADMIN_USERNAME = 'cleanup-admin'
process.env.ADMIN_PASSWORD = 'cleanup-pass'
process.env.ADMIN_SESSION_SECRET = 'cleanup-secret-123'
process.env.NODE_ENV = 'development'

const { default: adminRouter } = await import('../src/routes/admin.js')
const config: AdminConfig = adminConfig(process.env) as AdminConfig

const app = express()
app.use(express.json())
app.use('/api/admin', adminRouter)

const server = createServer(app)
await new Promise<void>((resolve) => server.listen(0, resolve))
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin`

const CLEANUP_PATHS = [
  '/cleanup/bookings',
  '/cleanup/airbnb',
  '/cleanup/blocked-dates',
  '/cleanup/all',
]

function sessionCookieHeader(): Record<string, string> {
  return { Cookie: sessionCookie(ADMIN_COOKIE_NAME, issueSession(config), config) }
}

test('every cleanup route rejects requests without the CSRF header', async () => {
  for (const path of CLEANUP_PATHS) {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...sessionCookieHeader() },
      body: JSON.stringify({ confirm: 'DELETE' }),
    })
    assert.equal(res.status, 403, `${path} must be CSRF-protected`)
  }
})

test('every cleanup route rejects requests without a valid admin session', async () => {
  for (const path of CLEANUP_PATHS) {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    })
    assert.equal(res.status, 401, `${path} must require an admin session`)
  }
})

test('cleanup handlers demand the exact confirmation phrase before touching data', async () => {
  const headers = { ...sessionCookieHeader(), 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' }

  const wrongPhrase = await fetch(`${base}${CLEANUP_PATHS[0]}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ confirm: 'WRONG' }),
  })
  assert.equal(wrongPhrase.status, 400)
  const wrongBody = (await wrongPhrase.json()) as { error: string }
  assert.equal(wrongBody.error, 'INVALID_CONFIRMATION')

  const missingPhrase = await fetch(`${base}${CLEANUP_PATHS[3]}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ confirm: '' }),
  })
  assert.equal(missingPhrase.status, 400)
  const missingBody = (await missingPhrase.json()) as { error: string }
  assert.equal(missingBody.error, 'INVALID_CONFIRMATION')
})

test('teardown: stop the ephemeral server', () => {
  server.closeAllConnections()
  server.close()
})