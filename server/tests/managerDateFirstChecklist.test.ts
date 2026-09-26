import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildManagerReportMessage,
  getManagerChecklist,
  listManagerProperties,
  prepareManagerReport,
  setManagerChecklistCompletion,
} from '../src/services/managerService.js'
import { parseChecklistDate } from '../src/lib/managerChecklistValidation.js'
import { formatDateKey } from '../src/lib/dateUtils.js'

/**
 * The manager checklist is DATE-FIRST: a completion belongs to exactly one
 * (date, property, item, manager) tuple, so the same task is pending again on a
 * different day and on a different home. These tests pin that isolation down
 * against the real service functions.
 */

type Row = Record<string, any>

class FakeDb {
  properties: Row[] = [
    { id: 'p1', name: 'Aura Cozy Penthouse 1', slug: 'aura-cozy-penthouse-1', sortOrder: 1 },
    { id: 'p2', name: 'Aura Cozy Penthouse 2', slug: 'aura-cozy-penthouse-2', sortOrder: 2 },
    { id: 'p3', name: 'Aura Cozy Penthouse 3', slug: 'aura-cozy-penthouse-3', sortOrder: 3 },
  ]
  items: Row[] = []
  completions: Row[] = []
  nextId = 1

  get client(): never {
    const self = this
    return {
      property: {
        findMany: async ({ orderBy }: { orderBy?: Row[] } = {}) => {
          const rows = [...self.properties]
          if (orderBy) rows.sort((a, b) => a.sortOrder - b.sortOrder)
          return rows.map(({ id, name, slug }) => ({ id, name, slug }))
        },
        findUnique: async ({ where }: { where: { id: string } }) => {
          const row = self.properties.find((item) => item.id === where.id)
          return row ? { id: row.id, name: row.name } : null
        },
      },
      managerChecklistItem: {
        findMany: async ({ where }: { where?: Row } = {}) =>
          self.items
            .filter(
              (item) =>
                item.propertyId === where?.propertyId &&
                (where?.deletedAt === null ? item.deletedAt === null : true) &&
                (where?.isActive === true ? item.isActive : true)
            )
            .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
            .map((row) => ({ ...row })),
        findFirst: async ({ where }: { where?: Row } = {}) => {
          const row = self.items.find(
            (item) =>
              item.id === where?.id &&
              item.propertyId === where?.propertyId &&
              (where?.deletedAt !== null || item.deletedAt === null) &&
              (where?.isActive === undefined || item.isActive === where.isActive)
          )
          return row ? { id: row.id, propertyId: row.propertyId, sortOrder: row.sortOrder } : null
        },
      },
      managerChecklistCompletion: {
        findMany: async ({ where }: { where?: Row } = {}) =>
          self.completions.filter(
            (row) =>
              (!where?.managerId || row.managerId === where.managerId) &&
              (!where?.propertyId || row.propertyId === where.propertyId) &&
              (!where?.dateKey || row.dateKey === where.dateKey) &&
              (!where?.itemId?.in || where.itemId.in.includes(row.itemId))
          ),
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
          return { ...row }
        },
      },
    } as never
  }
}

function seed(db: FakeDb, propertyId: string, titles: string[]): string[] {
  const ids: string[] = []
  for (const title of titles) {
    const id = `i${db.nextId++}`
    ids.push(id)
    db.items.push({
      id,
      propertyId,
      title,
      description: null,
      isActive: true,
      deletedAt: null,
      sortOrder: db.items.length,
      createdAt: new Date(1_700_000_000_000 + db.nextId * 1000),
    })
  }
  return ids
}

const DAY_1 = '2026-09-26'
const DAY_2 = '2026-09-27'
const PAST = '2025-12-25'
const FUTURE = '2027-01-15'

// ── the checklist is only ever read for one day at a time ───────────────────

test('a day with no completion shows every active task unchecked', async () => {
  const db = new FakeDb()
  seed(db, 'p1', ['Cleaning', 'Fill Water', 'Check AC'])

  const checklist = await getManagerChecklist(db.client, 'm1', 'p1', DAY_1)
  assert.equal(checklist.dateKey, DAY_1)
  assert.deepStrictEqual(
    checklist.items.map((item) => item.isCompleted),
    [false, false, false]
  )
  assert.deepStrictEqual(checklist.progress, { total: 3, completed: 0, remaining: 3, percent: 0 })
})

