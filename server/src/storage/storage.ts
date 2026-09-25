import { del, head, put } from '@vercel/blob'

/**
 * Persistent object storage for property photos, isolated behind `ObjectStorage`
 * so providers can be swapped without touching controllers/services.
 *
 * The server holds all credentials (never shipped to the client). The default
 * provider is Vercel Blob (the canonical persistent store for this Vercel
 * deployment). `BLOB_READ_WRITE_TOKEN` is REQUIRED for persistent uploads —
 * it is what makes a stored URL durable and browser-loadable.
 *
 * When `BLOB_READ_WRITE_TOKEN` is absent — local dev, previews, unit tests — a
 * process-local `MemoryStorage` is used only so the code paths still run. It is
 * NOT persistent: blobs reset on restart, are not shared across instances, and
 * its `memory://` URLs are not browser-loadable. The image service refuses to
 * store those URLs in PostgreSQL, so a missing token produces a clear error at
 * upload time instead of silently corrupting `PropertyImage.url`. PostgreSQL
 * stores only the public URL + storage key, never image binaries.
 */

export const BLOB_TOKEN_ENV = 'BLOB_READ_WRITE_TOKEN'

export interface StoredBlob {
  /** Public, stable URL for browsers. */
  url: string
  /** Provider key (used to delete the object). */
  key: string
}

export interface ObjectStorage {
  put(key: string, buffer: Buffer, contentType: string): Promise<StoredBlob>
  getUrl?(key: string): Promise<string | null>
  delete(key: string): Promise<void>
}

/**
 * True when a URL can be dropped straight into a customer-facing <img>.
 * Persistent object stores (Vercel Blob) return absolute `https` URLs; a
 * leading-slash path (e.g. `/uploads/...`) is also acceptable. Custom schemes
 * like `memory://` are not browser-loadable and must never be persisted as
 * `PropertyImage.url`.
 */
export function isBrowserLoadableUrl(url: string): boolean {
  return /^(https?:|data:|blob:)/i.test(url) || url.startsWith('/')
}

function blobFromBuffer(buffer: Buffer, contentType: string): Blob {
  return new Blob([new Uint8Array(buffer)], { type: contentType })
}

export class VercelBlobStorage implements ObjectStorage {
  constructor(private readonly token: string) {}

  async put(key: string, buffer: Buffer, contentType: string): Promise<StoredBlob> {
    const blob = await put(key, blobFromBuffer(buffer, contentType), {
      access: 'public',
      token: this.token,
      addRandomSuffix: false,
    })
    return { url: blob.url, key: blob.pathname.replace(/^\//, '') }
  }

  async getUrl(key: string): Promise<string | null> {
    try {
      const blob = await head(key.replace(/^\//, ''), { token: this.token })
      return blob.url
    } catch {
      return null
    }
  }

  async delete(key: string): Promise<void> {
    await del(key.replace(/^\//, ''), { token: this.token })
  }
}

/** Process-local store used when no blob token is configured (dev/tests). */
export class MemoryStorage implements ObjectStorage {
  private readonly objects = new Map<string, { url: string; key: string }>()
  private counter = 0

  async put(key: string, _buffer: Buffer, _contentType: string): Promise<StoredBlob> {
    this.counter += 1
    const stored = { url: `memory://${key}?v=${this.counter}`, key }
    this.objects.set(key, stored)
    return stored
  }

  async getUrl(key: string): Promise<string | null> {
    return this.objects.get(key)?.url ?? null
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key)
  }

  has(key: string): boolean {
    return this.objects.has(key)
  }
}

let cachedStorage: ObjectStorage | null = null

export function getObjectStorage(env: Record<string, string | undefined> = process.env): ObjectStorage {
  if (cachedStorage) return cachedStorage
  const token = typeof env[BLOB_TOKEN_ENV] === 'string' ? env[BLOB_TOKEN_ENV].trim() : ''
  if (token.length === 0) {
    console.warn(
      `[storage] ${BLOB_TOKEN_ENV} is not configured — falling back to non-persistent in-memory storage. ` +
        'Uploaded property photos will error on save because their URLs cannot be made browser-loadable. ' +
        `Set ${BLOB_TOKEN_ENV} (Vercel Blob) in local development and on Vercel for persistent uploads.`
    )
  }
  cachedStorage = token.length > 0 ? new VercelBlobStorage(token) : new MemoryStorage()
  return cachedStorage
}