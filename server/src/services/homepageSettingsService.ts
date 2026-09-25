import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '../generated/prisma/client.js'
import type { HomepageSettingsUpdateInput } from '../lib/homepageSettingsValidation.js'
import { assertValidHomepageImage } from '../lib/homepageImageValidation.js'
import type { ObjectStorage, StoredBlob } from '../storage/storage.js'
import { BadRequestError } from './adminService.js'

export interface HomepageSettingsDto {
  visualImageUrl: string | null
  visualImageAlt: string
}

export interface AdminHomepageSettingsDto extends HomepageSettingsDto {
  visualSource: 'custom' | 'fallback'
}

export class HomepageStorageError extends Error {
  override readonly name = 'HomepageStorageError' as const
}

export const DEFAULT_HOMEPAGE_SETTINGS = Object.freeze({
  visualImageUrl: '',
  visualImageAlt: 'Aura Cozy Penthouse — interior',
})

const SINGLE_ROW_ID = 'single'
const VISUAL_KEY_PREFIX = 'homepage/visual-'

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

interface HomepageSettingsRow {
  id: string
  visualImageUrl: string
  visualImageAlt: string
  createdAt: Date
  updatedAt: Date
}

function asRow(value: unknown): HomepageSettingsRow {
  return value as HomepageSettingsRow
}

function serialize(row: HomepageSettingsRow): HomepageSettingsDto {
  const visualImageUrl = row.visualImageUrl.trim()
  return {
    visualImageUrl: visualImageUrl.length > 0 ? visualImageUrl : null,
    visualImageAlt: row.visualImageAlt,
  }
}

function serializeAdmin(row: HomepageSettingsRow): AdminHomepageSettingsDto {
  const settings = serialize(row)
  return {
    ...settings,
    visualSource: settings.visualImageUrl ? 'custom' : 'fallback',
  }
}

export async function getHomepageSettingsRecord(client: PrismaClient): Promise<HomepageSettingsRow> {
  const row = await client.homepageSettings.findUnique({ where: { id: SINGLE_ROW_ID } })
  if (row) return asRow(row)
  return asRow(
    await client.homepageSettings.upsert({
      where: { id: SINGLE_ROW_ID },
      create: { id: SINGLE_ROW_ID, ...DEFAULT_HOMEPAGE_SETTINGS },
      update: {},
    })
  )
}

export async function getHomepageSettings(client: PrismaClient): Promise<HomepageSettingsDto> {
  return serialize(await getHomepageSettingsRecord(client))
}

export async function getAdminHomepageSettings(
  client: PrismaClient
): Promise<AdminHomepageSettingsDto> {
  return serializeAdmin(await getHomepageSettingsRecord(client))
}

export async function updateHomepageSettings(
  client: PrismaClient,
  input: HomepageSettingsUpdateInput
): Promise<AdminHomepageSettingsDto> {
  await client.homepageSettings.upsert({
    where: { id: SINGLE_ROW_ID },
    create: { id: SINGLE_ROW_ID, ...DEFAULT_HOMEPAGE_SETTINGS, ...input },
    update: input,
  })
  return getAdminHomepageSettings(client)
}

const MANAGED_VISUAL_KEY_PATTERN =
  /^homepage\/visual-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:avif|gif|jpe?g|png|webp)$/i

function isVercelBlobHost(hostname: string): boolean {
  const suffix = '.public.blob.vercel-storage.com'
  return hostname.endsWith(suffix) && /^[a-z0-9]+$/.test(hostname.slice(0, -suffix.length))
}

function isManagedVisualKey(key: string): boolean {
  return MANAGED_VISUAL_KEY_PATTERN.test(key)
}

