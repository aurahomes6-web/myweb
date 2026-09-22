import { config as loadDotenv } from 'dotenv'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Local environment loader for the Express backend.
 *
 * Loads `server/.env` (base config) exactly like the previous `dotenv/config`
 * import, then also loads `server/.env.local` — the file `vercel env pull`
 * writes with the Vercel Blob credentials (BLOB_READ_WRITE_TOKEN,
 * BLOB_STORE_ID, BLOB_WEBHOOK_PUBLIC_KEY). Plain `dotenv/config` never reads
 * `.env.local`, which is why localhost kept falling back to MemoryStorage.
 *
 * Rules:
 * - `.env.local` is machine-local and overrides nothing that is already set in
 *   `process.env`, so Vercel platform environment variables (production) and
 *   any externally exported vars always win — production behavior is unchanged.
 * - `.env.local` may contain multi-line double-quoted values (e.g. the PEM
 *   BLOB_WEBHOOK_PUBLIC_KEY that the Vercel CLI writes), which dotenv v16
 *   cannot parse. `parseLocalEnv` handles them, plus `export KEY=...` lines,
 *   blank/comment lines and single/double quoting.
 * - Malformed lines are skipped with a line number only — secret values are
 *   never printed.
 */

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const DOT_ENV_PATH = path.join(SERVER_DIR, '.env')
const DOT_ENV_LOCAL_PATH = path.join(SERVER_DIR, '.env.local')

/** Strip a single pair of surrounding quotes when present. */
function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1)
    }
  }
  return value
}

/**
 * Tolerant dotenv-file parser for `.env.local`. Unlike `dotenv.parse` (v16) it
 * accepts multi-line double-quoted values: when a value starts with a quote but
 * the line does not end with it, following lines are joined with `\n` until the
 * closing quote is found.
 */
export function parseLocalEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  const lines = text.split(/\r?\n/)

  for (let i = 0; i < lines.length; i += 1) {
    let line = i === 0 && lines[0].charCodeAt(0) === 0xfeff ? lines[0].slice(1) : lines[i]

    line = line.replace(/^\s*export\s+/, '')

    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eq = line.indexOf('=')
    if (eq < 0) {
      console.warn(`[env] ${path.basename(DOT_ENV_LOCAL_PATH)}:${i + 1}: skipping malformed line`)
      continue
    }

    const key = line.slice(0, eq).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(key)) {
      console.warn(`[env] ${path.basename(DOT_ENV_LOCAL_PATH)}:${i + 1}: skipping invalid key`)
      continue
    }

    let value = line.slice(eq + 1).trim()
    const startsQuoted = value.startsWith('"') || value.startsWith("'")
    const closesQuoted =
      value.startsWith('"') || value.startsWith("'")
        ? value.endsWith(value[0])
        : false

    if (startsQuoted && !closesQuoted) {
      const quote = value[0]
      while (i + 1 < lines.length) {
        i += 1
        value += `\n${lines[i]}`
        if (lines[i].trimEnd().endsWith(quote)) break
      }
      value = value.trim()
    }

    value = stripQuotes(value)

    // Unquoted values end at an inline comment (must be preceded by whitespace).
    if (!startsQuoted) {
      const commentAt = value.search(/\s+#/)
      if (commentAt !== -1) value = value.slice(0, commentAt).trimEnd()
    }

    out[key] = value
  }

  return out
}

export function loadEnv(): void {
  loadDotenv({ path: DOT_ENV_PATH })

  if (existsSync(DOT_ENV_LOCAL_PATH)) {
    const parsed = parseLocalEnv(readFileSync(DOT_ENV_LOCAL_PATH, 'utf8'))
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) process.env[key] = value
    }
  }
}

loadEnv()