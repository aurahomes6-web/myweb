import type { PrismaClient } from '../generated/prisma/client.js'
import { NotFoundError, BadRequestError } from './adminService.js'
import { propertyDisplayOrderBy } from '../lib/propertyOrder.js'
import { formatDateKey, todayKey } from '../lib/dateUtils.js'
import { MAX_MANAGER_REPORT_LENGTH } from '../lib/managerChecklistValidation.js'
import { getWhatsAppStatus } from './notificationService.js'

/**
 * Manager-facing services: property selection, the DAILY checklist and the
 * WhatsApp report hand-off.
 *
 * Two rules shape this module:
 *  1. A completion belongs to (property, day, item, manager). Ticking a box
 *     today never marks the task done tomorrow, and a manager can never mark
 *     somebody else's completion.
 *  2. The report opens WhatsApp using the SAME `AURA_WHATSAPP_NUMBER` the
 *     booking notifications already use. No second number is introduced and
 *     nothing is hardcoded; if it is not configured the caller is told so.
 *
 * Opening WhatsApp is all this does — it never claims the message was sent.
 */

export interface ManagerPropertyOption {
  id: string
  name: string
  slug: string
}

export interface ManagerChecklistItemView {
  id: string
  title: string
  description: string | null
  sortOrder: number
  isCompleted: boolean
  completedAt: string | null
}

export interface ManagerChecklistProgress {
  total: number
  completed: number
  remaining: number
  /** 0–100, rounded. */
  percent: number
}

export interface ManagerChecklistView {
  propertyId: string
  propertyName: string
  dateKey: string
  items: ManagerChecklistItemView[]
  progress: ManagerChecklistProgress
}

const itemOrderBy = [
  { sortOrder: 'asc' as const },
  { createdAt: 'asc' as const },
  { id: 'asc' as const },
]

/** Canonical home order (Penthouse 1 → 2 → 3) straight from the database. */
export async function listManagerProperties(client: PrismaClient): Promise<ManagerPropertyOption[]> {
  const rows = await client.property.findMany({
    orderBy: propertyDisplayOrderBy,
    select: { id: true, name: true, slug: true },
  })
  return rows
}

function buildProgress(total: number, completed: number): ManagerChecklistProgress {
  return {
    total,
    completed,
    remaining: Math.max(total - completed, 0),
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  }
}

/**
 * Today's checklist for one home. Only ACTIVE, non-deleted items are returned;
 * disabled items disappear from new sessions while their historical completion
 * records stay in the database untouched.
 */
export async function getManagerChecklist(
  client: PrismaClient,
  managerId: string,
  propertyId: string,
  dateKey: string
): Promise<ManagerChecklistView> {
  const property = await client.property.findUnique({
    where: { id: propertyId },
    select: { id: true, name: true },
  })
  if (!property) throw new NotFoundError('Property not found.')

  const items = await client.managerChecklistItem.findMany({
    where: { propertyId, isActive: true, deletedAt: null },
    orderBy: itemOrderBy,
    select: { id: true, title: true, description: true, sortOrder: true },
  })

  const completions =
    items.length === 0
      ? []
      : await client.managerChecklistCompletion.findMany({
          where: {
            managerId,
            propertyId,
            dateKey,
            itemId: { in: items.map((item) => item.id) },
          },
          select: { itemId: true, isCompleted: true, completedAt: true },
        })

  const byItem = new Map(completions.map((row) => [row.itemId, row]))
  const view: ManagerChecklistItemView[] = items.map((item) => {
    const completion = byItem.get(item.id)
    return {
      id: item.id,
      title: item.title,
      description: item.description,
      sortOrder: item.sortOrder,
      isCompleted: completion?.isCompleted ?? false,
      completedAt: completion?.completedAt ? completion.completedAt.toISOString() : null,
    }
  })

  const completed = view.filter((item) => item.isCompleted).length
  return {
    propertyId: property.id,
    propertyName: property.name,
    dateKey,
    items: view,
    progress: buildProgress(view.length, completed),
  }
}

/**
 * Tick / untick one task for one day. The (item, manager, day) unique key means
 * a re-tick updates the same row instead of appending duplicates, and a task
 * that is disabled or soft-deleted can no longer be completed.
 */
export async function setManagerChecklistCompletion(
  client: PrismaClient,
  managerId: string,
  propertyId: string,
  itemId: string,
  dateKey: string,
  completed: boolean
): Promise<{ propertyId: string; itemId: string; dateKey: string; isCompleted: boolean; completedAt: string | null }> {
  const item = await client.managerChecklistItem.findFirst({
    where: { id: itemId, propertyId, isActive: true, deletedAt: null },
    select: { id: true, propertyId: true },
  })
  if (!item) throw new NotFoundError('Checklist task not found for this property.')

  const now = new Date()
  const row = await client.managerChecklistCompletion.upsert({
    where: { itemId_managerId_dateKey: { itemId, managerId, dateKey } },
    create: {
      itemId,
      managerId,
      propertyId,
      dateKey,
      isCompleted: completed,
      completedAt: completed ? now : null,
    },
    update: {
      isCompleted: completed,
      completedAt: completed ? now : null,
    },
    select: { itemId: true, isCompleted: true, completedAt: true },
  })

  return {
    propertyId,
    itemId: row.itemId,
    dateKey,
    isCompleted: row.isCompleted,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  }
}