function managedVisualLocation(url: string | null): { hostname: string; key: string } | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (
      parsed.protocol !== 'https:' ||
      parsed.port.length > 0 ||
      !isVercelBlobHost(parsed.hostname) ||
      parsed.username.length > 0 ||
      parsed.password.length > 0
    ) {
      return null
    }
    const key = parsed.pathname.replace(/^\/+/, '')
    return isManagedVisualKey(key) ? { hostname: parsed.hostname, key } : null
  } catch {
    return null
  }
}

async function deleteStoredVisual(storage: ObjectStorage, key: string): Promise<void> {
  if (!isManagedVisualKey(key)) return
  try {
    await storage.delete(key)
  } catch {
    console.error('[homepage] Failed to delete image blob.', { key })
  }
}

async function deleteExistingVisual(storage: ObjectStorage, url: string | null): Promise<void> {
  const expected = managedVisualLocation(url)
  if (!expected) return
  let ownedUrl: string | null
  try {
    if (!storage.getUrl) {
      console.error('[homepage] Skipped unverified image blob deletion.', { key: expected.key })
      return
    }
    ownedUrl = await storage.getUrl(expected.key)
  } catch {
    console.error('[homepage] Skipped unverified image blob deletion.', { key: expected.key })
    return
  }
  const owned = managedVisualLocation(ownedUrl)
  if (!owned || owned.hostname !== expected.hostname) {
    console.error('[homepage] Skipped unverified image blob deletion.', { key: expected.key })
    return
  }
  await deleteStoredVisual(storage, expected.key)
}

export async function uploadHomepageVisual(
  client: PrismaClient,
  storage: ObjectStorage,
  buffer: Buffer,
  contentType: string
): Promise<AdminHomepageSettingsDto> {
  if (buffer.length === 0) throw new BadRequestError('The uploaded homepage visual is empty.')
  const extension = MIME_EXTENSIONS[contentType]
  if (!extension) throw new BadRequestError('Only JPEG, PNG, WebP, GIF and AVIF images are allowed.')
  await assertValidHomepageImage(buffer, contentType)

  const key = `${VISUAL_KEY_PREFIX}${randomUUID()}.${extension}`
  let stored: StoredBlob
  try {
    stored = await storage.put(key, buffer, contentType)
  } catch {
    await deleteStoredVisual(storage, key)
    throw new HomepageStorageError(
      'Homepage image storage is unavailable. The previous visual stays active.'
    )
  }

  const returnedKey = typeof stored?.key === 'string' ? stored.key.trim() : ''
  const storedUrl = typeof stored?.url === 'string' ? stored.url.trim() : ''
  const storedLocation = managedVisualLocation(storedUrl)
  if (returnedKey !== key || !storedLocation || storedLocation.key !== returnedKey) {
    await deleteStoredVisual(storage, key)
    throw new HomepageStorageError(
      'Homepage image storage is not configured for persistent browser loading. The previous visual stays active.'
    )
  }

  let settings: AdminHomepageSettingsDto
  let previousVisualImageUrl: string | null
  try {
    const current = await getHomepageSettingsRecord(client)
    previousVisualImageUrl = current.visualImageUrl.trim() || null
    const updated = await client.homepageSettings.update({
      where: { id: SINGLE_ROW_ID },
      data: { visualImageUrl: storedUrl },
    })
    settings = serializeAdmin(asRow(updated))
  } catch (error) {
    await deleteStoredVisual(storage, returnedKey)
    throw error
  }

  await deleteExistingVisual(storage, previousVisualImageUrl)
  return settings
}

export async function resetHomepageVisual(
  client: PrismaClient,
  storage: ObjectStorage
): Promise<AdminHomepageSettingsDto> {
  const current = await getHomepageSettingsRecord(client)
  const previousVisualImageUrl = current.visualImageUrl.trim() || null
  const updated = await client.homepageSettings.update({
    where: { id: SINGLE_ROW_ID },
    data: { visualImageUrl: '' },
  })
  const settings = serializeAdmin(asRow(updated))
  await deleteExistingVisual(storage, previousVisualImageUrl)
  return settings
}
