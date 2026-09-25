import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildManagerReportMessage,
  buildManagerReportUrl,
  formatManagerReportTimestamp,
  getManagerChecklist,
  getManagerReportRecipient,
  listManagerProperties,
  prepareManagerReport,
  setManagerChecklistCompletion,
} from '../src/services/managerService.js'
import {
  createAdminChecklistItem,
  deleteAdminChecklistItem,
  listAdminChecklistItems,
  reorderAdminChecklistItems,
  updateAdminChecklistItem,
} from '../src/services/adminManagerService.js'
import { ConflictError, NotFoundError } from '../src/services/adminService.js'

// ── an in-memory stand-in for the manager tables ────────────────────────────

type Row = Record<string, any>

class FakeManagerDb {
  properties: Row[] = [
    { id: 'p1', name: 'Aura Cozy Penthouse 1', slug: 'aura-cozy-penthouse-1', sortOrder: 1 },
    { id: 'p2', name: 'Aura Cozy Penthouse 2', slug: 'aura-cozy-penthouse-2', sortOrder: 2 },
    { id: 'p3', name: 'Aura Cozy Penthouse 3', slug: 'aura-cozy-penthouse-3', sortOrder: 3 },
  ]
  items: Row[] = []
  completions: Row[] = []
  nextId = 1
  /** Every completion row ever written, including after an item is deleted. */
  readonly completionHistory: Row[] = []

  get client(): never {
    const self = this
    return {
      property: {
        findMany: async ({ orderBy }: { orderBy?: Row[] } = {}) => {
          const rows = [...self.properties]
          if (orderBy) {
            rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.slug.localeCompare(b.slug))
          }
          return rows.map(({ id, name, slug }) => ({ id, name, slug }))
        },
        findUnique: async ({ where }: { where: { id: string } }) => {
          const row = self.properties.find((item) => item.id === where.id)
          return row ? { id: row.id, name: row.name } : null
        },
      },
      managerChecklistItem: {
        findMany: async ({ where }: { where?: Row } = {}) => {
          let rows = self.items.filter((item) => item.propertyId === where?.propertyId)
          if (where?.deletedAt === null) rows = rows.filter((item) => item.deletedAt === null)
          if (where?.isActive === true) rows = rows.filter((item) => item.isActive)
          if (where?.id) rows = rows.filter((item) => item.id === where.id)
          return rows
            .sort(
              (a, b) =>
                a.sortOrder - b.sortOrder ||
                a.createdAt.getTime() - b.createdAt.getTime() ||
                a.id.localeCompare(b.id)
            )
            .map((row) => ({ ...row }))
        },
        findFirst: async ({ where }: { where?: Row } = {}) => {
          const row = self.items.find(
            (item) =>
              (!where?.id || item.id === where.id) &&
              (!where?.propertyId || item.propertyId === where.propertyId) &&
              (where?.deletedAt !== null || item.deletedAt === null) &&
              (where?.isActive === undefined || item.isActive === where.isActive)
          )
          return row ? { id: row.id, propertyId: row.propertyId, sortOrder: row.sortOrder } : null
        },
        findUnique: async ({ where }: { where: { id: string } }) =>
          self.items.find((item) => item.id === where.id) ?? null,
        count: async ({ where }: { where?: Row } = {}) =>
          self.items.filter(
            (item) => item.propertyId === where?.propertyId && item.deletedAt === null
          ).length,
        create: async ({ data }: { data: Row }) => {
          const row = {
            id: `i${self.nextId++}`,
            description: null,
            isActive: true,
            deletedAt: null,
            createdAt: new Date(1_700_000_000_000 + self.nextId * 1000),
            updatedAt: new Date(1_700_000_000_000 + self.nextId * 1000),
            ...data,
          }
          self.items.push(row)
          return { ...row }
        },
        update: async ({ where, data }: { where: { id: string }; data: Row }) => {
          const row = self.items.find((item) => item.id === where.id)
          if (!row) throw new Error('not found')
          Object.assign(row, data)
          return { ...row }
        },
      },
      managerChecklistCompletion: {
        findMany: async ({ where }: { where?: Row } = {}) =>
          self.completions.filter((row) => {
            if (where?.managerId && row.managerId !== where.managerId) return false
            if (where?.propertyId && row.propertyId !== where.propertyId) return false
            if (where?.dateKey && row.dateKey !== where.dateKey) return false
            if (where?.itemId?.in && !where.itemId.in.includes(row.itemId)) return false
            return true
          }),
        groupBy: async ({ by, where }: { by: string[]; where?: Row }) => {
          const counts = new Map<string, number>()
          for (const row of self.completionHistory) {
            if (where?.itemId?.in && !where.itemId.in.includes(row.itemId)) continue
            counts.set(row[by[0]], (counts.get(row[by[0]]) ?? 0) + 1)
          }
          return [...counts.entries()].map(([itemId, count]) => ({
            itemId,
            _count: { _all: count },
          }))
        },
        upsert: async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
          const key = where.itemId_managerId_dateKey
          const existing = self.completions.find(
            (row) => row.itemId === key.itemId && row.managerId === key.managerId && row.dateKey === key.dateKey
          )
          if (existing) {
            Object.assign(existing, update)
            return { ...existing }
          }
          const row = { id: `c${self.nextId++}`, ...create }
          self.completions.push(row)
          self.completionHistory.push({ ...row })
          return { ...row }
        },
      },
      $transaction: async (fn: (tx: unknown) => Promise<void>) => fn((self as any).client),
    } as never
  }
}

