import type { PrismaClient } from '../generated/prisma/client.js'
import type {
  CreateMarqueeNotificationInput,
  ReorderMarqueeNotificationsInput,
  UpdateMarqueeNotificationInput,
} from '../lib/marqueeNotificationValidation.js'

interface MarqueeNotificationRow {
  id: string
  message: string
  isActive: boolean
  sort: number
  createdAt: Date
  updatedAt: Date
}

export interface PublicMarqueeNotification {
  id: string
  message: string
}

export interface AdminMarqueeNotification extends PublicMarqueeNotification {
  isActive: boolean
  sort: number
  createdAt: string
  updatedAt: string
}

export class MarqueeNotificationNotFoundError extends Error {
  override readonly name = 'MarqueeNotificationNotFoundError' as const
}

export class MarqueeNotificationOrderError extends Error {
  override readonly name = 'MarqueeNotificationOrderError' as const
}

const notificationOrderBy = [
  { sort: 'asc' as const },
  { createdAt: 'asc' as const },
  { id: 'asc' as const },
]

function serialize(row: MarqueeNotificationRow): AdminMarqueeNotification {
  return {
    id: row.id,
    message: row.message,
    isActive: row.isActive,
    sort: row.sort,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listPublicMarqueeNotifications(
  client: PrismaClient
): Promise<PublicMarqueeNotification[]> {
  const rows = await client.marqueeNotification.findMany({
    where: { isActive: true },
    orderBy: notificationOrderBy,
    select: { id: true, message: true },
  })
  return rows.map((row) => ({ id: row.id, message: row.message }))
}

export async function listMarqueeNotifications(
  client: PrismaClient
): Promise<AdminMarqueeNotification[]> {
  const rows = await client.marqueeNotification.findMany({ orderBy: notificationOrderBy })
  return rows.map(serialize)
}

export async function createMarqueeNotification(
  client: PrismaClient,
  input: CreateMarqueeNotificationInput
): Promise<AdminMarqueeNotification> {
  const last = await client.marqueeNotification.findFirst({
    orderBy: [{ sort: 'desc' }, { createdAt: 'desc' }],
    select: { sort: true },
  })
  const row = await client.marqueeNotification.create({
    data: {
      message: input.message,
      isActive: input.isActive,
      sort: (last?.sort ?? -1) + 1,
    },
  })
  return serialize(row)
}

export async function updateMarqueeNotification(
  client: PrismaClient,
  id: string,
  input: UpdateMarqueeNotificationInput
): Promise<AdminMarqueeNotification> {
  const existing = await client.marqueeNotification.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw new MarqueeNotificationNotFoundError('Notification not found.')
  const row = await client.marqueeNotification.update({ where: { id }, data: input })
  return serialize(row)
}

export async function reorderMarqueeNotifications(
  client: PrismaClient,
  input: ReorderMarqueeNotificationsInput
): Promise<AdminMarqueeNotification[]> {
  const current = await client.marqueeNotification.findMany({ select: { id: true } })
  const currentIds = new Set(current.map((row) => row.id))
  const submittedIds = new Set(input.ids)
  if (
    current.length !== input.ids.length ||
    currentIds.size !== submittedIds.size ||
    [...submittedIds].some((id) => !currentIds.has(id))
  ) {
    throw new MarqueeNotificationOrderError(
      'Notification order must include every current notification exactly once.'
    )
  }

  if (input.ids.length > 0) {
    await client.$transaction(async (tx) => {
      for (const [sort, id] of input.ids.entries()) {
        await tx.marqueeNotification.update({ where: { id }, data: { sort } })
      }
    })
  }

  return listMarqueeNotifications(client)
}

export async function deleteMarqueeNotification(
  client: PrismaClient,
  id: string
): Promise<{ deleted: true }> {
  const existing = await client.marqueeNotification.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw new MarqueeNotificationNotFoundError('Notification not found.')
  await client.marqueeNotification.delete({ where: { id } })
  return { deleted: true }
}
