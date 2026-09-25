import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PrismaClient } from '../src/generated/prisma/client.js'
import { parseHomepageSettingsUpdate } from '../src/lib/homepageSettingsValidation.js'
import {
  DEFAULT_HOMEPAGE_SETTINGS,
  getHomepageSettings,
  getHomepageSettingsRecord,
  resetHomepageVisual,
  updateHomepageSettings,
  uploadHomepageVisual,
} from '../src/services/homepageSettingsService.js'
import type { ObjectStorage, StoredBlob } from '../src/storage/storage.js'

type Row = Record<string, unknown>

const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==',
  'base64'
)

function matches(where: Record<string, unknown> | undefined, row: Row): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, value]) => row[key] === value)
}

class FakeHomepageSettingsDb {
  rows: Row[] = []
  events: string[] = []
  failUpdates = false

  get propertyImage(): never {
    throw new Error('Homepage settings must not access PropertyImage')
  }

  homepageSettings: any = {
    findUnique: async ({ where }: any = {}) =>
      this.rows.find((row) => matches(where, row)) ?? null,
    upsert: async ({ where, create, update }: any = {}) => {
      const existing = this.rows.find((row) => matches(where, row))
      if (existing) {
        Object.assign(existing, update)
        existing.updatedAt = new Date()
        this.events.push('persist')
        return { ...existing }
      }
      const row = {
        id: where.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...DEFAULT_HOMEPAGE_SETTINGS,
        ...create,
      }
      this.rows.push(row)
      this.events.push('persist')
      return { ...row }
    },
    update: async ({ where, data }: any = {}) => {
      if (this.failUpdates) throw new Error('database unavailable')
      const existing = this.rows.find((row) => matches(where, row))
      if (!existing) throw new Error('No row to update')
      Object.assign(existing, data)
      existing.updatedAt = new Date()
      this.events.push('persist')
      return { ...existing }
    },
  }
}

class FakeStorage implements ObjectStorage {
  puts: string[] = []
  deletes: string[] = []
  putError: Error | null = null
  putResult: { url: string; key: string } | null = null
  deleteError: Error | null = null
  getUrlError: Error | null = null
  urlForKey: (key: string) => string = (key) => `https://unittest12345678.public.blob.vercel-storage.com/${key}`
  ownedUrlForKey: (key: string) => string | null = (key) => this.urlForKey(key)
  storedKeyForKey: (key: string) => string = (key) => key

  constructor(private readonly events?: string[]) {}

  async put(key: string): Promise<StoredBlob> {
    this.puts.push(key)
    this.events?.push(`put:${key}`)
    if (this.putError) throw this.putError
    if (this.putResult) return this.putResult
    return { url: this.urlForKey(key), key: this.storedKeyForKey(key) }
  }

  async getUrl(key: string): Promise<string | null> {
    if (this.getUrlError) throw this.getUrlError
    return this.ownedUrlForKey(key)
  }

  async delete(key: string): Promise<void> {
    this.deletes.push(key)
    this.events?.push(`delete:${key}`)
    if (this.deleteError) throw this.deleteError
  }
}

function asClient(fake: FakeHomepageSettingsDb): PrismaClient {
  return fake as unknown as PrismaClient
}

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'single',
    ...DEFAULT_HOMEPAGE_SETTINGS,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

test('getHomepageSettings creates one default singleton when the row is missing', async () => {
  const fake = new FakeHomepageSettingsDb()
  const first = await getHomepageSettings(asClient(fake))
  const second = await getHomepageSettings(asClient(fake))

  assert.equal(fake.rows.length, 1)
  assert.deepStrictEqual(first, {
    visualImageUrl: null,
    visualImageAlt: DEFAULT_HOMEPAGE_SETTINGS.visualImageAlt,
  })
  assert.deepStrictEqual(second, first)
})

test('getHomepageSettings returns exactly the two safe public fields', async () => {
  const fake = new FakeHomepageSettingsDb()
  fake.rows.push(
    row({
      visualImageUrl: 'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-current.jpg',
      visualImageAlt: 'Rooftop terrace suite',
    })
  )

  const settings = await getHomepageSettings(asClient(fake))

  assert.deepStrictEqual(Object.keys(settings).sort(), ['visualImageAlt', 'visualImageUrl'])
  assert.deepStrictEqual(settings, {
    visualImageUrl: 'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-current.jpg',
    visualImageAlt: 'Rooftop terrace suite',
  })
})