function item(db: FakeManagerDb, propertyId: string, title: string, extra: Row = {}) {
  return {
    title,
    description: null,
    isActive: true,
    deletedAt: null,
    sortOrder: db.items.length,
    ...extra,
  }
}

function seedItems(db: FakeManagerDb, propertyId: string, titles: string[]) {
  for (const title of titles) {
    db.items.push({
      id: `i${db.nextId++}`,
      propertyId,
      title,
      description: null,
      isActive: true,
      deletedAt: null,
      sortOrder: db.items.length,
      createdAt: new Date(1_700_000_000_000 + db.nextId * 1000),
      updatedAt: new Date(1_700_000_000_000 + db.nextId * 1000),
    })
  }
}

// ── property selection ──────────────────────────────────────────────────────

test('managers are offered the homes in canonical Penthouse 1 → 2 → 3 order', async () => {
  const db = new FakeManagerDb()
  const properties = await listManagerProperties(db.client)
  assert.deepStrictEqual(
    properties.map((property) => property.name),
    ['Aura Cozy Penthouse 1', 'Aura Cozy Penthouse 2', 'Aura Cozy Penthouse 3']
  )
})

test('an unknown property is a 404, not an empty checklist', async () => {
  const db = new FakeManagerDb()
  await assert.rejects(() => getManagerChecklist(db.client, 'm1', 'nope', '2026-09-25'), NotFoundError)
})

// ── daily checklist ─────────────────────────────────────────────────────────

test('the checklist comes from the database in the admin-defined order', async () => {
  const db = new FakeManagerDb()
  seedItems(db, 'p1', ['Cleaning', 'Sweeping', 'Mopping', 'Check AC'])

  const checklist = await getManagerChecklist(db.client, 'm1', 'p1', '2026-09-25')
  assert.equal(checklist.propertyName, 'Aura Cozy Penthouse 1')
  assert.deepStrictEqual(
    checklist.items.map((entry) => entry.title),
    ['Cleaning', 'Sweeping', 'Mopping', 'Check AC']
  )
  assert.equal(checklist.progress.total, 4)
  assert.equal(checklist.progress.completed, 0)
  assert.equal(checklist.progress.remaining, 4)
  assert.equal(checklist.progress.percent, 0)
})

test('each home has its own checklist', async () => {
  const db = new FakeManagerDb()
  seedItems(db, 'p1', ['Cleaning'])
  seedItems(db, 'p2', ['Cleaning', 'Check AC Remote'])

  const first = await getManagerChecklist(db.client, 'm1', 'p1', '2026-09-25')
  const second = await getManagerChecklist(db.client, 'm1', 'p2', '2026-09-25')
  assert.deepStrictEqual(first.items.map((entry) => entry.title), ['Cleaning'])
  assert.deepStrictEqual(second.items.map((entry) => entry.title), ['Cleaning', 'Check AC Remote'])
})

