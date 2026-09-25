import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_CHECKLIST_DESCRIPTION_LENGTH,
  MAX_CHECKLIST_TITLE_LENGTH,
  MAX_MANAGER_REPORT_LENGTH,
  parseChecklistDate,
  parseChecklistItemCreate,
  parseChecklistItemUpdate,
  parseChecklistReorder,
  parseCompletionToggle,
  parseManagerReport,
} from '../src/lib/managerChecklistValidation.js'

test('a checklist task needs a title', () => {
  const result = parseChecklistItemCreate({})
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.deepStrictEqual(result.issues.map((issue) => issue.field), ['title'])
  }

  const blank = parseChecklistItemCreate({ title: '   ' })
  assert.equal(blank.ok, false)
})

test('a valid task is normalised (trimmed, active by default)', () => {
  const result = parseChecklistItemCreate({
    title: '  Check AC Remote  ',
    description: '  Remote goes back in the drawer  ',
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.value.title, 'Check AC Remote')
  assert.equal(result.value.description, 'Remote goes back in the drawer')
  assert.equal(result.value.isActive, true)
})

test('an absent description is stored as null, not an empty string', () => {
  const result = parseChecklistItemCreate({ title: 'Cleaning' })
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.value.description, null)
})

test('over-long titles and descriptions are refused', () => {
  const title = parseChecklistItemCreate({ title: 'x'.repeat(MAX_CHECKLIST_TITLE_LENGTH + 1) })
  assert.equal(title.ok, false)
  if (!title.ok) assert.equal(title.issues[0].field, 'title')

  const description = parseChecklistItemCreate({
    title: 'Cleaning',
    description: 'x'.repeat(MAX_CHECKLIST_DESCRIPTION_LENGTH + 1),
  })
  assert.equal(description.ok, false)
  if (!description.ok) assert.equal(description.issues[0].field, 'description')
})

test('a non-boolean isActive is rejected', () => {
  const result = parseChecklistItemCreate({ title: 'Cleaning', isActive: 'yes' })
  assert.equal(result.ok, false)
  if (!result.ok) assert.deepStrictEqual(result.issues.map((issue) => issue.field), ['isActive'])
})

test('an update only accepts the fields it is given', () => {
  const titleOnly = parseChecklistItemUpdate({ title: 'Dry sweeping' })
  assert.equal(titleOnly.ok, true)
  if (titleOnly.ok) assert.deepStrictEqual(titleOnly.value, { title: 'Dry sweeping' })

  // Clearing a description is an explicit null, not an empty string.
  const cleared = parseChecklistItemUpdate({ description: '   ' })
  assert.equal(cleared.ok, true)
  if (cleared.ok) assert.equal(cleared.value.description, null)

  const toggle = parseChecklistItemUpdate({ isActive: false })
  assert.equal(toggle.ok, true)
  if (toggle.ok) assert.equal(toggle.value.isActive, false)
})

test('an empty update is refused so a no-op cannot masquerade as a save', () => {
  const result = parseChecklistItemUpdate({})
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.issues[0].field, 'body')
})

test('a reorder must be a non-empty, duplicate-free id list', () => {
  assert.equal(parseChecklistReorder({ ids: [] }).ok, false)
  assert.equal(parseChecklistReorder({}).ok, false)
  assert.equal(parseChecklistReorder({ ids: ['a', 'a'] }).ok, false)

  const ok = parseChecklistReorder({ ids: ['b', 'a'] })
  assert.equal(ok.ok, true)
  if (ok.ok) assert.deepStrictEqual(ok.value.ids, ['b', 'a'])

  // Non-string entries are dropped rather than persisted.
  const filtered = parseChecklistReorder({ ids: ['a', 42, null] })
  assert.equal(filtered.ok, true)
  if (filtered.ok) assert.deepStrictEqual(filtered.value.ids, ['a'])
})

test('the checklist day defaults to today and can be requested explicitly', () => {
  const fallback = parseChecklistDate(undefined, '2026-09-25')
  assert.equal(fallback.ok, true)
  if (fallback.ok) assert.equal(fallback.value.dateKey, '2026-09-25')

  const explicit = parseChecklistDate('2026-01-02')
  assert.equal(explicit.ok, true)
  if (explicit.ok) assert.equal(explicit.value.dateKey, '2026-01-02')

  const bad = parseChecklistDate('25-09-2026')
  assert.equal(bad.ok, false)
  if (!bad.ok) assert.equal(bad.issues[0].field, 'date')
})

test('a completion toggle must be an explicit boolean', () => {
  assert.equal(parseCompletionToggle({ completed: true }).ok, true)
  assert.equal(parseCompletionToggle({ completed: 'true' }).ok, false)
  assert.equal(parseCompletionToggle({}).ok, false)
})

test('a report must say something and stay within the limit', () => {
  assert.equal(parseManagerReport({ message: '   ' }).ok, false)
  assert.equal(parseManagerReport({ message: 'x'.repeat(MAX_MANAGER_REPORT_LENGTH) }).ok, true)
  assert.equal(parseManagerReport({ message: 'x'.repeat(MAX_MANAGER_REPORT_LENGTH + 1) }).ok, false)
  assert.equal(parseManagerReport({ message: '  Tap leaking  ' }).ok, true)
})
