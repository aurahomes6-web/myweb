import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { adminConfig, issueSession, sessionCookie, ADMIN_COOKIE_NAME, type AdminConfig } from '../src/lib/adminAuth.js'
import {
  MANAGER_COOKIE_NAME,
  hashManagerPassword,
  issueManagerSession,
  managerSessionConfig,
  managerSessionCookie,
  verifyManagerPassword,
  verifyManagerSession,
  type ManagerSessionConfig,
} from '../src/lib/managerAuth.js'
import {
  DEFAULT_MANAGER_DISPLAY_NAME,
  DEFAULT_MANAGER_PASSWORD,
  DEFAULT_MANAGER_USERNAME,
  bootstrapManagerAccount,
  type ManagerUserDelegate,
} from '../src/lib/managerBootstrap.js'

/**
 * Regression coverage for the two causes of "Manager access is not set up yet.
 * Please contact the admin.":
 *
 *   1. MANAGER_SESSION_SECRET was missing, so every /api/manager call was 503.
 *   2. The `managerUser` table had no account, so login could never succeed.
 *
 * The bootstrap must also stay idempotent: re-running it may not create a second
 * account, rotate a password back, or re-activate a disabled manager.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const SERVER_ROOT = resolve(HERE, '..')

// ── in-memory `managerUser` delegate ─────────────────────────────────────────

interface StoredManager {
  id: string
  username: string
  passwordHash: string
  displayName: string
  isActive: boolean
}

function fakeManagerTable(seed: StoredManager[] = []) {
  const rows = [...seed]
  let nextId = rows.length + 1
  const calls = { findUnique: 0, create: 0, count: 0 }
  const delegate: ManagerUserDelegate = {
    findUnique: async ({ where }) => {
      calls.findUnique += 1
      const row = rows.find((candidate) => candidate.username === where.username)
      return row ? { id: row.id, isActive: row.isActive } : null
    },
    create: async ({ data }) => {
      calls.create += 1
      // The real table has a unique constraint on username.
      if (rows.some((candidate) => candidate.username === data.username)) {
        throw new Error('Unique constraint failed on the fields: (`username`)')
      }
      const row: StoredManager = { id: `mgr-${nextId++}`, ...data }
      rows.push(row)
      return { id: row.id, username: row.username, isActive: row.isActive }
    },
    count: async () => {
      calls.count += 1
      return rows.length
    },
  }
  return { delegate, rows, calls }
}

function managerAccount(overrides: Partial<StoredManager> = {}): StoredManager {
  return {
    id: 'mgr-1',
    username: 'manager',
    // A real scrypt hash of a rotated password, so "untouched" is observable.
    passwordHash:
      'scrypt$16384$8$1$00112233445566778899aabbccddeeff$fe1b0e0a2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7',
    displayName: 'Manager',
    isActive: true,
    ...overrides,
  }
}

const OPTIONS = {
  username: DEFAULT_MANAGER_USERNAME,
  password: DEFAULT_MANAGER_PASSWORD,
  displayName: DEFAULT_MANAGER_DISPLAY_NAME,
}

// ── configuration is recognised ──────────────────────────────────────────────

test('manager login is configured when MANAGER_SESSION_SECRET is present', () => {
  const configured = managerSessionConfig({ MANAGER_SESSION_SECRET: 'a-real-secret' })
  assert.ok(configured, 'a configured secret must be recognised')
  assert.ok((configured as ManagerSessionConfig).secret.length > 0)

  // A blank or absent secret is exactly the state that produced 503 at login.
  assert.equal(managerSessionConfig({}), null)
  assert.equal(managerSessionConfig({ MANAGER_SESSION_SECRET: '' }), null)
  assert.equal(managerSessionConfig({ MANAGER_SESSION_SECRET: '   ' }), null)
})

test('the manager session TTL from the environment is honoured', () => {
  const twelve = managerSessionConfig({ MANAGER_SESSION_SECRET: 's' }) as ManagerSessionConfig
  assert.equal(twelve.ttlMs, 12 * 60 * 60 * 1000)

  const custom = managerSessionConfig({
    MANAGER_SESSION_SECRET: 's',
    MANAGER_SESSION_TTL_HOURS: '8',
  }) as ManagerSessionConfig
  assert.equal(custom.ttlMs, 8 * 60 * 60 * 1000)
})

test('manager and admin sessions are signed by different secrets', () => {
  const manager = managerSessionConfig({
    MANAGER_SESSION_SECRET: 'manager-secret',
  }) as ManagerSessionConfig
  const admin = adminConfig({
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'admin-pass',
    ADMIN_SESSION_SECRET: 'admin-secret',
  }) as AdminConfig

  assert.notEqual(manager.secret, admin.secret)
  assert.notEqual(MANAGER_COOKIE_NAME, ADMIN_COOKIE_NAME)

  // A manager cookie must not be readable as an admin session and vice versa.
  const managerCookie = managerSessionCookie(issueManagerSession(manager, 'manager'), manager)
  assert.ok(!managerCookie.startsWith(`${ADMIN_COOKIE_NAME}=`))
  assert.ok(
    !sessionCookie(ADMIN_COOKIE_NAME, issueManagerSession(manager, 'manager'), admin).startsWith(
      `${MANAGER_COOKIE_NAME}=`
    )
  )
})

test('the deployment template documents the keys login needs', () => {
  // A fresh deploy that is missing these two keys is what produced the 503.
  const template = readFileSync(resolve(SERVER_ROOT, '.env.example'), 'utf8')
  assert.match(template, /^MANAGER_SESSION_SECRET=/m)
  assert.match(template, /^MANAGER_SESSION_TTL_HOURS=/m)
  assert.match(template, /^ADMIN_SESSION_SECRET=/m)

  const pkg = JSON.parse(readFileSync(resolve(SERVER_ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }
  assert.ok(pkg.scripts['db:manager-bootstrap'], 'the bootstrap must stay runnable via npm')
  // The general seed rewrites Property rows, so it must not be the manager path.
  assert.ok(pkg.scripts['db:seed'])
  assert.notEqual(pkg.scripts['db:manager-bootstrap'], pkg.scripts['db:seed'])
})

test('the schema still backs manager accounts with a unique username', () => {
  const schema = readFileSync(resolve(SERVER_ROOT, 'prisma', 'schema.prisma'), 'utf8')
  const block = schema.match(/model\s+ManagerUser\s*\{([^}]*)\}/)
  assert.ok(block, 'schema.prisma must still declare model ManagerUser')
  assert.match(block![1], /username\s+String\s+@unique/)
  assert.match(block![1], /passwordHash\s+String/)
  assert.match(block![1], /isActive\s+Boolean/)
})

// ── bootstrap creates the account ────────────────────────────────────────────

test('the bootstrap creates the account when the table is empty', async () => {
  const { delegate, rows, calls } = fakeManagerTable()

  const outcome = await bootstrapManagerAccount(delegate, OPTIONS)

  assert.equal(outcome.action, 'created')
  assert.equal(outcome.total, 1)
  assert.equal(rows.length, 1)
  assert.equal(calls.create, 1)
  assert.equal(rows[0].username, 'manager')
  assert.equal(rows[0].displayName, 'Manager')
  assert.equal(rows[0].isActive, true)
  // Stored as a scrypt hash, never as the plaintext password.
  assert.ok(rows[0].passwordHash.startsWith('scrypt$'))
  assert.ok(!rows[0].passwordHash.includes(DEFAULT_MANAGER_PASSWORD))
  assert.equal(verifyManagerPassword(DEFAULT_MANAGER_PASSWORD, rows[0].passwordHash), true)
})

test('a repeated bootstrap creates NO duplicate account', async () => {
  const { delegate, rows, calls } = fakeManagerTable()

  const first = await bootstrapManagerAccount(delegate, OPTIONS)
  const second = await bootstrapManagerAccount(delegate, OPTIONS)
  const third = await bootstrapManagerAccount(delegate, OPTIONS)

  assert.equal(first.action, 'created')
  assert.equal(second.action, 'existing')
  assert.equal(third.action, 'existing')
  // The whole point: three runs, one row, one insert.
  assert.equal(rows.length, 1)
  assert.equal(calls.create, 1)
  assert.equal(third.total, 1)
})

test('re-running the bootstrap never rotates a password back', async () => {
  const rotated = 'a-much-stronger-rotated-password'
  const stored = managerAccount()
  const rotatedHash = hashManagerPassword(rotated)
  stored.passwordHash = rotatedHash
  const { delegate, rows, calls } = fakeManagerTable([stored])

  const outcome = await bootstrapManagerAccount(delegate, {
    ...OPTIONS,
    password: DEFAULT_MANAGER_PASSWORD,
  })

  assert.equal(outcome.action, 'existing')
  assert.equal(calls.create, 0, 'an existing account must never be rewritten')
  assert.equal(rows[0].passwordHash, rotatedHash)
  assert.equal(verifyManagerPassword(rotated, rows[0].passwordHash), true)
  assert.equal(verifyManagerPassword(DEFAULT_MANAGER_PASSWORD, rows[0].passwordHash), false)
})

test('re-running the bootstrap never re-activates a disabled manager', async () => {
  const { delegate, rows, calls } = fakeManagerTable([managerAccount({ isActive: false })])

  const outcome = await bootstrapManagerAccount(delegate, OPTIONS)

  assert.equal(outcome.action, 'existing')
  assert.equal(outcome.isActive, false)
  assert.equal(calls.create, 0)
  assert.equal(rows[0].isActive, false, 'deactivation is a deliberate state, not an error')
})

test('a rotated display name is preserved, not reset to the default', async () => {
  const { delegate, rows, calls } = fakeManagerTable([managerAccount({ displayName: 'House Manager' })])

  await bootstrapManagerAccount(delegate, OPTIONS)

  assert.equal(calls.create, 0)
  assert.equal(rows[0].displayName, 'House Manager')
})

test('the bootstrap is keyed on username, so a second username is a second account', async () => {
  const { delegate, rows, calls } = fakeManagerTable()

  await bootstrapManagerAccount(delegate, OPTIONS)
  await bootstrapManagerAccount(delegate, { ...OPTIONS, username: 'night-manager' })

  assert.equal(rows.length, 2)
  assert.equal(calls.create, 2)
  assert.deepStrictEqual(
    rows.map((row) => row.username).sort(),
    ['manager', 'night-manager']
  )
})

test('a password that can never be typed at login is refused, not stored', async () => {
  for (const bad of ['', 'short', 'x'.repeat(200)]) {
    const { delegate, rows, calls } = fakeManagerTable()
    await assert.rejects(
      () => bootstrapManagerAccount(delegate, { ...OPTIONS, password: bad }),
      /6-128 characters/,
      `"${bad}" must be rejected`
    )
    assert.equal(rows.length, 0)
    assert.equal(calls.create, 0)
  }
})

test('a rejected password is caught before the table is even read', async () => {
  const { delegate, calls } = fakeManagerTable()
  await assert.rejects(() => bootstrapManagerAccount(delegate, { ...OPTIONS, password: 'no' }))
  assert.equal(calls.findUnique, 0)
  assert.equal(calls.count, 0)
})

// ── login configuration end to end ───────────────────────────────────────────

test('an account created by the bootstrap can immediately open a manager session', async () => {
  const { delegate, rows } = fakeManagerTable()
  await bootstrapManagerAccount(delegate, OPTIONS)

  const config = managerSessionConfig({
    MANAGER_SESSION_SECRET: 'manager-secret',
    MANAGER_SESSION_TTL_HOURS: '12',
  }) as ManagerSessionConfig

  // The credentials the bootstrap stored are the ones login checks.
  assert.equal(verifyManagerPassword(DEFAULT_MANAGER_PASSWORD, rows[0].passwordHash), true)

  const token = issueManagerSession(config, rows[0].username)
  const cookie = managerSessionCookie(token, config)
  assert.ok(cookie.startsWith(`${MANAGER_COOKIE_NAME}=`))
  assert.ok(cookie.includes('HttpOnly'))
  assert.ok(cookie.includes('Max-Age='))

  const payload = verifyManagerSession(config, token)
  assert.ok(payload)
  assert.equal(payload.sub, 'manager')
  assert.equal(payload.role, 'MANAGER')
})