test('updateHomepageSettings persists alt text across requests without changing the image', async () => {
  const fake = new FakeHomepageSettingsDb()
  fake.rows.push(row({ visualImageUrl: 'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-saved.jpg' }))

  const saved = await updateHomepageSettings(asClient(fake), {
    visualImageAlt: 'Rooftop terrace suite',
  })
  const publicSettings = await getHomepageSettings(asClient(fake))

  assert.equal(saved.visualImageAlt, 'Rooftop terrace suite')
  assert.equal(saved.visualImageUrl, 'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-saved.jpg')
  assert.deepStrictEqual(publicSettings, {
    visualImageUrl: 'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-saved.jpg',
    visualImageAlt: 'Rooftop terrace suite',
  })
  assert.equal(fake.rows.length, 1)
})

test('homepage settings validation enforces required alt text and the length limit', () => {
  assert.equal(parseHomepageSettingsUpdate({ visualImageAlt: 'Rooftop terrace suite' }).ok, true)
  assert.equal(parseHomepageSettingsUpdate({ visualImageAlt: '   ' }).ok, false)
  assert.equal(parseHomepageSettingsUpdate({ visualImageAlt: 'x'.repeat(161) }).ok, false)
  assert.equal(parseHomepageSettingsUpdate({}).ok, false)
})

test('malformed or mismatched image content is rejected before storage or persistence', async () => {
  const fake = new FakeHomepageSettingsDb()
  fake.rows.push(row({ visualImageUrl: 'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-11111111-1111-4111-8111-111111111111.png' }))
  const storage = new FakeStorage()

  await assert.rejects(
    uploadHomepageVisual(asClient(fake), storage, Buffer.from('not an image'), 'image/png'),
    /not a valid/i
  )
  await assert.rejects(
    uploadHomepageVisual(asClient(fake), storage, VALID_PNG, 'image/jpeg'),
    /not a valid/i
  )

  assert.equal(fake.rows[0].visualImageUrl, 'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-11111111-1111-4111-8111-111111111111.png')
  assert.deepStrictEqual(storage.puts, [])
  assert.deepStrictEqual(storage.deletes, [])
})

test('uploadHomepageVisual persists first and deletes the old managed blob afterward', async () => {
  const events: string[] = []
  const fake = new FakeHomepageSettingsDb()
  fake.events = events
  fake.rows.push(row({ visualImageUrl: 'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-11111111-1111-4111-8111-111111111111.png' }))
  const storage = new FakeStorage(events)

  const settings = await uploadHomepageVisual(
    asClient(fake),
    storage,
    VALID_PNG,
    'image/png'
  )

  assert.equal(settings.visualSource, 'custom')
  assert.match(
    settings.visualImageUrl ?? '',
    /^https:\/\/unittest12345678\.public\.blob\.vercel-storage\.com\/homepage\/visual-/
  )
  assert.deepStrictEqual(storage.deletes, ['homepage/visual-11111111-1111-4111-8111-111111111111.png'])
  assert.ok(events.indexOf('persist') < events.indexOf('delete:homepage/visual-11111111-1111-4111-8111-111111111111.png'))
})

test('storage failure keeps the previous homepage visual active', async () => {
  const fake = new FakeHomepageSettingsDb()
  fake.rows.push(row({ visualImageUrl: 'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-11111111-1111-4111-8111-111111111111.png' }))
  const storage = new FakeStorage()
  storage.putError = new Error('blob unavailable')

  await assert.rejects(
    uploadHomepageVisual(asClient(fake), storage, VALID_PNG, 'image/png'),
    /storage is unavailable/i
  )

  assert.equal(fake.rows[0].visualImageUrl, 'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-11111111-1111-4111-8111-111111111111.png')
  assert.deepStrictEqual(storage.deletes, storage.puts)
})

test('database failure cleans up the new blob and preserves the previous visual', async () => {
  const fake = new FakeHomepageSettingsDb()
  fake.rows.push(row({ visualImageUrl: 'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-11111111-1111-4111-8111-111111111111.png' }))
  fake.failUpdates = true
  const storage = new FakeStorage()

  await assert.rejects(
    uploadHomepageVisual(asClient(fake), storage, VALID_PNG, 'image/png'),
    /database unavailable/
  )

  assert.equal(fake.rows[0].visualImageUrl, 'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-11111111-1111-4111-8111-111111111111.png')
  assert.equal(storage.puts.length, 1)
  assert.deepStrictEqual(storage.deletes, [storage.puts[0]])
})

