/**
 * API base URL for the AURA HOMES backend.
 *
 * Local development keeps this empty so the services below keep using the
 * relative `/api/...` paths, which the Vite dev server proxies to the local
 * Express API on http://localhost:3001 (see vite.config.ts).
 *
 * Production builds default to the canonical backend deployment:
 *   https://aura-homes-api-taupe.vercel.app
 *
 * To override the default per deployment, set the frontend build-time
 * environment variable (Vite inlines VITE_* values when the site is built):
 *   VITE_API_URL=https://aura-homes-api-taupe.vercel.app
 */
const ENV_API_URL: string = `${import.meta.env.VITE_API_URL ?? ''}`.replace(/\/+$/, '')
const PROD_API_URL = 'https://aura-homes-api-taupe.vercel.app'

export const API_BASE_URL: string = ENV_API_URL || (import.meta.env.PROD ? PROD_API_URL : '')

/**
 * Resolve an image URL returned by the API into something a browser <img> can
 * load.
 *
 * - Absolute http(s)/data/blob URLs pass through unchanged (e.g. Vercel Blob).
 * - Leading-slash paths (like `/uploads/...`) are rebased onto the API origin,
 *   matching how services already call `${API_BASE_URL}/api/...`. When the API
 *   is same-origin (dev: Vite proxies `/api`), the relative path is kept as-is.
 * - Unresolvable storage URLs (e.g. the dev-only `memory://` scheme, whose
 *   bytes exist only inside the server process and are never served) return
 *   null so callers fall back to the static artwork instead of a broken <img>.
 */
export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const trimmed = `${url}`.trim()
  if (!trimmed) return null
  if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed
  if (trimmed.startsWith('/') || trimmed.startsWith('./')) {
    const path = trimmed.startsWith('./') ? trimmed.slice(1) : trimmed
    return API_BASE_URL ? `${API_BASE_URL}${path}` : path
  }
  return null
}