test('completing a task on one day does not complete it on the next day', async () => {
  const db = new FakeDb()
  const [cleaning] = seed(db, 'p1', ['Cleaning', 'Fill Water'])

  await setManagerChecklistCompletion(db.client, 'm1', 'p1', cleaning, DAY_1, true)

  const day1 = await getManagerChecklist(db.client, 'm1', 'p1', DAY_1)
  assert.equal(day1.items[0]!.isCompleted, true)
  assert.deepStrictEqual(day1.progress, { total: 2, completed: 1, remaining: 1, percent: 50 })

  // Tomorrow starts from its own state.
  const day2 = await getManagerChecklist(db.client, 'm1', 'p1', DAY_2)
  assert.equal(day2.dateKey, DAY_2)
  assert.deepStrictEqual(
    day2.items.map((item) => item.isCompleted),
    [false, false]
  )
  assert.deepStrictEqual(day2.progress, { total: 2, completed: 0, remaining: 2, percent: 0 })
})

test('the same task on a different home has an independent completion state', async () => {
  const db = new FakeDb()
  const [p1Cleaning] = seed(db, 'p1', ['Cleaning', 'Fill Water'])
  const [p2Cleaning] = seed(db, 'p2', ['Cleaning'])

  await setManagerChecklistCompletion(db.client, 'm1', 'p1', p1Cleaning, DAY_1, true)

  const other = await getManagerChecklist(db.client, 'm1', 'p2', DAY_1)
  assert.equal(other.propertyId, 'p2')
  assert.equal(other.items[0]!.isCompleted, false)

  // Completing p2 leaves p1's day untouched.
  await setManagerChecklistCompletion(db.client, 'm1', 'p2', p2Cleaning, DAY_1, true)
  const back = await getManagerChecklist(db.client, 'm1', 'p1', DAY_1)
  assert.equal(back.items[0]!.isCompleted, true)
  const again = await getManagerChecklist(db.client, 'm1', 'p2', DAY_1)
  assert.equal(again.items[0]!.isCompleted, true)
})

test('a historical day reloads its saved completion state', async () => {
  const db = new FakeDb()
  const [cleaning, water] = seed(db, 'p1', ['Cleaning', 'Fill Water'])

  await setManagerChecklistCompletion(db.client, 'm1', 'p1', cleaning, PAST, true)
  await setManagerChecklistCompletion(db.client, 'm1', 'p1', water, PAST, true)

  const past = await getManagerChecklist(db.client, 'm1', 'p1', PAST)
  assert.equal(past.dateKey, PAST)
  assert.deepStrictEqual(past.progress, { total: 2, completed: 2, remaining: 0, percent: 100 })
})

test('a future day with no completion starts completely unchecked', async () => {
  const db = new FakeDb()
  const [cleaning] = seed(db, 'p1', ['Cleaning', 'Fill Water'])
  await setManagerChecklistCompletion(db.client, 'm1', 'p1', cleaning, DAY_1, true)

  const future = await getManagerChecklist(db.client, 'm1', 'p1', FUTURE)
  assert.equal(future.dateKey, FUTURE)
  assert.deepStrictEqual(
    future.items.map((item) => item.isCompleted),
    [false, false]
  )
  assert.equal(future.progress.percent, 0)
})

test('progress is recalculated for every day and home', async () => {
  const db = new FakeDb()
  const ids = seed(db, 'p1', ['A', 'B', 'C', 'D', 'E'])
  for (const id of ids.slice(0, 2)) {
    await setManagerChecklistCompletion(db.client, 'm1', 'p1', id, DAY_1, true)
  }

  const day1 = await getManagerChecklist(db.client, 'm1', 'p1', DAY_1)
  assert.deepStrictEqual(day1.progress, { total: 5, completed: 2, remaining: 3, percent: 40 })

  const day2 = await getManagerChecklist(db.client, 'm1', 'p1', DAY_2)
  assert.deepStrictEqual(day2.progress, { total: 5, completed: 0, remaining: 5, percent: 0 })
})

test('re-ticking the same day updates one row instead of appending', async () => {
  const db = new FakeDb()
  const [cleaning] = seed(db, 'p1', ['Cleaning'])

  await setManagerChecklistCompletion(db.client, 'm1', 'p1', cleaning, DAY_1, true)
  await setManagerChecklistCompletion(db.client, 'm1', 'p1', cleaning, DAY_1, false)

  assert.equal(db.completions.length, 1)
  assert.equal(db.completions[0]!.isCompleted, false)
  assert.equal(db.completions[0]!.completedAt, null)
})

