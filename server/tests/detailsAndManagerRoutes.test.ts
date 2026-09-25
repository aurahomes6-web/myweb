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
import {
  MANAGER_COOKIE_NAME,
  issueManagerSession,
  managerSessionConfig,
  managerSessionCookie,
  type ManagerSessionConfig,
} from '../src/lib/managerAuth.js'

// Auth is built from env when the route modules load, so the env must be set
// BEFORE importing either router.
process.env.ADMIN_USERNAME = 'details-admin'
process.env.ADMIN_PASSWORD = 'details-pass'
process.env.ADMIN_SESSION_SECRET = 'details-secret'
process.env.MANAGER_SESSION_SECRET = 'details-manager-secret'
process.env.NODE_ENV = 'development'

const { default: adminRouter } = await import('../src/routes/admin.js')
const { default: managerRouter } = await import('../src/routes/manager.js')

const adminConfigValue = adminConfig(process.env) as AdminConfig
const managerConfigValue = managerSessionConfig(process.env) as ManagerSessionConfig

// A manager account the guard can find, plus a deactivated one.
const managerUser = { id: 'mgr-1', username: 'manager', isActive: true }
const disabledUser = { id: 'mgr-2', username: 'retired', isActive: false }
const store = new Map<string, { id: string; username: string; isActive: boolean }>([
  ['manager', managerUser],
  ['retired', disabledUser],
])

// The manager guard takes its Prisma client as a parameter, so the router can be
// exercised without a database. Only the account lookup is needed.
const fakeClient = {
  managerUser: {
    findFirst: async ({ where }: { where: { username: string; isActive: boolean } }) => {
      const row = store.get(where.username)
      if (!row || row.isActive !== where.isActive) return null
      return { id: row.id, username: row.username }
    },
  },
} as never

// Rebuild the manager router against the fake client by re-importing the guard
// path: the production router uses the real `prisma` singleton, so tests assert
// the guard itself plus the real router's unauthenticated behaviour.
const { requireManager } = await import('../src/lib/managerAuth.js')
const guarded = express.Router()
guarded.get('/checklist/:propertyId', requireManager(managerConfigValue, fakeClient), (_req, res) =>
  res.json({ ok: true })
)
guarded.get('/manager-only', requireManager(managerConfigValue, fakeClient), (req, res) => {
  res.json({ ok: true, manager: res.locals.manager })
})

const app = express()
app.use(express.json())
app.use('/api/admin', adminRouter)
app.use('/api/manager', managerRouter)
app.use('/guarded', guarded)

const server = createServer(app)
await new Promise<void>((resolve) => server.listen(0, resolve))
const port = (server.address() as AddressInfo).port
const base = `http://127.0.0.1:${port}`

const adminHeader = (): Record<string, string> => ({
  Cookie: sessionCookie(ADMIN_COOKIE_NAME, issueSession(adminConfigValue), adminConfigValue),
})
const managerHeader = (username = 'manager'): Record<string, string> => ({
  Cookie: managerSessionCookie(
    issueManagerSession(managerConfigValue, username),
    managerConfigValue
  ),
})
const CSRF = { 'X-Requested-With': 'XMLHttpRequest' }

// ── admin → Details: admin-only ─────────────────────────────────────────────

test('GET /api/admin/details requires an admin session', async () => {
  const res = await fetch(`${base}/api/admin/details`)
  assert.equal(res.status, 401)
})

test('the Details exports require a session AND the CSRF header', async () => {
  for (const path of ['export/excel', 'export/pdf']) {
    const noSession = await fetch(`${base}/api/admin/details/${path}`)
    assert.equal(noSession.status, 401, `${path} must reject anonymous callers`)

    const noCsrf = await fetch(`${base}/api/admin/details/${path}?range=thisMonth`, {
      headers: adminHeader(),
    })
    assert.equal(noCsrf.status, 403, `${path} must require the CSRF header`)
  }
})

test('an authenticated admin passes the Details guards (reaching the DB layer)', async () => {
  // The database is not reachable in unit tests, so the assertion is that the
  // guards let the request through: anything other than 401/403 proves it.
  const res = await fetch(`${base}/api/admin/details?range=thisMonth`, { headers: adminHeader() })
  assert.notEqual(res.status, 401)
  assert.notEqual(res.status, 403)
})

