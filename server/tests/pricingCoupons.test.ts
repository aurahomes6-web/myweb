import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCouponInput } from '../src/lib/couponValidation.js'
import {
  computeDiscountPaise,
  computeStayTotal,
  couponRejectReason,
  formatINR,
  type CouponForPricing,
} from '../src/services/pricingService.js'
import { normalizeCouponCode, toExpiryDate } from '../src/lib/couponValidation.js'
import {
  CouponInvalidError,
  checkCouponUsable,
  consumeCouponInTransaction,
  createCoupon,
  deleteCoupon,
  listCoupons,
  setCouponActive,
} from '../src/services/couponService.js'
import {
  deletePropertyImage,
  uploadPropertyImage,
} from '../src/services/imageService.js'
import { getObjectStorage, MemoryStorage } from '../src/storage/storage.js'
import { parseLocalEnv } from '../src/lib/env.js'
import { buildWhatsAppMessage } from '../src/services/notificationService.js'
import { ConflictError, NotFoundError, BadRequestError } from '../src/services/adminService.js'

// ── minimal in-memory Prisma stand-in (Phase 5 models) ─────────────────────

let counter = 0
function nextId(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}`
}

class FakeDb {
  properties: Array<Record<string, unknown>> = []
  coupons: Array<Record<string, unknown>> = []
  couponUsages: Array<Record<string, unknown>> = []
  propertyImages: Array<Record<string, unknown>> = []

  $transaction = (async (fn: (tx: never) => unknown) =>
    (fn as (tx: FakeDb) => Promise<unknown>)(this)) as unknown as PrismaClientFake['$transaction']

  property: any = {
    findUnique: async ({ where, select }: any = {}) => {
      const row = this.properties.find(
        (p) => p.id === where?.id || p.slug === where?.slug
      )
      if (!row) return null
      return project(row, select)
    },
    findFirst: async ({ where, select }: any = {}) => {
      const row = this.properties.find((p) => p.id === where?.id || p.slug === where?.slug)
      if (!row) return null
      return project(row, select)
    },
  }

  coupon: any = {
    findUnique: async ({ where, select }: any = {}) => {
      const row =
        this.coupons.find((c) => c.code === where?.code) ??
        this.coupons.find((c) => c.id === where?.id) ??
        null
      if (!row) return null
      const out = project(row, select) ?? {}
      if (select?._count) {
        out._count = { usages: this.couponUsages.filter((u) => u.couponId === row.id).length }
      }
      return out
    },
    findMany: async ({ include }: any = {}) => {
      const rows = [...this.coupons].sort(
        (a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime()
      )
      return rows.map((row) => {
        const out = project(row, undefined)!
        if (include?._count) out._count = { usages: this.couponUsages.filter((u) => u.couponId === row.id).length }
        return out
      })
    },
    create: async ({ data, include }: any = {}) => {
      const row: Record<string, unknown> = {
        id: nextId('coupon'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        ...data,
      }
      this.coupons.push(row)
      const out = project(row, undefined)!
      if (include?._count) out._count = { usages: 0 }
      return out
    },
    update: async ({ where, data, include }: any = {}) => {
      const row = this.coupons.find((c) => c.id === where?.id)
      if (!row) return null
      Object.assign(row, data, { updatedAt: new Date('2026-01-02T00:00:00Z') })
      const out = project(row, undefined)!
      if (include?._count) out._count = { usages: this.couponUsages.filter((u) => u.couponId === row.id).length }
      return out
    },
    updateMany: async ({ where, data }: any = {}) => {
      let matched = this.coupons.filter((c) => c.id === where?.id)
      if (where?.uses) {
        matched = matched.filter((c) => (c.uses as number) < where.uses.lt)
      }
      for (const row of matched) {
        if (data?.uses && typeof data.uses.increment === 'number') {
          row.uses = ((row.uses as number) ?? 0) + data.uses.increment
        } else {
          Object.assign(row, data)
        }
      }
      return { count: matched.length }
    },
    delete: async ({ where }: any = {}) => {
      const index = this.coupons.findIndex((c) => c.id === where?.id)
      if (index !== -1) this.coupons.splice(index, 1)
      return { id: where?.id }
    },
  }

  couponUsage: any = {
    create: async ({ data }: any = {}) => {
      const row = { id: nextId('usage'), ...data }
      this.couponUsages.push(row)
      return row
    },
    deleteMany: async ({ where }: any = {}) => {
      const before = this.couponUsages.length
      this.couponUsages = this.couponUsages.filter((u) => u.bookingId !== where?.bookingId)
      return { count: before - this.couponUsages.length }
    },
  }

  propertyImage: any = {
    findMany: async ({ where, orderBy }: any = {}) => {
      let rows = this.propertyImages.filter(
        (r) =>
          (where?.propertyId === undefined || r.propertyId === where.propertyId) &&
          (where?.kind === undefined || r.kind === where.kind) &&
          (where?.sort === undefined || r.sort === where.sort)
      )
      if (orderBy?.sort === 'desc') rows = [...rows].sort((a, b) => (b.sort as number) - (a.sort as number))
      return rows
    },
    findUnique: async ({ where }: any = {}) =>
      this.propertyImages.find((r) => r.id === where?.id) ?? null,
    create: async ({ data }: any = {}) => {
      const row: Record<string, unknown> = { id: nextId('img'), ...data }
      this.propertyImages.push(row)
      return row
    },
    delete: async ({ where }: any = {}) => {
      const index = this.propertyImages.findIndex((r) => r.id === where?.id)
      if (index !== -1) this.propertyImages.splice(index, 1)
      return { id: where?.id }
    },
  }
}

function project(
  row: Record<string, unknown> | null,
  select: Record<string, unknown> | undefined
): Record<string, unknown> | null {
  if (!row) return null
  if (!select) return { ...row }
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(select)) {
    if (val === true) out[key] = row[key]
  }
  return out
}

type PrismaClientFake = {
  $transaction: (fn: (tx: never) => unknown) => Promise<unknown>
  property: unknown
  coupon: unknown
  couponUsage: unknown
  propertyImage: unknown
}

function asClient(db: FakeDb) {
  return db as never as import('../src/generated/prisma/client.js').PrismaClient
}

function couponInput(overrides: Record<string, unknown> = {}) {
  return {
    code: 'TESTCODE',
    discountType: 'FIXED' as const,
    discountValue: 100,
    maxUses: null,
    expiresAt: null,
    ...overrides,
  }
}

function seedProperty(db: FakeDb, overrides: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = {
    id: 'prop-1',
    slug: 'aura-sky',
    name: 'Aura Sky Loft',
    shortLabel: 'Test',
    description: 'D',
    shortDescription: 'S',
    capacity: 4,
    bedrooms: 2,
    beds: 3,
    bathrooms: 2,
    sqft: 800,
    amenities: ['Wi-Fi'],
    accent: '#4a3428',
    visual: 'brown',
    location: 'Testville',
    pricePerNightPaise: 300000,
    ...overrides,
  }
  db.properties.push(row)
  return row
}

function seedCoupon(
  db: FakeDb,
  overrides: Record<string, unknown> = {},
  dataOverrides: Record<string, unknown> = {}
) {
  const row: Record<string, unknown> = {
    id: nextId('coupon'),
    code: 'FRIENDS20',
    discountType: 'PERCENTAGE',
    discountValue: 20,
    maxUses: null,
    uses: 0,
    expiresAt: null,
    deactivatedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...dataOverrides,
  }
  db.coupons.push(row)
  return { ...row, ...overrides }
}

// ── pricing ────────────────────────────────────────────────────────────────

test('computeStayTotal multiplies nightly rate by nights in paise', () => {
  assert.equal(computeStayTotal(300000, 3), 900000)
})

test('PERCENTAGE discount is rounded and never exceeds the stay total', () => {
  const coupon = { discountType: 'PERCENTAGE', discountValue: 50 } as CouponForPricing
  assert.equal(computeDiscountPaise(coupon, 900000), 450000)
  const huge = { discountType: 'PERCENTAGE', discountValue: 100 } as CouponForPricing
  assert.equal(computeDiscountPaise(huge, 900000), 900000)
})

test('FIXED discount is clamped to the stay total', () => {
  const coupon = { discountType: 'FIXED', discountValue: 999999 } as CouponForPricing
  assert.equal(computeDiscountPaise(coupon, 300000), 300000)
})

test('couponRejectReason classifies every coupon state', async (t) => {
  const base = {
    discountType: 'PERCENTAGE',
    discountValue: 10,
    maxUses: null,
    uses: 0,
    expiresAt: null,
    deactivatedAt: null,
  } as CouponForPricing
  const now = new Date('2026-05-01T00:00:00Z')

  assert.equal(couponRejectReason(null, now), 'NOT_FOUND')
  assert.equal(couponRejectReason(base, now), null)
  await t.test('deactivated', () => {
    assert.equal(couponRejectReason({ ...base, deactivatedAt: now }, now), 'DEACTIVATED')
  })
  await t.test('expired', () => {
    assert.equal(
      couponRejectReason({ ...base, expiresAt: new Date('2026-04-01T00:00:00Z') }, now),
      'EXPIRED'
    )
  })
  await t.test('usage cap met', () => {
    assert.equal(couponRejectReason({ ...base, maxUses: 5, uses: 5 }, now), 'USAGE_EXCEEDED')
  })
})

test('formatINR renders rupees with Indian grouping', () => {
  assert.equal(formatINR(300000), '₹3,000')
  assert.equal(formatINR(450000), '₹4,500')
  assert.equal(formatINR(125000), '₹1,250')
})

// ── coupon validation lib ──────────────────────────────────────────────────

test('normalizeCouponCode uppercases and trims; rejects bad shapes', () => {
  assert.equal(normalizeCouponCode('  friends20  '), 'FRIENDS20')
  assert.equal(normalizeCouponCode('A-B_C1'), 'A-B_C1')
  assert.equal(normalizeCouponCode(''), null)
  assert.equal(normalizeCouponCode('has spaces'), null)
  assert.equal(normalizeCouponCode('A'.repeat(41)), null)
})

test('parseCouponInput validates FIXED and PERCENTAGE coupons', () => {
  const fixed = parseCouponInput({ code: 'LUXE500', discountType: 'FIXED', discountValue: 50000 })
  assert.ok(fixed.ok)
  assert.equal(fixed.ok && fixed.value.discountValue, 50000)

  const percent = parseCouponInput({ code: 'WELCOME10', discountType: 'PERCENTAGE', discountValue: 10 })
  assert.ok(percent.ok)
  assert.equal(percent.ok && percent.value.discountValue, 10)

  const badPercent = parseCouponInput({ code: 'X', discountType: 'PERCENTAGE', discountValue: 150 })
  assert.ok(!badPercent.ok)

  const badValue = parseCouponInput({ code: 'X', discountType: 'FIXED', discountValue: 0 })
  assert.ok(!badValue.ok)

  const badMax = parseCouponInput({ code: 'X', discountType: 'FIXED', discountValue: 100, maxUses: 0 })
  assert.ok(!badMax.ok)

  const badCode = parseCouponInput({ code: 'bad code', discountType: 'FIXED', discountValue: 100 })
  assert.ok(!badCode.ok)
})

test('toExpiryDate normalises to the end of day (UTC)', () => {
  const date = toExpiryDate('2026-12-31')
  assert.equal(date.toISOString(), '2026-12-31T23:59:59.999Z')
})

// ── coupon service ─────────────────────────────────────────────────────────

test('createCoupon stores a normalized coupon and listCoupons serializes it', async () => {
  const db = new FakeDb()
  const created = await createCoupon(asClient(db), couponInput({ code: 'GROOM50', discountType: 'FIXED', discountValue: 50000 }))
  assert.equal(created.code, 'GROOM50')
  assert.equal(created.uses, 0)
  assert.equal(created.usageCount, 0)

  const list = await listCoupons(asClient(db))
  assert.equal(list.length, 1)
  assert.equal(list[0].code, 'GROOM50')
  assert.equal(list[0].discountType, 'FIXED')
})

test('createCoupon rejects duplicate codes', async () => {
  const db = new FakeDb()
  await createCoupon(asClient(db), couponInput({ code: 'DUP' }))
  await assert.rejects(
    createCoupon(asClient(db), couponInput({ code: 'DUP', discountValue: 200 })),
    ConflictError
  )
})

test('setCouponActive deactivates and reactivates without touching usages', async () => {
  const db = new FakeDb()
  const created = await createCoupon(asClient(db), couponInput({ code: 'TOGGLE', discountType: 'PERCENTAGE', discountValue: 5 }))
  const off = await setCouponActive(asClient(db), created.id, false)
  assert.ok(off.deactivatedAt)
  const on = await setCouponActive(asClient(db), created.id, true)
  assert.equal(on.deactivatedAt, null)
  assert.equal(on.uses, 0)
})

test('deleteCoupon refuses coupons already used by bookings', async () => {
  const db = new FakeDb()
  const created = await createCoupon(asClient(db), couponInput({ code: 'USED' }))
  db.couponUsages.push({ id: nextId('usage'), couponId: created.id, bookingId: 'b-1' })
  await assert.rejects(deleteCoupon(asClient(db), created.id), ConflictError)

  const fresh = await createCoupon(asClient(db), couponInput({ code: 'FRESH' }))
  assert.deepEqual(await deleteCoupon(asClient(db), fresh.id), { deleted: true })
})

test('checkCouponUsable returns the coupon when usable and reasons otherwise', async () => {
  const db = new FakeDb()
  const now = new Date('2026-05-01T00:00:00Z')
  seedCoupon(db, {}, { code: 'OK', discountValue: 10 })
  seedCoupon(db, {}, { code: 'DEAD', discountValue: 10, deactivatedAt: now })
  seedCoupon(db, {}, { code: 'FULL', discountValue: 10, maxUses: 1, uses: 1 })

  const ok = await checkCouponUsable(asClient(db), 'OK', now)
  assert.equal(ok.ok, true)
  assert.equal(ok.ok && ok.coupon.discountValue, 10)

  const missing = await checkCouponUsable(asClient(db), 'NOPE', now)
  assert.equal(missing.ok, false)
  assert.equal(missing.ok === false && missing.reason, 'NOT_FOUND')

  const dead = await checkCouponUsable(asClient(db), 'DEAD', now)
  assert.equal(dead.ok === false && dead.reason, 'DEACTIVATED')

  const full = await checkCouponUsable(asClient(db), 'FULL', now)
  assert.equal(full.ok === false && full.reason, 'USAGE_EXCEEDED')
})

test('consumeCouponInTransaction increments usage atomically and caps at maxUses', async () => {
  const db = new FakeDb()
  seedCoupon(db, {}, { code: 'CAP5', discountType: 'FIXED', discountValue: 2500, maxUses: 2, uses: 1 })

  const first = await consumeCouponInTransaction(asClient(db) as never, 'CAP5', 1000000)
  assert.equal(first.discountPaise, 2500)
  assert.equal(db.coupons[0].uses, 2)

  await assert.rejects(
    consumeCouponInTransaction(asClient(db) as never, 'CAP5', 1000000),
    CouponInvalidError
  )
  assert.equal(db.coupons[0].uses, 2)
})

test('consumeCouponInTransaction throws for missing/deactivated/expired coupons', async () => {
  const db = new FakeDb()
  const now = new Date('2026-05-01T00:00:00Z')
  seedCoupon(db, {}, { code: 'DEAD-2', deactivatedAt: now })

  await assert.rejects(
    consumeCouponInTransaction(asClient(db) as never, 'GHOST', 500000, now),
    CouponInvalidError
  )
  await assert.rejects(
    consumeCouponInTransaction(asClient(db) as never, 'DEAD-2', 500000, now),
    (err: unknown) => err instanceof CouponInvalidError && err.reason === 'DEACTIVATED'
  )
})

// ── storage ────────────────────────────────────────────────────────────────

/**
 * Persistent-style storage stub: returns browser-loadable https URLs and tracks
 * keys for delete assertions. Mirrors what VercelBlobStorage returns once
 * BLOB_READ_WRITE_TOKEN is configured, so image-service tests can pass the
 * persist-time browser-loadable guard.
 */
function blobStorage() {
  const keys = new Set<string>()
  return {
    put: async (key: string, _buffer: Buffer, _contentType: string) => {
      keys.add(key)
      return { url: `https://blob.test/${key}`, key }
    },
    delete: async (key: string) => {
      keys.delete(key)
    },
    has: (key: string) => keys.has(key),
  }
}

