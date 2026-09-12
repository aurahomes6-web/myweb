import crypto from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

/**
 * Stateless admin authentication.
 *
 * Credentials and a signing secret come from environment variables only — never
 * hard-coded. Successful login issues an HMAC-SHA256 signed, HttpOnly cookie
 * that carries its own expiry. Because the public site and the API live on
 * different origins, the cookie is SameSite=None + Secure in production and
 * every mutating admin request must send a custom header (CSRF defence).
 */

export interface AdminEnv {
  ADMIN_USERNAME?: unknown
  ADMIN_PASSWORD?: unknown
  ADMIN_SESSION_SECRET?: unknown
  ADMIN_SESSION_TTL_HOURS?: unknown
  NODE_ENV?: unknown
}

export interface AdminConfig {
  username: string
  password: string
  secret: string
  ttlMs: number
  secure: boolean
}

export const ADMIN_COOKIE_NAME = 'aura_admin_session'
export const ADMIN_CSRF_HEADER = 'x-requested-with'
export const DEFAULT_SESSION_TTL_HOURS = 12

export interface AdminSessionPayload {
  sub: string
  iat: number
  exp: number
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

/** Build the runtime config, or null when admin auth is not fully configured. */
export function adminConfig(env: AdminEnv): AdminConfig | null {
  const username = typeof env.ADMIN_USERNAME === 'string' && env.ADMIN_USERNAME.trim().length > 0
    ? env.ADMIN_USERNAME.trim()
    : null
  const password = typeof env.ADMIN_PASSWORD === 'string' && env.ADMIN_PASSWORD.trim().length > 0
    ? env.ADMIN_PASSWORD.trim()
    : null
  const secret = typeof env.ADMIN_SESSION_SECRET === 'string' && env.ADMIN_SESSION_SECRET.trim().length > 0
    ? env.ADMIN_SESSION_SECRET.trim()
    : null
  if (!username || !password || !secret) return null

  let ttlHours = DEFAULT_SESSION_TTL_HOURS
  if (typeof env.ADMIN_SESSION_TTL_HOURS === 'string') {
    const parsed = Number(env.ADMIN_SESSION_TTL_HOURS)
    if (Number.isFinite(parsed) && parsed > 0) ttlHours = parsed
  }

  return {
    username,
    password,
    secret,
    ttlMs: Math.round(ttlHours * 60 * 60 * 1000),
    secure: env.NODE_ENV === 'production',
  }
}

/** Constant-time string comparison (digests compared so length never leaks). */
export function safeEqual(a: string, b: string): boolean {
  const digestA = crypto.createHash('sha256').update(a).digest()
  const digestB = crypto.createHash('sha256').update(b).digest()
  return crypto.timingSafeEqual(digestA, digestB)
}

export function checkAdminCredentials(
  config: AdminConfig,
  username: unknown,
  password: unknown
): boolean {
  if (typeof username !== 'string' || typeof password !== 'string') return false
  return safeEqual(username, config.username) && safeEqual(password, config.password)
}

function signToken(secret: string, payload: AdminSessionPayload): string {
  const body = b64urlEncode(Buffer.from(JSON.stringify(payload)))
  const sig = b64urlEncode(crypto.createHmac('sha256', secret).update(body).digest())
  return `${body}.${sig}`
}

export function issueSession(config: AdminConfig, now: number = Date.now()): string {
  return signToken(config.secret, {
    sub: 'admin',
    iat: now,
    exp: now + config.ttlMs,
  })
}

export function verifySession(
  config: AdminConfig,
  token: unknown,
  now: number = Date.now()
): AdminSessionPayload | null {
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
  const session = payload as AdminSessionPayload
  if (session.sub !== 'admin') return null
  if (typeof session.exp !== 'number' || !Number.isFinite(session.exp)) return null
  if (session.exp <= now) return null
  if (typeof session.iat !== 'number') return null
  return session
}

export function sessionCookie(name: string, value: string, config: AdminConfig): string {
  const parts = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${Math.floor(config.ttlMs / 1000)}`,
    `SameSite=${config.secure ? 'None' : 'Lax'}`,
  ]
  if (config.secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookie(name: string, config: AdminConfig): string {
  const parts = [
    `${name}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    `SameSite=${config.secure ? 'None' : 'Lax'}`,
  ]
  if (config.secure) parts.push('Secure')
  return parts.join('; ')
}

/** Minimal, forgiving Cookie header parser (no dependency). */
export function readSessionCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie
  const out: Record<string, string> = {}
  if (typeof header !== 'string' || header.length === 0) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx <= 0) continue
    const name = part.slice(0, idx).trim()
    const raw = part.slice(idx + 1).trim()
    if (name.length === 0) continue
    try {
      out[name] = decodeURIComponent(raw)
    } catch {
      continue
    }
  }
  return out
}

export function getSessionToken(req: Request): string | undefined {
  return readSessionCookies(req)[ADMIN_COOKIE_NAME]
}

/**
 * Express middleware. Rejects requests that carry no valid admin session.
 * Valid sessions are exposed as `res.locals.admin`.
 */
export function requireAdmin(config: AdminConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = getSessionToken(req)
    const payload = verifySession(config, token)
    if (payload === null) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    res.locals.admin = payload
    next()
  }
}

/** Same as requireAdmin, but returns 503 when admin auth is unconfigured. */
export function requireConfiguredAdmin(config: AdminConfig | null) {
  if (config === null) {
    return (_req: Request, res: Response, _next: NextFunction): void => {
      res.status(503).json({ error: 'Admin authentication is not configured' })
    }
  }
  return requireAdmin(config)
}

/**
 * CSRF defence for mutating requests. Cross-origin HTML forms cannot send
 * custom headers, so every POST/PATCH/DELETE must carry the marker header.
 */
export function requireCsrfHeader(req: Request, res: Response, next: NextFunction): void {
  const header = (req.get(ADMIN_CSRF_HEADER) ?? '').toLowerCase()
  if (header !== 'xmlhttprequest') {
    res.status(403).json({ error: 'Forbidden' })
    return
  }
  next()
}

export function isMutatingMethod(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE'
}