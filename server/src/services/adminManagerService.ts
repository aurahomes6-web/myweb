import type { PrismaClient } from '../generated/prisma/client.js'
import { BadRequestError, ConflictError, NotFoundError } from './adminService.js'
import { MAX_CHECKLIST_ITEMS, type ChecklistItemInput, type ChecklistItemUpdate } from '../lib/managerChecklistValidation.js'

/**
 * ADMIN-side manager checklist configuration.
 *
 * This is configuration only — the admin decides WHAT the managers tick and in
 * which order. The manager session can never reach this module (the routes are
 * mounted behind `requireAdmin`), and nothing here writes booking, Airbnb,
 * payment or coupon data.
 *
 * Audit/data-safety rules:
 *  - Deleting an item SOFT-deletes it (`deletedAt`), because
 *    `ManagerChecklistCompletion.itemId` is ON DELETE RESTRICT: historical daily
 *    completions must survive so past reports stay meaningful.
 *  - Disabling an item only removes it from NEW manager sessions; existing
 *    completion rows are never touched.
 *  - Reordering persists `sortOrder` so managers always receive a stable order.
 */

export interface AdminChecklistItemDto {
  id: string
  propertyId: string
  title: string
  description: string | null
  sortOrder: number
  isActive: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
  /** How many daily completion records reference this item (audit visibility). */
  completionCount: number
}

const itemOrderBy = [
  { sortOrder: 'asc' as const },
  { createdAt: 'asc' as const },
  { id: 'asc' as const },
]

interface RawItem {
  id: string
  propertyId: string
  title: string
  description: string | null
  sortOrder: number
  isActive: boolean
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

function serialize(row: RawItem, completionCount: number): AdminChecklistItemDto {
  return {
    id: row.id,
    propertyId: row.propertyId,
    title: row.title,
    description: row.description,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completionCount,
  }
}

async function requireProperty(client: PrismaClient, propertyId: string): Promise<{ id: string; name: string }> {
  const property = await client.property.findUnique({
    where: { id: propertyId },
    select: { id: true, name: true },
  })
  if (!property) throw new NotFoundError('Property not found.')
  return property
}

/** Completion counts let the admin see that deleting a task is non-destructive. */
async function completionCounts(
  client: PrismaClient,
  itemIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (itemIds.length === 0) return counts
  const rows = await client.managerChecklistCompletion.groupBy({
    by: ['itemId'],
    where: { itemId: { in: itemIds } },
    _count: { _all: true },
  })
  for (const row of rows) {
    counts.set(row.itemId, row._count._all)
  }
  return counts
}

/**
 * Items for one home, ordered exactly as managers receive them. `includeDeleted`
 * adds soft-deleted rows so the admin can still see (and understand) what
 * happened; managers never receive them.
 */
export async function listAdminChecklistItems(
  client: PrismaClient,
  propertyId: string,
  includeDeleted = true
): Promise<AdminChecklistItemDto[]> {
  await requireProperty(client, propertyId)
  const rows = await client.managerChecklistItem.findMany({
    where: { propertyId, ...(includeDeleted ? {} : { deletedAt: null }) },
    orderBy: itemOrderBy,
  })
  const counts = await completionCounts(
    client,
    rows.map((row) => row.id)
  )
  return rows.map((row) => serialize(row as RawItem, counts.get(row.id) ?? 0))
}

export async function createAdminChecklistItem(
  client: PrismaClient,
  propertyId: string,
  input: ChecklistItemInput
): Promise<AdminChecklistItemDto> {
  await requireProperty(client, propertyId)

  const count = await client.managerChecklistItem.count({
    where: { propertyId, deletedAt: null },
  })
  if (count >= MAX_CHECKLIST_ITEMS) {
    throw new BadRequestError(
      `A checklist can hold ${MAX_CHECKLIST_ITEMS} tasks or fewer. Delete a task first.`
    )
  }

  // Append to the end of the existing order.
  const last = await client.managerChecklistItem.findFirst({
    where: { propertyId, deletedAt: null },
    orderBy: [{ sortOrder: 'desc' }, { createdAt: 'desc' }],
    select: { sortOrder: true },
  })

  const row = await client.managerChecklistItem.create({
    data: {
      propertyId,
      title: input.title,
      description: input.description,
      isActive: input.isActive,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  })
  return serialize(row as RawItem, 0)
}

export async function updateAdminChecklistItem(
  client: PrismaClient,
  propertyId: string,
  itemId: string,
  input: ChecklistItemUpdate
): Promise<AdminChecklistItemDto> {
  await requireProperty(client, propertyId)
  const existing = await client.managerChecklistItem.findFirst({
    where: { id: itemId, propertyId, deletedAt: null },
    select: { id: true },
  })
  if (!existing) throw new NotFoundError('Checklist task not found for this property.')

  const row = await client.managerChecklistItem.update({ where: { id: itemId }, data: input })
  const counts = await completionCounts(client, [itemId])
  return serialize(row as RawItem, counts.get(itemId) ?? 0)
}

/**
 * Soft delete. The row is retained (and excluded from every manager query) so
 * the completion records that reference it — and therefore the historical
 * picture of what was ticked on which day — stay intact.
 */
export async function deleteAdminChecklistItem(
  client: PrismaClient,
  propertyId: string,
  itemId: string
): Promise<{ deleted: true; retainedCompletionRecords: number }> {
  await requireProperty(client, propertyId)
  const existing = await client.managerChecklistItem.findFirst({
    where: { id: itemId, propertyId, deletedAt: null },
    select: { id: true },
  })
  if (!existing) throw new NotFoundError('Checklist task not found for this property.')

  const counts = await completionCounts(client, [itemId])
  await client.managerChecklistItem.update({
    where: { id: itemId },
    data: { deletedAt: new Date(), isActive: false },
  })
  return { deleted: true, retainedCompletionRecords: counts.get(itemId) ?? 0 }
}

/**
 * Persist a new display order. The submitted list must contain every
 * non-deleted item of the property exactly once, so a stale client can never
 * silently drop a task from the manager's checklist.
 */
export async function reorderAdminChecklistItems(
  client: PrismaClient,
  propertyId: string,
  ids: string[]
): Promise<AdminChecklistItemDto[]> {
  await requireProperty(client, propertyId)
  const current = await client.managerChecklistItem.findMany({
    where: { propertyId, deletedAt: null },
    select: { id: true },
  })
  const currentIds = new Set(current.map((row) => row.id))
  const submittedIds = new Set(ids)

  if (
    current.length !== ids.length ||
    currentIds.size !== submittedIds.size ||
    [...submittedIds].some((id) => !currentIds.has(id))
  ) {
    throw new ConflictError(
      'The new order must include every active checklist task exactly once. Reload and try again.'
    )
  }

  await client.$transaction(async (tx) => {
    for (const [sortOrder, id] of ids.entries()) {
      await tx.managerChecklistItem.update({ where: { id }, data: { sortOrder } })
    }
  })

  return listAdminChecklistItems(client, propertyId, false)
}
