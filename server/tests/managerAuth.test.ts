import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MANAGER_COOKIE_NAME,
  clearManagerSessionCookie,
  hashManagerPassword,
  isValidManagerPasswordShape,
  issueManagerSession,
  managerSessionConfig,
  managerSessionCookie,
  verifyManagerPassword,
  verifyManagerSession,
  type ManagerSessionConfig,
} from '../src/lib/managerAuth.js'
import { ADMIN_COOKIE_NAME, issueSession, sessionCookie } from '../src/lib/adminAuth.js'

const ENV = {
  MANAGER_SESSION_SECRET: 'manager-secret-abc',
  MANAGER_SESSION_TTL_HOURS: '6',
  NODE_ENV: 'production',
}

function config(): ManagerSessionConfig {
  return managerSessionConfig(ENV) as ManagerSessionConfig
}

// ── configuration ───────────────────────────────────────────────────────────

test('manager session config requires a signing secret', () => {
  assert.equal(managerSessionConfig({}), null)
  assert.equal(managerSessionConfig({ MANAGER_SESSION_SECRET: '   ' }), null)
  assert.ok(managerSessionConfig(ENV))
})

test('manager sessions honour the configured TTL and default to 12 hours', () => {
  assert.equal(config().ttlMs, 6 * 60 * 60 * 1000)
  const fallback = managerSessionConfig({ MANAGER_SESSION_SECRET: 'x' }) as ManagerSessionConfig
  assert.equal(fallback.ttlMs, 12 * 60 * 60 * 1000)
})

// ── password hashing ────────────────────────────────────────────────────────

test('passwords are stored as a salted scrypt hash, never as plaintext', () => {
  const hash = hashManagerPassword('manager')
  assert.ok(hash.startsWith('scrypt$'))
  assert.ok(!hash.includes('manager'))
  // Same password, different salt → different stored value.
  assert.notEqual(hash, hashManagerPassword('manager'))
  const [, n, r, p, salt, digest] = hash.split('$')
  assert.equal(n, '16384')
  assert.equal(r, '8')
  assert.equal(p, '1')
  assert.ok(salt.length === 32)
  assert.ok(digest.length > 0)
})

test('password verification accepts the right password and rejects everything else', () => {
  const hash = hashManagerPassword('manager')
  assert.equal(verifyManagerPassword('manager', hash), true)
  assert.equal(verifyManagerPassword('Manager', hash), false)
  assert.equal(verifyManagerPassword('manager ', hash), false)
  assert.equal(verifyManagerPassword('wrong', hash), false)
  assert.equal(verifyManagerPassword('', hash), false)
})

test('a malformed stored hash fails closed instead of throwing', () => {
  for (const bad of ['', 'plaintext', 'scrypt$1$2$3', 'bcrypt$1$2$3$4$5', 'scrypt$a$b$c$d$e']) {
    assert.equal(verifyManagerPassword('manager', bad), false, `"${bad}" must not verify`)
  }
})

test('password shape rules reject trivial credentials', () => {
  assert.equal(isValidManagerPasswordShape('manager'), true)
  assert.equal(isValidManagerPasswordShape('abc'), false)
  assert.equal(isValidManagerPasswordShape('x'.repeat(200)), false)
  assert.equal(isValidManagerPasswordShape(12345678 as unknown), false)
})

// ── session tokens ──────────────────────────────────────────────────────────

test('a manager session round-trips and expires', () => {
  const cfg = config()
  const now = Date.UTC(2026, 8, 25, 12)
  const token = issueManagerSession(cfg, 'manager', now)
  const payload = verifyManagerSession(cfg, token, now + 1000)
  assert.ok(payload)
  assert.equal(payload.sub, 'manager')
  assert.equal(payload.exp, now + cfg.ttlMs)

  assert.equal(verifyManagerSession(cfg, token, now + cfg.ttlMs + 1), null)
})

test('a manager token is rejected when tampered with or signed with another secret', () => {
  const cfg = config()
  const token = issueManagerSession(cfg, 'manager')
  const [body, signature] = token.split('.')

  assert.equal(verifyManagerSession(cfg, `${body}.${signature.slice(0, -1)}x`), null)
  assert.equal(verifyManagerSession(cfg, `${body}x.${signature}`), null)
  assert.equal(verifyManagerSession(cfg, 'not-a-token'), null)
  assert.equal(verifyManagerSession(cfg, ''), null)

  const other = managerSessionConfig({ MANAGER_SESSION_SECRET: 'different-secret' }) as ManagerSessionConfig
  assert.equal(verifyManagerSession(other, token), null)
})

test('a token carrying a tampered payload is rejected', () => {
  const cfg = config()
  const forged = [
    Buffer.from(JSON.stringify({ sub: 'admin', iat: Date.now(), exp: Date.now() + 10_000 })).toString('base64url'),
    '',
  ].join('.')
  assert.equal(verifyManagerSession(cfg, forged), null)
})

// ── separation from the admin session ───────────────────────────────────────

test('the manager cookie is a different name from the admin cookie', () => {
  assert.notEqual(MANAGER_COOKIE_NAME, ADMIN_COOKIE_NAME)
  assert.equal(MANAGER_COOKIE_NAME, 'aura_manager_session')
})

test('a manager session cookie can never be read as an admin session', () => {
  const managerToken = issueManagerSession(config(), 'manager')
  const cookieHeader = managerSessionCookie(managerToken, config())
  assert.ok(cookieHeader.startsWith(`${MANAGER_COOKIE_NAME}=`))
  // The admin verifier only ever looks at its own cookie name.
  assert.ok(!cookieHeader.startsWith(`${ADMIN_COOKIE_NAME}=`))
})

test('an admin session token does not verify as a manager session', () => {
  const adminConfig = { secret: 'manager-secret-abc', ttlMs: 1000, secure: false }
  const adminToken = issueSession(adminConfig as never)
  assert.equal(verifyManagerSession(config(), adminToken), null)
})

test('cookies are HttpOnly and Secure in production', () => {
  const production = managerSessionCookie('token', config())
  assert.ok(production.includes('HttpOnly'))
  assert.ok(production.includes('Secure'))
  assert.ok(production.includes('SameSite=None'))

  const dev = managerSessionConfig({ MANAGER_SESSION_SECRET: 'x', NODE_ENV: 'development' }) as ManagerSessionConfig
  const devCookie = managerSessionCookie('token', dev)
  assert.ok(!devCookie.includes('Secure'))
  assert.ok(devCookie.includes('SameSite=Lax'))

  const cleared = clearManagerSessionCookie(config())
  assert.ok(cleared.includes('Max-Age=0'))
  assert.ok(cleared.startsWith(`${MANAGER_COOKIE_NAME}=;`))
})

test('the admin cookie helper still works exactly as before', () => {
  // Guards against the shared helpers being broken by the manager module.
  const adminConfig = { username: 'a', password: 'b', secret: 's', ttlMs: 1000, secure: false }
  const cookie = sessionCookie(ADMIN_COOKIE_NAME, 'value', adminConfig as never)
  assert.ok(cookie.startsWith(`${ADMIN_COOKIE_NAME}=value`))
})
