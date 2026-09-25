import crypto from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import type { PrismaClient } from '../generated/prisma/client.js'
import {
  clearSessionCookie,
  readSessionCookies,
  safeEqual,
  sessionCookie,
} from './adminAuth.js'

/**
 * Manager authentication — deliberately SEPARATE from `adminAuth.ts`.
 *
 * The admin panel is guarded by env-issued admin credentials
 * (`ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_SESSION_SECRET`) and reads the
 * `aura_admin_session` cookie. Managers use their own cookie
 * (`aura_manager_session`) signed with `MANAGER_SESSION_SECRET` and a real
 * credential check against the `ManagerUser` table, so:
 *
 *   - a manager session can never satisfy `requireAdmin` (different cookie name,
 *     different secret, different `sub`), and
 *   - an admin session can never satisfy `requireManager`.
 *
 * Passwords are stored as `scrypt$N$r$p$saltHex$hashHex`. No plaintext is ever
 * persisted, logged, or returned by an API.
 */

export const MANAGER_COOKIE_NAME = 'aura_manager_session'
/** The marker header required on mutating manager requests (see adminAuth). */
export const MANAGER_CSRF_HEADER = 'x-requested-with'

const SCRYPT_N = 16_384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LENGTH = 32

export const MIN_MANAGER_PASSWORD_LENGTH = 6
export const MAX_MANAGER_PASSWORD_LENGTH = 128

export interface ManagerEnv {
  MANAGER_SESSION_SECRET?: unknown
  MANAGER_SESSION_TTL_HOURS?: unknown
  NODE_ENV?: unknown
}

export interface ManagerSessionConfig {
  secret: string
  ttlMs: number
  secure: boolean
}

export interface ManagerSessionPayload {
  sub: string
  /** Hard role marker: a token without it is never a manager session. */
  role: 'MANAGER'
  iat: number
  exp: number
}

/** The authenticated principal exposed to controllers as `res.locals.manager`. */
export interface ManagerPrincipal {
  id: string
  username: string
}

const DEFAULT_SESSION_TTL_HOURS = 12

export function managerSessionConfig(env: ManagerEnv): ManagerSessionConfig | null {
  const secret =
    typeof env.MANAGER_SESSION_SECRET === 'string' && env.MANAGER_SESSION_SECRET.trim().length > 0
      ? env.MANAGER_SESSION_SECRET.trim()
      : null
  if (!secret) return null

  let ttlHours = DEFAULT_SESSION_TTL_HOURS
  if (typeof env.MANAGER_SESSION_TTL_HOURS === 'string') {
    const parsed = Number(env.MANAGER_SESSION_TTL_HOURS)
    if (Number.isFinite(parsed) && parsed > 0) ttlHours = parsed
  }

  return {
    secret,
    ttlMs: Math.round(ttlHours * 60 * 60 * 1000),
    secure: env.NODE_ENV === 'production',
  }
}

export function isValidManagerPasswordShape(password: unknown): password is string {
  return (
    typeof password === 'string' &&
    password.length >= MIN_MANAGER_PASSWORD_LENGTH &&
    password.length <= MAX_MANAGER_PASSWORD_LENGTH
  )
}

/** Hash a manager password with scrypt + a random 16-byte salt. */
export function hashManagerPassword(password: string): string {
  const salt = crypto.randomBytes(16)
  const derived = crypto.scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('hex'),
    derived.toString('hex'),
  ].join('$')
}

/**
 * Constant-time verification of a stored scrypt hash. Returns false (never
 * throws) for malformed or legacy-shaped rows so a bad row can never crash
 * login.
 */
export function verifyManagerPassword(password: string, storedHash: string): boolean {
  if (typeof password !== 'string' || typeof storedHash !== 'string') return false
  const parts = storedHash.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const n = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false

  let salt: Buffer
  let expected: Buffer
  try {
    salt = Buffer.from(parts[4], 'hex')
    expected = Buffer.from(parts[5], 'hex')
  } catch {
    return false
  }
  if (salt.length === 0 || expected.length === 0) return false

  let derived: Buffer
  try {
    derived = crypto.scryptSync(password, salt, expected.length, { N: n, r, p })
  } catch {
    return false
  }
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected)
}