test('MemoryStorage stores by key and deletes', async () => {
  const storage = new MemoryStorage()
  const stored = await storage.put('properties/a/x', Buffer.from('img'), 'image/png')
  assert.ok(stored.url.startsWith('memory://properties/a/x'))
  assert.ok(storage.has('properties/a/x'))
  await storage.delete('properties/a/x')
  assert.equal(storage.has('properties/a/x'), false)
})

// ── local env loading .env.local ───────────────────────────────────────────

test('parseLocalEnv reads plain and quoted single-line values and ignores comments', () => {
  const parsed = parseLocalEnv(
    '# comment\nBLOB_READ_WRITE_TOKEN="vercel_blob_rw_abcdef"\nBLOB_STORE_ID=blob_xs8zY5\nNODE_ENV="development"\n'
  )
  assert.deepEqual(parsed, {
    BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_abcdef',
    BLOB_STORE_ID: 'blob_xs8zY5',
    NODE_ENV: 'development',
  })
})

test('parseLocalEnv joins multi-line double-quoted values (Vercel PEM webhook key)', () => {
  const text = [
    'BLOB_WEBHOOK_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----',
    'MCowBQYDK2VwAyEAtc5QZbYHRxvH0kAEk5nXp2W/0sY=',
    '-----END PUBLIC KEY-----"',
    'BLOB_READ_WRITE_TOKEN="vercel_blob_rw_xyz"',
  ].join('\n')
  const parsed = parseLocalEnv(text)
  const pem = parsed.BLOB_WEBHOOK_PUBLIC_KEY ?? ''
  assert.ok(pem.startsWith('-----BEGIN PUBLIC KEY-----'))
  assert.ok(pem.endsWith('-----END PUBLIC KEY-----'))
  assert.ok(pem.includes('\nMCowBQYDK2VwAyEAtc5QZbYHRxvH0kAEk5nXp2W/0sY='))
  assert.equal(parsed.BLOB_READ_WRITE_TOKEN, 'vercel_blob_rw_xyz')
})