test('completing an item persists against the right property, day, item and manager', async () => {
  const db = new FakeManagerDb()
  seedItems(db, 'p1', ['Cleaning', 'Check AC'])
  const cleaning = db.items[0]
  const ac = db.items[1]

  const done = await setManagerChecklistCompletion(db.client, 'm1', 'p1', cleaning.id, '2026-09-25', true)
  assert.equal(done.isCompleted, true)
  assert.ok(done.completedAt)

  const stored = db.completions[0]
  assert.equal(stored.propertyId, 'p1')
  assert.equal(stored.itemId, cleaning.id)
  assert.equal(stored.managerId, 'm1')
  assert.equal(stored.dateKey, '2026-09-25')

  // Re-ticking updates the same row rather than appending a duplicate.
  await setManagerChecklistCompletion(db.client, 'm1', 'p1', cleaning.id, '2026-09-25', true)
  assert.equal(db.completions.length, 1)

  // A different manager is tracked separately.
  await setManagerChecklistCompletion(db.client, 'm2', 'p1', cleaning.id, '2026-09-25', true)
  assert.equal(db.completions.length, 2)
  // A different day is a fresh task.
  await setManagerChecklistCompletion(db.client, 'm1', 'p1', cleaning.id, '2026-09-26', true)
  assert.equal(db.completions.length, 3)
  assert.equal(ac.isActive, true)
})

test('unticking clears the completion timestamp', async () => {
  const db = new FakeManagerDb()
  seedItems(db, 'p1', ['Cleaning'])
  const cleaning = db.items[0]

  await setManagerChecklistCompletion(db.client, 'm1', 'p1', cleaning.id, '2026-09-25', true)
  const cleared = await setManagerChecklistCompletion(db.client, 'm1', 'p1', cleaning.id, '2026-09-25', false)
  assert.equal(cleared.isCompleted, false)
  assert.equal(cleared.completedAt, null)
})

test("tomorrow's checklist starts fresh", async () => {
  const db = new FakeManagerDb()
  seedItems(db, 'p1', ['Cleaning', 'Check AC'])

  const today = '2026-09-25'
  const tomorrow = '2026-09-26'
  const cleaning = db.items[0]

  await setManagerChecklistCompletion(db.client, 'm1', 'p1', cleaning.id, today, true)
  const todayView = await getManagerChecklist(db.client, 'm1', 'p1', today)
  const tomorrowView = await getManagerChecklist(db.client, 'm1', 'p1', tomorrow)

  assert.equal(todayView.progress.completed, 1)
  assert.equal(tomorrowView.progress.completed, 0)
  assert.equal(tomorrowView.items[0].isCompleted, false)
  // The definition itself is untouched — it is still a pending task tomorrow.
  assert.equal(tomorrowView.items[0].title, 'Cleaning')
})

test('progress calculation is correct at 0%, partial and 100%', async () => {
  const db = new FakeManagerDb()
  seedItems(db, 'p1', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])

  const before = await getManagerChecklist(db.client, 'm1', 'p1', '2026-09-25')
  assert.equal(before.progress.percent, 0)

  for (const entry of db.items.slice(0, 6)) {
    await setManagerChecklistCompletion(db.client, 'm1', 'p1', entry.id, '2026-09-25', true)
  }
  const partial = await getManagerChecklist(db.client, 'm1', 'p1', '2026-09-25')
  assert.equal(partial.progress.completed, 6)
  assert.equal(partial.progress.total, 8)
  assert.equal(partial.progress.remaining, 2)
  assert.equal(partial.progress.percent, 75)

  for (const entry of db.items) {
    await setManagerChecklistCompletion(db.client, 'm1', 'p1', entry.id, '2026-09-25', true)
  }
  const complete = await getManagerChecklist(db.client, 'm1', 'p1', '2026-09-25')
  assert.equal(complete.progress.completed, 8)
  assert.equal(complete.progress.remaining, 0)
  assert.equal(complete.progress.percent, 100)
})