function b64urlEncode(buffer: Buffer): string {
  return buffer.toString('base64url')
}

function b64urlDecode(value: string): Buffer | null {
  try {
    return Buffer.from(value, 'base64url')
  } catch {
    return null
  }
}

function signToken(secret: string, payload: ManagerSessionPayload): string {
  const body = b64urlEncode(Buffer.from(JSON.stringify(payload)))
  const sig = b64urlEncode(crypto.createHmac('sha256', secret).update(body).digest())
  return `${body}.${sig}`
}

export function issueManagerSession(
  config: ManagerSessionConfig,
  username: string,
  now: number = Date.now()
): string {
  return signToken(config.secret, {
    sub: username,
    role: 'MANAGER',
    iat: now,
    exp: now + config.ttlMs,
  })
}

export function verifyManagerSession(
  config: ManagerSessionConfig,
  token: unknown,
  now: number = Date.now()
): ManagerSessionPayload | null {
  if (typeof token !== 'string') return null
  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)

  const expectedSig = b64urlEncode(crypto.createHmac('sha256', config.secret).update(body).digest())
  if (!safeEqual(sig, expectedSig)) return null

  const raw = b64urlDecode(body)
  if (raw === null) return null
  let payload: unknown
  try {
    payload = JSON.parse(raw.toString('utf8'))
  } catch {
    return null
  }
  if (typeof payload !== 'object' || payload === null) return null
  const session = payload as ManagerSessionPayload
  if (typeof session.sub !== 'string' || session.sub.length === 0) return null
  // The role marker is what makes an admin token (which carries sub 'admin'
  // and no role) structurally invalid here, even if both sides were ever
  // configured with the same secret.
  if (session.role !== 'MANAGER') return null
  if (typeof session.exp !== 'number' || !Number.isFinite(session.exp)) return null
  if (session.exp <= now) return null
  if (typeof session.iat !== 'number' || !Number.isFinite(session.iat)) return null
  return session
}

export function getManagerSessionToken(req: Request): string | undefined {
  return readSessionCookies(req)[MANAGER_COOKIE_NAME]
}

export function managerSessionCookie(value: string, config: ManagerSessionConfig): string {
  return sessionCookie(MANAGER_COOKIE_NAME, value, {
    // sessionCookie only needs ttlMs/secure from an AdminConfig-shaped object.
    username: '',
    password: '',
    secret: config.secret,
    ttlMs: config.ttlMs,
    secure: config.secure,
  })
}

export function clearManagerSessionCookie(config: ManagerSessionConfig): string {
  return clearSessionCookie(MANAGER_COOKIE_NAME, {
    username: '',
    password: '',
    secret: config.secret,
    ttlMs: config.ttlMs,
    secure: config.secure,
  })
}

/**
 * CSRF guard for manager mutations. Identical policy to the admin side (the
 * `X-Requested-With` marker header) so a cross-origin form post cannot drive
 * checklist or report actions.
 */
export function requireManagerCsrfHeader(req: Request, res: Response, next: NextFunction): void {
  const header = (req.get(MANAGER_CSRF_HEADER) ?? '').toLowerCase()
  if (header !== 'xmlhttprequest') {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}

/**
 * Manager session guard. Verifies the signed cookie AND re-reads the account so
 * a deactivated or deleted manager loses access immediately rather than at the
 * end of the session TTL. Never falls back to the admin cookie.
 */
export function requireManager(config: ManagerSessionConfig | null, client: PrismaClient) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (config === null) {
      res.status(503).json({ error: 'Manager authentication is not configured' })
      return
    }

    const payload = verifyManagerSession(config, getManagerSessionToken(req))
    if (payload === null) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    let account: { id: string; username: string } | null
    try {
      account = await client.managerUser.findFirst({
        where: { username: payload.sub, isActive: true },
        select: { id: true, username: true },
      })
    } catch {
      res.status(503).json({ error: 'Manager authentication is not configured' })
      return
    }
    if (!account) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    res.locals.manager = { id: account.id, username: account.username } satisfies ManagerPrincipal
    next()
  }
}

/** Read the principal attached by `requireManager`. */
export function currentManager(res: Response): ManagerPrincipal | null {
  const value = res.locals.manager as ManagerPrincipal | undefined
  return value ?? null
}