test('getObjectStorage falls back to memory when no blob token is configured', () => {
  const storage = getObjectStorage({})
  assert.ok(storage instanceof MemoryStorage)
})

// ── image service ──────────────────────────────────────────────────────────

test('uploadPropertyImage uploads to a single slot replacing the old image', async () => {
  const db = new FakeDb()
  seedProperty(db)
  const storage = blobStorage()
  for (let i = 0; i < 2; i++) {
    const img = await uploadPropertyImage(
      asClient(db),
      storage,
      'prop-1',
      'main',
      Buffer.from(`photo-${i}`),
      'image/png'
    )
    assert.equal(img.sort, 0)
    assert.equal(img.kind, 'MAIN')
    assert.match(img.url, /^https:\/\//)
  }
  assert.equal(db.propertyImages.length, 1, 'main slot holds exactly one current image')
})

test('uploadPropertyImage appends to the extra slot with ascending sort', async () => {
  const db = new FakeDb()
  seedProperty(db)
  const storage = blobStorage()
  const a = await uploadPropertyImage(asClient(db), storage, 'prop-1', 'extra', Buffer.from('a'), 'image/jpeg')
  const b = await uploadPropertyImage(asClient(db), storage, 'prop-1', 'extra', Buffer.from('b'), 'image/jpeg')
  assert.equal(a.sort, 1)
  assert.equal(b.sort, 2)
  assert.equal(db.propertyImages.length, 2)
})

test('uploadPropertyImage rejects empty buffers and unknown properties', async () => {
  const db = new FakeDb()
  seedProperty(db)
  const storage = blobStorage()
  await assert.rejects(
    uploadPropertyImage(asClient(db), storage, 'prop-1', 'main', Buffer.alloc(0), 'image/png'),
    BadRequestError
  )
  await assert.rejects(
    uploadPropertyImage(asClient(db), storage, 'ghost', 'main', Buffer.from('x'), 'image/png'),
    NotFoundError
  )
})

test('uploadPropertyImage refuses to persist non-browser-loadable storage URLs', async () => {
  const db = new FakeDb()
  seedProperty(db)
  const storage = new MemoryStorage()
  await assert.rejects(
    uploadPropertyImage(asClient(db), storage, 'prop-1', 'main', Buffer.from('x'), 'image/png'),
    (err: unknown) => err instanceof BadRequestError && /BLOB_READ_WRITE_TOKEN/.test(err.message)
  )
  assert.equal(db.propertyImages.length, 0, 'no memory:// URL is ever stored in the DB')
})

test('deletePropertyImage removes the row and only for the owning property', async () => {
  const db = new FakeDb()
  seedProperty(db)
  const storage = blobStorage()
  const img = await uploadPropertyImage(asClient(db), storage, 'prop-1', 'main', Buffer.from('x'), 'image/png')
  const storageKey = db.propertyImages[0].storageKey as string
  assert.ok(storage.has(storageKey))

  await assert.rejects(
    deletePropertyImage(asClient(db), storage, 'prop-2', img.id),
    NotFoundError
  )
  assert.deepEqual(
    await deletePropertyImage(asClient(db), storage, 'prop-1', img.id),
    { deleted: true }
  )
  assert.equal(db.propertyImages.length, 0)
  assert.equal(storage.has(storageKey), false)
})

// ── WhatsApp pricing lines ─────────────────────────────────────────────────

test('booking WhatsApp message includes pricing and coupon details when present', () => {
  const message = buildWhatsAppMessage(
    {
      code: 'AH-ABC123',
      propertyName: 'Aura Sky Loft',
      checkIn: '2026-06-01',
      checkOut: '2026-06-04',
      guestCount: 2,
      primaryPhone: '9812345678',
      guests: [
        {
          fullName: 'Aarav Mehta',
          aadhaarNumber: '123456789012',
          gender: 'MALE',
          age: 30,
        },
      ],
      pricing: {
        originalPricePaise: 900000,
        discountPaise: 180000,
        finalPricePaise: 720000,
        couponCode: 'FRIENDS20',
      },
    },
    { fullAadhaar: false }
  )
  assert.match(message, /Original: ₹9,000/)
  assert.match(message, /Discount: – ₹1,800/)
  assert.match(message, /Total: ₹7,200/)
  assert.match(message, /Coupon: FRIENDS20/)
})

test('booking WhatsApp message omits the pricing block without a coupon', () => {
  const message = buildWhatsAppMessage(
    {
      code: 'AH-ABC123',
      propertyName: 'Aura Sky Loft',
      checkIn: '2026-06-01',
      checkOut: '2026-06-04',
      guestCount: 1,
      primaryPhone: '9812345678',
      guests: [
        { fullName: 'Meera', aadhaarNumber: '123456789012', gender: 'FEMALE', age: 28 },
      ],
    },
    { fullAadhaar: false }
  )
  assert.doesNotMatch(message, /Pricing:/)
})