test('a disabled item disappears from the manager checklist but keeps its history', async () => {
  const db = new FakeManagerDb()
  seedItems(db, 'p1', ['Cleaning', 'Sweeping'])
  const sweeping = db.items[1]
  await setManagerChecklistCompletion(db.client, 'm1', 'p1', sweeping.id, '2026-09-25', true)

  await updateAdminChecklistItem(db.client, 'p1', sweeping.id, { isActive: false })

  const view = await getManagerChecklist(db.client, 'm1', 'p1', '2026-09-25')
  assert.deepStrictEqual(view.items.map((entry) => entry.title), ['Cleaning'])
  // The completion record for the disabled task is retained.
  assert.equal(db.completionHistory.length, 1)
  assert.equal(db.completionHistory[0].itemId, sweeping.id)
})

test('a disabled or deleted item can no longer be completed', async () => {
  const db = new FakeManagerDb()
  seedItems(db, 'p1', ['Sweeping'])
  const sweeping = db.items[0]

  await updateAdminChecklistItem(db.client, 'p1', sweeping.id, { isActive: false })
  await assert.rejects(
    () => setManagerChecklistCompletion(db.client, 'm1', 'p1', sweeping.id, '2026-09-25', true),
    NotFoundError
  )

  await updateAdminChecklistItem(db.client, 'p1', sweeping.id, { isActive: true })
  await deleteAdminChecklistItem(db.client, 'p1', sweeping.id)
  await assert.rejects(
    () => setManagerChecklistCompletion(db.client, 'm1', 'p1', sweeping.id, '2026-09-25', true),
    NotFoundError
  )
})

test('an item belonging to another property cannot be completed', async () => {
  const db = new FakeManagerDb()
  seedItems(db, 'p1', ['Cleaning'])
  seedItems(db, 'p2', ['Check AC'])
  const fromP2 = db.items[1]

  await assert.rejects(
    () => setManagerChecklistCompletion(db.client, 'm1', 'p1', fromP2.id, '2026-09-25', true),
    NotFoundError
  )
})

// ── admin configuration ─────────────────────────────────────────────────────

test('the admin can add a task and the manager immediately sees it', async () => {
  const db = new FakeManagerDb()
  const created = await createAdminChecklistItem(db.client, 'p1', {
    title: 'Check AC Remote',
    description: 'Remote goes back in the drawer',
    isActive: true,
  })
  assert.equal(created.title, 'Check AC Remote')
  assert.equal(created.sortOrder, 0)

  const second = await createAdminChecklistItem(db.client, 'p1', {
    title: 'Fill Drinking Water',
    description: null,
    isActive: true,
  })
  assert.equal(second.sortOrder, 1)

  const view = await getManagerChecklist(db.client, 'm1', 'p1', '2026-09-25')
  assert.deepStrictEqual(
    view.items.map((entry) => entry.title),
    ['Check AC Remote', 'Fill Drinking Water']
  )
  assert.equal(view.items[0].description, 'Remote goes back in the drawer')
})

test('the admin can rename and toggle a task', async () => {
  const db = new FakeManagerDb()
  await createAdminChecklistItem(db.client, 'p1', { title: 'Sweeping', description: null, isActive: true })
  const id = db.items[0].id

  const renamed = await updateAdminChecklistItem(db.client, 'p1', id, { title: 'Dry sweeping' })
  assert.equal(renamed.title, 'Dry sweeping')

  const disabled = await updateAdminChecklistItem(db.client, 'p1', id, { isActive: false })
  assert.equal(disabled.isActive, false)
})

test('reordering persists a sortOrder the manager receives', async () => {
  const db = new FakeManagerDb()
  seedItems(db, 'p1', ['A', 'B', 'C'])

  const items = await reorderAdminChecklistItems(db.client, 'p1', ['i3', 'i1', 'i2'])
  assert.deepStrictEqual(items.map((item) => item.title), ['C', 'A', 'B'])

  const view = await getManagerChecklist(db.client, 'm1', 'p1', '2026-09-25')
  assert.deepStrictEqual(view.items.map((entry) => entry.title), ['C', 'A', 'B'])
})

