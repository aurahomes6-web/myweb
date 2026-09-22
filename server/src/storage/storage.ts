import { del, put } from '@vercel/blob'

/**
 * Persistent object storage for property photos, isolated behind `ObjectStorage`
 * so providers can be swapped without touching controllers/services.
 *
 * The server holds all credentials (never shipped to the client). The default
 * provider is Vercel Blob (the canonical persistent store for this Vercel
 * deployment); when `BLOB_READ_WRITE_TOKEN` is absent — local dev, previews,
 * unit tests — a process-local `MemoryStorage` keeps everything working without
 * touching the filesystem, with the documented limitation that blobs reset on
 * restart. PostgreSQL stores only the public URL + storage key, never image
 * binaries.
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
  delete(key: string): Promise<void>
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
  cachedStorage = token.length > 0 ? new VercelBlobStorage(token) : new MemoryStorage()
  return cachedStorage
}