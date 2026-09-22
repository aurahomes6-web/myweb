import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '../generated/prisma/client.js'
import { PropertyImageKind } from '../generated/prisma/enums.js'
import { isBrowserLoadableUrl, type ObjectStorage } from '../storage/storage.js'
import { NotFoundError, BadRequestError } from './adminService.js'

/**
 * Property photo management (Phase 5).
 *
 * Admins upload photos per slot (main, sub1–sub3, extra). Files live in the
 * object-storage provider; the database keeps a lightweight index row with the
 * public URL and the provider key used for cleanup. Main/SUB slots are
 * single-owned (uploading a new one replaces the old row and blob); the `extra`
 * slot keeps an ordered list. Images never store binaries in Postgres and the
 * frontend never holds storage credentials.
 */

export type ImageSlot = 'main' | 'sub1' | 'sub2' | 'sub3' | 'extra'

const SLOT_KIND: Record<ImageSlot, PropertyImageKind> = {
  main: PropertyImageKind.MAIN,
  sub1: PropertyImageKind.SUB1,
  sub2: PropertyImageKind.SUB2,
  sub3: PropertyImageKind.SUB3,
  extra: PropertyImageKind.EXTRA,
}

const SLOTS = new Set<string>(Object.keys(SLOT_KIND))

export function parseImageSlot(value: unknown): ImageSlot | null {
  return typeof value === 'string' && SLOTS.has(value) ? (value as ImageSlot) : null
}

export function imageSlotLabel(slot: ImageSlot): string {
  return slot
}

export interface StoredPropertyImage {
  id: string
  kind: PropertyImageKind
  sort: number
  url: string
  alt: string
}

type PropertyImageRow = {
  id: string
  kind: PropertyImageKind
  sort: number
  url: string
  alt: string
}

function serializeImage(row: PropertyImageRow): StoredPropertyImage {
  return { id: row.id, kind: row.kind, sort: row.sort, url: row.url, alt: row.alt }
}

async function ensureProperty(client: PrismaClient, propertyId: string): Promise<void> {
  const property = await client.property.findUnique({ where: { id: propertyId }, select: { id: true } })
  if (!property) throw new NotFoundError('Property not found.')
}

function blobKey(propertyId: string, slot: ImageSlot): string {
  const folder = slot.toLowerCase()
  return `properties/${propertyId}/${folder}/${randomUUID()}`
}

/**
 * Store a photo for a property slot and record it. Uploading to a single-image
 * slot (main/sub1–sub3) replaces any previous image in that slot; uploading to
 * `extra` appends one more image. The provider blob of the replaced object is
 * cleaned up best-effort after the new one is live.
 */
export async function uploadPropertyImage(
  client: PrismaClient,
  storage: ObjectStorage,
  propertyId: string,
  slot: ImageSlot,
  buffer: Buffer,
  contentType: string,
  alt = ''
): Promise<StoredPropertyImage> {
  if (buffer.length === 0) throw new BadRequestError('The uploaded image is empty.')
  if (!/^image\//.test(contentType)) {
    throw new BadRequestError('Only image files are allowed.')
  }
  await ensureProperty(client, propertyId)

  const kind = SLOT_KIND[slot]
  let sort = 0

  const staleRows: Array<{ id: string; storageKey: string }> = []
  if (kind === PropertyImageKind.EXTRA) {
    const extras = await client.propertyImage.findMany({
      where: { propertyId, kind },
      select: { id: true, sort: true },
      orderBy: { sort: 'desc' },
    })
    sort = (extras[0]?.sort ?? 0) + 1
  } else {
    const existing = await client.propertyImage.findMany({
      where: { propertyId, kind, sort: 0 },
      select: { id: true, storageKey: true },
    })
    staleRows.push(...existing)
    // Drop the DB row first so the per-slot unique constraint never collides.
    for (const row of existing) {
      await client.propertyImage.delete({ where: { id: row.id } })
    }
  }

  let stored: { url: string; key: string }
  stored = await storage.put(blobKey(propertyId, slot), buffer, contentType)

  // Never persist a URL a browser cannot load (e.g. the dev-only `memory://`
  // scheme). If persistent object storage (Vercel Blob) is not configured,
  // fail the upload loudly instead of poisoning PropertyImage.url with a
  // broken image that the customer pages can never render.
  if (!isBrowserLoadableUrl(stored.url)) {
    throw new BadRequestError(
      'Image storage is not configured for browser loading. ' +
        'Set BLOB_READ_WRITE_TOKEN (Vercel Blob store) before uploading property photos.'
    )
  }

  const created = await client.propertyImage.create({
    data: { propertyId, kind, sort, url: stored.url, storageKey: stored.key, alt },
  })

  for (const row of staleRows) {
    await storage.delete(row.storageKey).catch((error: unknown) => {
      console.error(`[storage] failed to delete replaced image ${row.id}:`, error)
    })
  }

  return serializeImage(created)
}

export async function deletePropertyImage(
  client: PrismaClient,
  storage: ObjectStorage,
  propertyId: string,
  imageId: string
): Promise<{ deleted: true }> {
  const image = await client.propertyImage.findUnique({
    where: { id: imageId },
    select: { id: true, propertyId: true, storageKey: true },
  })
  if (!image) throw new NotFoundError('Image not found.')
  if (image.propertyId !== propertyId) throw new NotFoundError('Image not found.')

  await client.propertyImage.delete({ where: { id: imageId } })
  await storage.delete(image.storageKey).catch((error: unknown) => {
    console.error(`[storage] failed to delete object for image ${imageId}:`, error)
  })
  return { deleted: true }
}