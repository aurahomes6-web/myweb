import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PrismaClient } from '../src/generated/prisma/client.js'
import {
  MAX_MARQUEE_NOTIFICATION_LENGTH,
  parseCreateMarqueeNotification,
  parseReorderMarqueeNotifications,
  parseUpdateMarqueeNotification,
} from '../src/lib/marqueeNotificationValidation.js'
import {
  createMarqueeNotification,
  deleteMarqueeNotification,
  listMarqueeNotifications,
  listPublicMarqueeNotifications,
  MarqueeNotificationNotFoundError,
  MarqueeNotificationOrderError,
  reorderMarqueeNotifications,
  updateMarqueeNotification,
} from '../src/services/marqueeNotificationService.js'

type Row = {
  id: string
  message: string
  isActive: boolean
  sort: number
  createdAt: Date
  updatedAt: Date
}

function matches(where: Record<string, unknown> | undefined, row: Row): boolean {
  if (!where) return true
  return Object.entries(where).every(
    ([key, value]) => (row as Record<string, unknown>)[key] === value
  )
}

function orderedRows(rows: Row[], orderBy: Record<string, string>[] = []): Row[] {
  return [...rows].sort((left, right) => {
    for (const order of orderBy) {
      for (const [key, direction] of Object.entries(order)) {
        const leftValue = left[key as keyof Row]
        const rightValue = right[key as keyof Row]
        if (leftValue === rightValue) continue
        const comparison =
          typeof leftValue === 'number' && typeof rightValue === 'number'
            ? leftValue - rightValue
            : String(leftValue).localeCompare(String(rightValue))
        return direction === 'desc' ? -comparison : comparison
      }
    }
    return 0
  }).map((row) => ({ ...row }))
}

class FakeMarqueeNotificationDb {
  rows: Row[] = []
  nextId = 1

  marqueeNotification: any = {
    findMany: async ({ where, orderBy }: any = {}) =>
      orderedRows(
        this.rows.filter((row) => matches(where, row)),
        orderBy ?? []
      ),
    findFirst: async ({ orderBy }: any = {}) =>
      orderedRows(this.rows, orderBy ?? [])[0] ?? null,
    findUnique: async ({ where }: any = {}) =>
      this.rows.find((row) => matches(where, row)) ?? null,
    create: async ({ data }: any = {}) => {
      const row = {
        id: `notification-${this.nextId++}`,
        message: data.message,
        isActive: data.isActive,
        sort: data.sort,
        createdAt: new Date(`2026-01-0${this.nextId}T00:00:00.000Z`),
        updatedAt: new Date(`2026-01-0${this.nextId}T00:00:00.000Z`),
      }
      this.rows.push(row)
      return { ...row }
    },
    update: async ({ where, data }: any = {}) => {
      const existing = this.rows.find((row) => matches(where, row))
      if (!existing) throw new Error('No row to update')
      Object.assign(existing, data, { updatedAt: new Date('2026-02-01T00:00:00.000Z') })
      return { ...existing }
    },
    delete: async ({ where }: any = {}) => {
      const index = this.rows.findIndex((row) => matches(where, row))
      if (index < 0) throw new Error('No row to delete')
      const [row] = this.rows.splice(index, 1)
      return row
    },
  }

  $transaction = async (run: (tx: FakeMarqueeNotificationDb) => Promise<unknown>) => run(this)
}

function asClient(fake: FakeMarqueeNotificationDb): PrismaClient {
  return fake as unknown as PrismaClient
}

test('create marquee notification appends to the current order', async () => {
  const fake = new FakeMarqueeNotificationDb()

  const first = await createMarqueeNotification(asClient(fake), {
    message: 'Welcome to AURA HOMES',
    isActive: true,
  })
  const second = await createMarqueeNotification(asClient(fake), {
    message: 'Flexible stays are available.',
    isActive: true,
  })

  assert.equal(first.message, 'Welcome to AURA HOMES')
  assert.equal(first.sort, 0)
  assert.equal(second.sort, 1)
})