test('one manager never inherits another manager\'s completion', async () => {
  const db = new FakeDb()
  const [cleaning] = seed(db, 'p1', ['Cleaning'])

  await setManagerChecklistCompletion(db.client, 'm1', 'p1', cleaning, DAY_1, true)

  const other = await getManagerChecklist(db.client, 'm2', 'p1', DAY_1)
  assert.equal(other.items[0]!.isCompleted, false)
})

test('the homes keep their canonical order regardless of the day chosen', async () => {
  const db = new FakeDb()
  const properties = await listManagerProperties(db.client)
  assert.deepStrictEqual(
    properties.map((property) => property.slug),
    ['aura-cozy-penthouse-1', 'aura-cozy-penthouse-2', 'aura-cozy-penthouse-3']
  )
})

// ── the day is validated and never timezone-shifted ─────────────────────────

test('a blank day falls back to today so an old client still works', () => {
  const parsed = parseChecklistDate(undefined, '2026-09-26')
  assert.deepStrictEqual(parsed, { ok: true, value: { dateKey: '2026-09-26' } })
})

test('an invalid day is rejected rather than silently becoming today', () => {
  for (const bad of ['26-09-2026', '2026/09/26', 'yesterday', '2026-13-01', '2026-02-31']) {
    const parsed = parseChecklistDate(bad)
    assert.equal(parsed.ok, false, `expected ${bad} to be rejected`)
  }
})

test('the accepted day is exactly the calendar day the manager picked', () => {
  // Near midnight the IST clock and the UTC clock disagree; the stored key must
  // still be the day that was chosen, never the neighbouring one.
  const parsed = parseChecklistDate('2026-09-26')
  assert.equal(parsed.ok, true)
  if (parsed.ok) assert.equal(parsed.value.dateKey, '2026-09-26')
  assert.equal(formatDateKey('2026-09-26'), '26 Sep 2026')
  assert.equal(formatDateKey('2026-01-01'), '1 Jan 2026')
})

// ── the report is filed under the selected day ──────────────────────────────

test('the report names the selected day, not the day it was sent', () => {
  const message = buildManagerReportMessage({
    propertyName: 'Aura Cozy Penthouse 1',
    managerUsername: 'manager',
    report: 'Bathroom tap is leaking.',
    dateKey: '2026-09-26',
    // Sent just after midnight on the 27th.
    at: new Date('2026-09-26T18:35:00.000Z'),
  })
  assert.ok(message.includes('Date: 26 Sep 2026'), message)
  assert.ok(message.includes('Property: Aura Cozy Penthouse 1'))
  assert.ok(message.includes('Manager: manager'))
  assert.ok(message.includes('Report:\nBathroom tap is leaking.'))
  assert.ok(!message.includes('Date: 27 Sep 2026'))
})

test('a report with no day falls back to the current IST calendar day', () => {
  const message = buildManagerReportMessage({
    propertyName: 'Aura Cozy Penthouse 1',
    managerUsername: 'manager',
    report: 'Broken tap',
    at: new Date('2026-09-25T17:05:00.000Z'),
  })
  assert.ok(message.includes('Date: 25 Sep 2026'), message)
})

test('the prepared report round-trips the selected day', async () => {
  const original = process.env.AURA_WHATSAPP_NUMBER
  process.env.AURA_WHATSAPP_NUMBER = '919876543210'
  const db = new FakeDb()
  try {
    const prepared = await prepareManagerReport(db.client, {
      propertyId: 'p1',
      managerUsername: 'manager',
      report: 'Bathroom tap is leaking.',
      dateKey: DAY_1,
      at: new Date('2026-09-26T18:35:00.000Z'),
    })
    assert.equal(prepared.dateKey, DAY_1)
    assert.equal(prepared.propertyName, 'Aura Cozy Penthouse 1')
    const decoded = decodeURIComponent(prepared.url.split('?text=')[1])
    assert.ok(decoded.includes('Date: 26 Sep 2026'), decoded)
    assert.ok(decoded.includes('Property: Aura Cozy Penthouse 1'))
    assert.ok(decoded.includes('Manager: manager'))
  } finally {
    if (original === undefined) delete process.env.AURA_WHATSAPP_NUMBER
    else process.env.AURA_WHATSAPP_NUMBER = original
  }
})