test('a reorder that drops a task is refused', async () => {
  const db = new FakeManagerDb()
  seedItems(db, 'p1', ['A', 'B', 'C'])
  await assert.rejects(() => reorderAdminChecklistItems(db.client, 'p1', ['i1', 'i2']), ConflictError)
  await assert.rejects(() => reorderAdminChecklistItems(db.client, 'p1', ['i1', 'i2', 'i9']), ConflictError)
})

test('deleting a task is a soft delete that keeps historical completions', async () => {
  const db = new FakeManagerDb()
  seedItems(db, 'p1', ['Cleaning', 'Sweeping'])
  const sweeping = db.items[1]
  await setManagerChecklistCompletion(db.client, 'm1', 'p1', sweeping.id, '2026-09-25', true)

  const result = await deleteAdminChecklistItem(db.client, 'p1', sweeping.id)
  assert.deepStrictEqual(result, { deleted: true, retainedCompletionRecords: 1 })

  // The row still exists, so past records remain meaningful.
  assert.equal(db.items.filter((row) => row.id === sweeping.id).length, 1)
  assert.ok(db.items.find((row) => row.id === sweeping.id)?.deletedAt instanceof Date)
  // But it is gone from the manager view and from the admin's active list.
  const view = await getManagerChecklist(db.client, 'm1', 'p1', '2026-09-25')
  assert.deepStrictEqual(view.items.map((entry) => entry.title), ['Cleaning'])
  const active = await listAdminChecklistItems(db.client, 'p1', false)
  assert.deepStrictEqual(active.map((item) => item.title), ['Cleaning'])
  // The admin can still see it, with its retained record count.
  const all = await listAdminChecklistItems(db.client, 'p1', true)
  assert.equal(all.length, 2)
  assert.equal(all.find((item) => item.id === sweeping.id)?.completionCount, 1)
})

test('a deleted item is excluded from reorder bookkeeping', async () => {
  const db = new FakeManagerDb()
  seedItems(db, 'p1', ['A', 'B'])
  await deleteAdminChecklistItem(db.client, 'p1', 'i2')
  // Only the surviving task may be listed.
  const items = await reorderAdminChecklistItems(db.client, 'p1', ['i1'])
  assert.deepStrictEqual(items.map((item) => item.title), ['A'])
})

test('checklist operations for an unknown property are 404s', async () => {
  const db = new FakeManagerDb()
  await assert.rejects(() => listAdminChecklistItems(db.client, 'nope'), NotFoundError)
  await assert.rejects(
    () => createAdminChecklistItem(db.client, 'nope', { title: 'x', description: null, isActive: true }),
    NotFoundError
  )
})

// ── WhatsApp report ─────────────────────────────────────────────────────────

const REPORT_TIME = new Date('2026-09-25T17:05:00.000Z') // 22:35 IST

test('the report message carries property, manager, IST date/time and the report', () => {
  const message = buildManagerReportMessage({
    propertyName: 'Aura Cozy Penthouse 2',
    managerUsername: 'manager',
    report: 'Penthouse 2 bathroom tap is leaking.',
    at: REPORT_TIME,
  })
  assert.match(message, /^AURA HOMES — MANAGER REPORT/)
  assert.ok(message.includes('Property: Aura Cozy Penthouse 2'))
  assert.ok(message.includes('Manager: manager'))
  assert.ok(message.includes('Date: 25/09/2026'))
  assert.ok(message.includes('Time: 10:35 PM'))
  assert.ok(message.includes('Report:\nPenthouse 2 bathroom tap is leaking.'))
})

test('the report timestamp is rendered in India Standard Time', () => {
  assert.deepStrictEqual(formatManagerReportTimestamp(REPORT_TIME), {
    date: '25/09/2026',
    time: '10:35 PM',
  })
  // 18:30 UTC is midnight the next day in IST.
  const midnight = formatManagerReportTimestamp(new Date('2026-09-25T18:30:00.000Z'))
  assert.equal(midnight.date, '26/09/2026')
  assert.equal(midnight.time, '12:00 AM')
})