test('edit marquee notification changes only the submitted fields', async () => {
  const fake = new FakeMarqueeNotificationDb()
  const created = await createMarqueeNotification(asClient(fake), {
    message: 'Original notice',
    isActive: true,
  })

  const edited = await updateMarqueeNotification(asClient(fake), created.id, {
    message: 'Updated notice',
  })

  assert.equal(edited.message, 'Updated notice')
  assert.equal(edited.isActive, true)
  assert.equal(edited.sort, 0)
})

test('delete marquee notification removes it and reports missing records', async () => {
  const fake = new FakeMarqueeNotificationDb()
  const created = await createMarqueeNotification(asClient(fake), {
    message: 'Temporary notice',
    isActive: true,
  })

  assert.deepStrictEqual(await deleteMarqueeNotification(asClient(fake), created.id), { deleted: true })
  assert.deepStrictEqual(await listMarqueeNotifications(asClient(fake)), [])
  await assert.rejects(
    deleteMarqueeNotification(asClient(fake), created.id),
    MarqueeNotificationNotFoundError
  )
})

test('enable and disable marquee notifications controls public visibility', async () => {
  const fake = new FakeMarqueeNotificationDb()
  const created = await createMarqueeNotification(asClient(fake), {
    message: 'Seasonal opening',
    isActive: true,
  })

  const disabled = await updateMarqueeNotification(asClient(fake), created.id, { isActive: false })

  assert.equal(disabled.isActive, false)
  assert.deepStrictEqual(await listPublicMarqueeNotifications(asClient(fake)), [])
  const enabled = await updateMarqueeNotification(asClient(fake), created.id, { isActive: true })
  assert.equal(enabled.isActive, true)
  assert.deepStrictEqual(await listPublicMarqueeNotifications(asClient(fake)), [
    { id: created.id, message: 'Seasonal opening' },
  ])
})

test('reordering assigns a complete stable order and rejects stale ID sets', async () => {
  const fake = new FakeMarqueeNotificationDb()
  const first = await createMarqueeNotification(asClient(fake), {
    message: 'First',
    isActive: true,
  })
  const second = await createMarqueeNotification(asClient(fake), {
    message: 'Second',
    isActive: true,
  })
  const third = await createMarqueeNotification(asClient(fake), {
    message: 'Third',
    isActive: true,
  })

  await assert.rejects(
    reorderMarqueeNotifications(asClient(fake), { ids: [first.id, second.id] }),
    MarqueeNotificationOrderError
  )
  const reordered = await reorderMarqueeNotifications(asClient(fake), {
    ids: [third.id, first.id, second.id],
  })

  assert.deepStrictEqual(
    reordered.map(({ id, sort }) => ({ id, sort })),
    [
      { id: third.id, sort: 0 },
      { id: first.id, sort: 1 },
      { id: second.id, sort: 2 },
    ]
  )
})

test('marquee notification validation enforces text, active status, and complete IDs', () => {
  assert.deepStrictEqual(parseCreateMarqueeNotification({ message: '  Welcome  ' }), {
    ok: true,
    value: { message: 'Welcome', isActive: true },
  })
  assert.equal(parseCreateMarqueeNotification({ message: '   ' }).ok, false)
  assert.equal(
    parseCreateMarqueeNotification({ message: 'x'.repeat(MAX_MARQUEE_NOTIFICATION_LENGTH + 1) })
      .ok,
    false
  )
  assert.equal(parseCreateMarqueeNotification({ message: 'Notice', isActive: 'yes' }).ok, false)
  assert.equal(parseUpdateMarqueeNotification({}).ok, false)
  assert.deepStrictEqual(parseUpdateMarqueeNotification({ isActive: false }), {
    ok: true,
    value: { isActive: false },
  })
  assert.equal(parseReorderMarqueeNotifications({ ids: ['one', 'one'] }).ok, false)
  assert.equal(parseReorderMarqueeNotifications({ ids: [''] }).ok, false)
  assert.deepStrictEqual(parseReorderMarqueeNotifications({ ids: [] }), {
    ok: true,
    value: { ids: [] },
  })
})
