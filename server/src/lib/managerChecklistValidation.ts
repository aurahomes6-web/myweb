import { isDateString, todayKey } from './dateUtils.js'

/**
 * Validation for the manager checklist system.
 *
 * Checklist DEFINITIONS (title/description/order/active) are admin-owned and are
 * validated here; daily completions are a separate, server-derived concept
 * (property + date + item + manager) and are never accepted from the client
 * beyond an optional day key.
 */

export const MAX_CHECKLIST_TITLE_LENGTH = 120
export const MAX_CHECKLIST_DESCRIPTION_LENGTH = 300
export const MAX_CHECKLIST_ITEMS = 100
export const MAX_MANAGER_REPORT_LENGTH = 1500

export interface ValidationIssue {
  field: string
  message: string
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] }

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function bool(value: unknown): boolean | null {
  if (value === undefined) return null
  return typeof value === 'boolean' ? value : null
}

export interface ChecklistItemInput {
  title: string
  description: string | null
  isActive: boolean
}

export function parseChecklistItemCreate(body: unknown): ParseResult<ChecklistItemInput> {
  const source = (body ?? {}) as Record<string, unknown>
  const issues: ValidationIssue[] = []

  const title = str(source.title).trim()
  if (title.length === 0) {
    issues.push({ field: 'title', message: 'Enter the checklist task name.' })
  } else if (title.length > MAX_CHECKLIST_TITLE_LENGTH) {
    issues.push({
      field: 'title',
      message: `Task name must be ${MAX_CHECKLIST_TITLE_LENGTH} characters or fewer.`,
    })
  }

  const rawDescription = source.description
  const description =
    rawDescription === undefined || rawDescription === null ? null : str(rawDescription).trim()
  if (description !== null && description.length > MAX_CHECKLIST_DESCRIPTION_LENGTH) {
    issues.push({
      field: 'description',
      message: `Description must be ${MAX_CHECKLIST_DESCRIPTION_LENGTH} characters or fewer.`,
    })
  }
  if (description === '') {
    issues.push({ field: 'description', message: 'Description cannot be blank when provided.' })
  }

  const rawActive = bool(source.isActive)
  if (rawActive === null && source.isActive !== undefined) {
    issues.push({ field: 'isActive', message: 'isActive must be true or false.' })
  }

  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, value: { title, description, isActive: rawActive ?? true } }
}

export interface ChecklistItemUpdate {
  title?: string
  description?: string | null
  isActive?: boolean
}

export function parseChecklistItemUpdate(body: unknown): ParseResult<ChecklistItemUpdate> {
  const source = (body ?? {}) as Record<string, unknown>
  const issues: ValidationIssue[] = []
  const value: ChecklistItemUpdate = {}

  if (source.title !== undefined) {
    const title = str(source.title).trim()
    if (title.length === 0) {
      issues.push({ field: 'title', message: 'Enter the checklist task name.' })
    } else if (title.length > MAX_CHECKLIST_TITLE_LENGTH) {
      issues.push({
        field: 'title',
        message: `Task name must be ${MAX_CHECKLIST_TITLE_LENGTH} characters or fewer.`,
      })
    } else {
      value.title = title
    }
  }

  if (source.description !== undefined) {
    const description = str(source.description).trim()
    if (description.length > MAX_CHECKLIST_DESCRIPTION_LENGTH) {
      issues.push({
        field: 'description',
        message: `Description must be ${MAX_CHECKLIST_DESCRIPTION_LENGTH} characters or fewer.`,
      })
    } else {
      value.description = description === '' ? null : description
    }
  }

  if (source.isActive !== undefined) {
    const isActive = bool(source.isActive)
    if (isActive === null) {
      issues.push({ field: 'isActive', message: 'isActive must be true or false.' })
    } else {
      value.isActive = isActive
    }
  }

  if (Object.keys(value).length === 0 && issues.length === 0) {
    issues.push({ field: 'body', message: 'Provide at least one field to update.' })
  }

  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, value }
}

export interface ChecklistReorder {
  ids: string[]
}

export function parseChecklistReorder(body: unknown): ParseResult<ChecklistReorder> {
  const source = (body ?? {}) as Record<string, unknown>
  const ids = Array.isArray(source.ids) ? source.ids.filter((id): id is string => typeof id === 'string') : []

  if (ids.length === 0) {
    return {
      ok: false,
      issues: [{ field: 'ids', message: 'Provide the full checklist order as an array of ids.' }],
    }
  }
  if (ids.length > MAX_CHECKLIST_ITEMS) {
    return {
      ok: false,
      issues: [
        { field: 'ids', message: `A checklist can hold ${MAX_CHECKLIST_ITEMS} tasks or fewer.` },
      ],
    }
  }
  if (new Set(ids).size !== ids.length) {
    return { ok: false, issues: [{ field: 'ids', message: 'Each task id may appear only once.' }] }
  }
  return { ok: true, value: { ids } }
}

/**
 * The checklist day. Defaults to today so a manager never has to think about
 * dates; a past day can be requested explicitly for review.
 */
export function parseChecklistDate(raw: unknown, today: string = todayKey()): ParseResult<{ dateKey: string }> {
  const value = str(raw).trim()
  if (value === '') return { ok: true, value: { dateKey: today } }
  if (!isDateString(value)) {
    return {
      ok: false,
      issues: [{ field: 'date', message: 'Provide a valid date (YYYY-MM-DD).' }],
    }
  }
  return { ok: true, value: { dateKey: value } }
}

export interface ManagerReportInput {
  message: string
}

export function parseManagerReport(body: unknown): ParseResult<ManagerReportInput> {
  const source = (body ?? {}) as Record<string, unknown>
  const message = str(source.message).trim()

  if (message.length === 0) {
    return { ok: false, issues: [{ field: 'message', message: 'Describe the issue before sending.' }] }
  }
  if (message.length > MAX_MANAGER_REPORT_LENGTH) {
    return {
      ok: false,
      issues: [
        { field: 'message', message: `Report must be ${MAX_MANAGER_REPORT_LENGTH} characters or fewer.` },
      ],
    }
  }
  return { ok: true, value: { message } }
}

/** Draft/acknowledgement text for a manager checklist completion. */
export function parseCompletionToggle(body: unknown): ParseResult<{ completed: boolean }> {
  const source = (body ?? {}) as Record<string, unknown>
  if (typeof source.completed !== 'boolean') {
    return {
      ok: false,
      issues: [{ field: 'completed', message: 'completed must be true or false.' }],
    }
  }
  return { ok: true, value: { completed: source.completed } }
}
