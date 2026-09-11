/**
 * API base URL for the AURA HOMES backend.
 *
 * Local development keeps this empty so the services below keep using the
 * relative `/api/...` paths, which the Vite dev server proxies to the local
 * Express API on http://localhost:3001 (see vite.config.ts).
 *
 * On Vercel, set the production frontend environment variable:
 *   VITE_API_URL=https://aura-homes-api-tau.vercel.app
 */
export const API_BASE_URL: string = `${import.meta.env.VITE_API_URL ?? ''}`.replace(/\/+$/, '')