test('the report uses the configured AURA HOMES WhatsApp number, never a new one', () => {
  const original = process.env.AURA_WHATSAPP_NUMBER
  process.env.AURA_WHATSAPP_NUMBER = '+91 98765 43210'
  try {
    assert.equal(getManagerReportRecipient(), '919876543210')
    const { url, recipient, message } = buildManagerReportUrl({
      propertyName: 'Aura Cozy Penthouse 2',
      managerUsername: 'manager',
      report: 'Tap leaking',
      at: REPORT_TIME,
    })
    assert.equal(recipient, '919876543210')
    assert.ok(url.startsWith('https://wa.me/919876543210?text='))
    // The message is URL-encoded, so spaces/newlines can never break the link.
    assert.ok(!url.includes(' '))
    assert.ok(!url.includes('\n'))
    const decoded = decodeURIComponent(url.split('?text=')[1])
    assert.equal(decoded, message)
    assert.ok(decoded.includes('Aura Cozy Penthouse 2'))
  } finally {
    if (original === undefined) delete process.env.AURA_WHATSAPP_NUMBER
    else process.env.AURA_WHATSAPP_NUMBER = original
  }
})

test('an unconfigured WhatsApp number is reported instead of opening a broken link', () => {
  const original = process.env.AURA_WHATSAPP_NUMBER
  delete process.env.AURA_WHATSAPP_NUMBER
  try {
    assert.equal(getManagerReportRecipient(), null)
    assert.throws(
      () =>
        buildManagerReportUrl({
          propertyName: 'Aura Cozy Penthouse 1',
          managerUsername: 'manager',
          report: 'Broken tap',
        }),
      /not configured/i
    )
  } finally {
    if (original !== undefined) process.env.AURA_WHATSAPP_NUMBER = original
  }
})

test('a report is resolved against the real property name before it is sent', async () => {
  const original = process.env.AURA_WHATSAPP_NUMBER
  process.env.AURA_WHATSAPP_NUMBER = '919876543210'
  const db = new FakeManagerDb()
  try {
    const prepared = await prepareManagerReport(db.client, {
      propertyId: 'p2',
      managerUsername: 'manager',
      report: '  Bathroom tap is leaking.  ',
      at: REPORT_TIME,
    })
    assert.equal(prepared.propertyName, 'Aura Cozy Penthouse 2')
    const decoded = decodeURIComponent(prepared.url.split('?text=')[1])
    assert.ok(decoded.includes('Property: Aura Cozy Penthouse 2'))
    // Surrounding whitespace is trimmed out of the message body.
    assert.ok(decoded.includes('Report:\nBathroom tap is leaking.\n') === false)
    assert.ok(decoded.includes('Report:\nBathroom tap is leaking.'))
  } finally {
    if (original === undefined) delete process.env.AURA_WHATSAPP_NUMBER
    else process.env.AURA_WHATSAPP_NUMBER = original
  }
})

test('an empty or oversized report is refused', async () => {
  const original = process.env.AURA_WHATSAPP_NUMBER
  process.env.AURA_WHATSAPP_NUMBER = '919876543210'
  const db = new FakeManagerDb()
  try {
    await assert.rejects(
      () => prepareManagerReport(db.client, { propertyId: 'p1', managerUsername: 'manager', report: '   ' }),
      /Describe the issue/
    )
    await assert.rejects(
      () =>
        prepareManagerReport(db.client, {
          propertyId: 'p1',
          managerUsername: 'manager',
          report: 'x'.repeat(1501),
        }),
      /1500 characters/
    )
    await assert.rejects(
      () => prepareManagerReport(db.client, { propertyId: 'nope', managerUsername: 'manager', report: 'x' }),
      NotFoundError
    )
  } finally {
    if (original === undefined) delete process.env.AURA_WHATSAPP_NUMBER
    else process.env.AURA_WHATSAPP_NUMBER = original
  }
})