test('non-persistent storage URLs are rejected and the uploaded blob is removed', async () => {
  for (const urlForKey of [
    (key: string) => `/homepage/${key}`,
    (key: string) => `data:image/png;base64,${key}`,
    (key: string) => `blob:https://unittest12345678.public.blob.vercel-storage.com/${key}`,
    (key: string) => `memory://${key}`,
    (key: string) => `https://cdn.example/${key}`,
    (key: string) =>
      `https://user:password@unittest12345678.public.blob.vercel-storage.com/${key}`,
    (key: string) =>
      `https://unittest12345678.public.blob.vercel-storage.com:444/${key}`,
    (key: string) => `https://unittest12345678.public.blob.vercel-storage.com/property/${key}`,
  ]) {
    const fake = new FakeHomepageSettingsDb()
    fake.rows.push(row({ visualImageUrl: 'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-11111111-1111-4111-8111-111111111111.png' }))
    const storage = new FakeStorage()
    storage.urlForKey = urlForKey

    await assert.rejects(
      uploadHomepageVisual(asClient(fake), storage, VALID_PNG, 'image/png'),
      /not configured/i
    )

    assert.equal(fake.rows[0].visualImageUrl, 'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-11111111-1111-4111-8111-111111111111.png')
    assert.deepStrictEqual(storage.deletes, [storage.puts[0]])
  }
})

test('malformed storage responses are rejected and cleaned up safely', async () => {
  const fake = new FakeHomepageSettingsDb()
  fake.rows.push(
    row({
      visualImageUrl:
        'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-11111111-1111-4111-8111-111111111111.png',
    })
  )
  const storage = new FakeStorage()
  storage.putResult = {
    url: 'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-33333333-3333-4333-8333-333333333333.png',
    key: 123 as unknown as string,
  }

  await assert.rejects(
    uploadHomepageVisual(asClient(fake), storage, VALID_PNG, 'image/png'),
    /not configured/i
  )

  assert.equal(fake.rows[0].visualImageUrl,
    'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-11111111-1111-4111-8111-111111111111.png')
  assert.deepStrictEqual(storage.deletes, [storage.puts[0]])
})

test('storage keys outside the requested homepage object are never persisted or deleted', async () => {
  const fake = new FakeHomepageSettingsDb()
  fake.rows.push(
    row({
      visualImageUrl:
        'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-11111111-1111-4111-8111-111111111111.png',
    })
  )
  const storage = new FakeStorage()
  storage.storedKeyForKey = () =>
    'homepage/visual-33333333-3333-4333-8333-333333333333.png'

  await assert.rejects(
    uploadHomepageVisual(asClient(fake), storage, VALID_PNG, 'image/png'),
    /not configured/i
  )

  assert.equal(
    fake.rows[0].visualImageUrl,
    'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-11111111-1111-4111-8111-111111111111.png'
  )
  assert.deepStrictEqual(storage.deletes, [storage.puts[0]])
})

test('reset does not delete a matching key owned by a different Blob store', async () => {
  const fake = new FakeHomepageSettingsDb()
  const key = 'homepage/visual-22222222-2222-4222-8222-222222222222.webp'
  fake.rows.push(
    row({ visualImageUrl: `https://otherstore12345678.public.blob.vercel-storage.com/${key}` })
  )
  const storage = new FakeStorage()

  const settings = await resetHomepageVisual(asClient(fake), storage)

  assert.equal(settings.visualImageUrl, null)
  assert.deepStrictEqual(storage.deletes, [])
})

test('reset does not delete objects outside the homepage visual namespace', async () => {
  const fake = new FakeHomepageSettingsDb()
  fake.rows.push(
    row({
      visualImageUrl:
        'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-invalid.png',
    })
  )
  const storage = new FakeStorage()

  const settings = await resetHomepageVisual(asClient(fake), storage)

  assert.equal(settings.visualImageUrl, null)
  assert.deepStrictEqual(storage.deletes, [])
})

