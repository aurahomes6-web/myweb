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