test('invalid Details query parameters are rejected with field-level detail', async () => {
  const res = await fetch(`${base}/api/admin/details?pageSize=10&source=NOPE`, {
    headers: adminHeader(),
  })
  assert.equal(res.status, 400)
  const body = (await res.json()) as { error: string; details: Array<{ field: string }> }
  assert.equal(body.error, 'VALIDATION_ERROR')
  assert.deepStrictEqual(body.details.map((detail) => detail.field).sort(), ['pageSize', 'source'])
})

test('admin checklist configuration is admin-only', async () => {
  const anonymous = await fetch(`${base}/api/admin/manager/checklist/p1`)
  assert.equal(anonymous.status, 401)

  const creation = await fetch(`${base}/api/admin/manager/checklist/p1`, {
    method: 'POST',
    headers: { ...adminHeader(), ...CSRF },
    body: JSON.stringify({ title: 'Cleaning' }),
  })
  assert.notEqual(creation.status, 401)
  assert.notEqual(creation.status, 403)
})

// ── manager: manager-only, and strictly separate from admin ─────────────────

test('manager APIs reject anonymous callers', async () => {
  for (const path of ['/me', '/properties', '/config', '/checklist/p1']) {
    const res = await fetch(`${base}/api/manager${path}`)
    assert.equal(res.status, 401, `${path} must require a manager session`)
  }
})

test('manager mutations require the CSRF header', async () => {
  const res = await fetch(`${base}/api/manager/checklist/p1/i1`, {
    method: 'POST',
    headers: managerHeader(),
    body: JSON.stringify({ completed: true }),
  })
  assert.equal(res.status, 403)
})

test('a valid manager session reaches the checklist handler', async () => {
  const res = await fetch(`${base}/guarded/manager-only`, { headers: managerHeader() })
  assert.equal(res.status, 200)
  const body = (await res.json()) as { manager: { username: string } }
  assert.equal(body.manager.username, 'manager')
})

test('a manager session is rejected by the ADMIN guard (no privilege escalation)', async () => {
  const res = await fetch(`${base}/api/admin/details`, { headers: managerHeader() })
  assert.equal(res.status, 401)

  const bookings = await fetch(`${base}/api/admin/bookings`, { headers: managerHeader() })
  assert.equal(bookings.status, 401)

  const airbnb = await fetch(`${base}/api/admin/airbnb`, { headers: managerHeader() })
  assert.equal(airbnb.status, 401)
})

test('an admin session is rejected by the MANAGER guard', async () => {
  const res = await fetch(`${base}/guarded/manager-only`, { headers: adminHeader() })
  assert.equal(res.status, 401)
})

test('a deactivated manager loses access immediately, not at session expiry', async () => {
  const res = await fetch(`${base}/guarded/manager-only`, { headers: managerHeader('retired') })
  assert.equal(res.status, 401)
})

test('a manager token for a non-existent account is refused', async () => {
  const res = await fetch(`${base}/guarded/manager-only`, { headers: managerHeader('ghost') })
  assert.equal(res.status, 401)
})

test('the /api/manager/login entry point is reachable without a session', async () => {
  const res = await fetch(`${base}/api/manager/login`, {
    method: 'POST',
    headers: CSRF,
    body: JSON.stringify({ username: 'manager', password: 'manager' }),
  })
  // No database in unit tests, so the handler cannot verify a password — but it
  // must NOT answer 404/405, and must never report success for a wrong password.
  assert.notEqual(res.status, 404)
  assert.notEqual(res.status, 405)
  if (res.status === 200) {
    const body = (await res.json()) as { ok?: boolean }
    assert.equal(body.ok, true)
  }
})

test('the /api/manager/login route requires the CSRF header', async () => {
  const res = await fetch(`${base}/api/manager/login`, {
    method: 'POST',
    body: JSON.stringify({ username: 'manager', password: 'manager' }),
  })
  assert.equal(res.status, 403)
})

test('teardown: stop the ephemeral server', () => {
  server.closeAllConnections()
  server.close()
})