test('cleanup failures are logged without provider details and do not undo reset', async (t) => {
  const fake = new FakeHomepageSettingsDb()
  const key = 'homepage/visual-22222222-2222-4222-8222-222222222222.webp'
  fake.rows.push(
    row({ visualImageUrl: `https://unittest12345678.public.blob.vercel-storage.com/${key}` })
  )
  const storage = new FakeStorage()
  const secret = 'vercel_blob_rw_do_not_log'
  storage.deleteError = new Error(`delete failed for ${secret}`)
  const logged: unknown[][] = []
  t.mock.method(console, 'error', (...values: unknown[]) => logged.push(values))

  const settings = await resetHomepageVisual(asClient(fake), storage)

  assert.equal(settings.visualImageUrl, null)
  assert.equal(fake.rows[0].visualImageUrl, '')
  assert.deepStrictEqual(storage.deletes, [key])
  assert.equal(logged.length, 1)
  assert.equal(JSON.stringify(logged).includes(secret), false)
})

test('blob verification failures do not undo a successful reset', async (t) => {
  const fake = new FakeHomepageSettingsDb()
  const key = 'homepage/visual-22222222-2222-4222-8222-222222222222.webp'
  fake.rows.push(
    row({ visualImageUrl: `https://unittest12345678.public.blob.vercel-storage.com/${key}` })
  )
  const storage = new FakeStorage()
  const secret = 'vercel_blob_rw_do_not_log'
  storage.getUrlError = new Error(`head failed for ${secret}`)
  const logged: unknown[][] = []
  t.mock.method(console, 'error', (...values: unknown[]) => logged.push(values))

  const settings = await resetHomepageVisual(asClient(fake), storage)

  assert.equal(settings.visualImageUrl, null)
  assert.equal(fake.rows[0].visualImageUrl, '')
  assert.deepStrictEqual(storage.deletes, [])
  assert.equal(JSON.stringify(logged).includes(secret), false)
})

test('resetHomepageVisual persists the fallback before deleting the old managed blob', async () => {
  const events: string[] = []
  const fake = new FakeHomepageSettingsDb()
  fake.events = events
  fake.rows.push(
    row({
      visualImageUrl: 'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-22222222-2222-4222-8222-222222222222.webp',
      visualImageAlt: 'Rooftop terrace suite',
    })
  )
  const storage = new FakeStorage(events)

  const settings = await resetHomepageVisual(asClient(fake), storage)

  assert.deepStrictEqual(settings, {
    visualImageUrl: null,
    visualImageAlt: 'Rooftop terrace suite',
    visualSource: 'fallback',
  })
  assert.equal(fake.rows[0].visualImageUrl, '')
  assert.deepStrictEqual(storage.deletes, ['homepage/visual-22222222-2222-4222-8222-222222222222.webp'])
  assert.ok(events.indexOf('persist') < events.indexOf('delete:homepage/visual-22222222-2222-4222-8222-222222222222.webp'))
})

test('homepage reads never access the PropertyImage delegate', async () => {
  const fake = new FakeHomepageSettingsDb()
  fake.rows.push(
    row({
      visualImageUrl: 'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-homepage.jpg',
      visualImageAlt: 'Homepage visual',
    })
  )

  const settings = await getHomepageSettings(asClient(fake))

  assert.equal(settings.visualImageUrl, 'https://unittest12345678.public.blob.vercel-storage.com/homepage/visual-homepage.jpg')
  assert.equal(settings.visualImageAlt, 'Homepage visual')
})

test('homepage upload and reset never access the PropertyImage delegate', async () => {
  const fake = new FakeHomepageSettingsDb()
  const storage = new FakeStorage()

  await uploadHomepageVisual(asClient(fake), storage, VALID_PNG, 'image/png')
  const settings = await resetHomepageVisual(asClient(fake), storage)

  assert.equal(settings.visualImageUrl, null)
})

test('getHomepageSettingsRecord returns the stored singleton across service operations', async () => {
  const fake = new FakeHomepageSettingsDb()
  const created = await getHomepageSettingsRecord(asClient(fake))
  await updateHomepageSettings(asClient(fake), { visualImageAlt: 'Saved alt' })
  const readBack = await getHomepageSettingsRecord(asClient(fake))

  assert.equal(created.id, 'single')
  assert.equal(readBack.id, 'single')
  assert.equal(readBack.visualImageAlt, 'Saved alt')
  assert.equal(fake.rows.length, 1)
})