// ── WhatsApp report ─────────────────────────────────────────────────────────

/** India Standard Time, so the stamp matches the penthouses' wall clock. */
export const MANAGER_REPORT_TIMEZONE = 'Asia/Kolkata'

function partsIn(timeZone: string, date: Date) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
  const map: Record<string, string> = {}
  for (const part of formatter.formatToParts(date)) map[part.type] = part.value
  return map
}

/** 25/09/2026 + 10:35 PM */
export function formatManagerReportTimestamp(
  date: Date = new Date(),
  timeZone: string = MANAGER_REPORT_TIMEZONE
): { date: string; time: string } {
  const parts = partsIn(timeZone, date)
  const time = `${parts.hour}:${parts.minute} ${(parts.dayPeriod ?? '').toUpperCase()}`.trim()
  return { date: `${parts.day}/${parts.month}/${parts.year}`, time }
}

/** '25/09/2026' (the IST stamp above) → '2026-09-25', for `formatDateKey`. */
function istStampToDateKey(stamp: string): string {
  const [day, month, year] = stamp.split('/')
  return `${year}-${month}-${day}`
}

/**
 * The pre-filled manager report. Property, manager, date and time are
 * server-composed so the manager only types the report itself.
 *
 * `dateKey` is the checklist DAY the report is about, so a manager looking at
 * 26 Sep can file it under 26 Sep even at midnight. It is rendered from the
 * stored `YYYY-MM-DD` key via `formatDateKey`, never from a `Date` object, so
 * UTC conversion can never shift the day. Omitting it falls back to the current
 * IST calendar day.
 */
export function buildManagerReportMessage(input: {
  propertyName: string
  managerUsername: string
  report: string
  dateKey?: string
  at?: Date
}): string {
  const stamp = formatManagerReportTimestamp(input.at ?? new Date())
  const day = input.dateKey
    ? formatDateKey(input.dateKey)
    : formatDateKey(istStampToDateKey(stamp.date))
  return [
    'AURA HOMES — MANAGER REPORT',
    '',
    `Date: ${day}`,
    `Property: ${input.propertyName}`,
    `Manager: ${input.managerUsername}`,
    `Time: ${stamp.time}`,
    '',
    'Report:',
    input.report,
  ].join('\n')
}

/** The configured AURA HOMES admin WhatsApp number, digits only, or null. */
export function getManagerReportRecipient(): string | null {
  const status = getWhatsAppStatus()
  if (status.status === 'NOT_CONFIGURED') return null
  const digits = (status.recipient ?? '').replace(/\D/g, '')
  return digits.length > 0 ? digits : null
}

/**
 * Build the wa.me click-to-chat link. Throws when WhatsApp is not configured so
 * the UI can say so instead of opening a broken URL. Opening the conversation
 * is all that happens — the manager still presses send in WhatsApp.
 */
export function buildManagerReportUrl(input: {
  propertyName: string
  managerUsername: string
  report: string
  dateKey?: string
  at?: Date
}): { url: string; recipient: string; message: string } {
  const recipient = getManagerReportRecipient()
  if (recipient === null) {
    throw new BadRequestError(
      'WhatsApp is not configured for AURA HOMES yet, so the report cannot be prepared.'
    )
  }
  const message = buildManagerReportMessage(input)
  return { recipient, message, url: `https://wa.me/${recipient}?text=${encodeURIComponent(message)}` }
}

/**
 * Validate a manager report against the chosen home and build its WhatsApp link.
 * The message body is composed entirely on the server (property name, manager,
 * IST date/time, report) so the client never assembles or hardcodes any of it.
 */
export async function prepareManagerReport(
  client: PrismaClient,
  input: { propertyId: string; managerUsername: string; report: string; dateKey?: string; at?: Date }
): Promise<{ url: string; recipient: string; message: string; propertyName: string; dateKey: string }> {
  const property = await client.property.findUnique({
    where: { id: input.propertyId },
    select: { id: true, name: true },
  })
  if (!property) throw new NotFoundError('Property not found.')

  const report = input.report.trim()
  if (report.length === 0) {
    throw new BadRequestError('Describe the issue before sending.')
  }
  if (report.length > MAX_MANAGER_REPORT_LENGTH) {
    throw new BadRequestError(`Report must be ${MAX_MANAGER_REPORT_LENGTH} characters or fewer.`)
  }

  const dateKey = input.dateKey ?? todayKey()
  const link = buildManagerReportUrl({
    propertyName: property.name,
    managerUsername: input.managerUsername,
    report,
    dateKey,
    ...(input.at ? { at: input.at } : {}),
  })
  return { ...link, propertyName: property.name, dateKey }
}
