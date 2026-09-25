import type { NextFunction, Request, Response } from 'express'
import type { PrismaClient } from '../generated/prisma/client.js'
import { prisma } from '../lib/db.js'
import {
  parseCreateMarqueeNotification,
  parseReorderMarqueeNotifications,
  parseUpdateMarqueeNotification,
  type MarqueeNotificationIssue,
} from '../lib/marqueeNotificationValidation.js'
import {
  createMarqueeNotification,
  deleteMarqueeNotification,
  listMarqueeNotifications,
  listPublicMarqueeNotifications,
  MarqueeNotificationNotFoundError,
  MarqueeNotificationOrderError,
  reorderMarqueeNotifications,
  updateMarqueeNotification,
} from '../services/marqueeNotificationService.js'

function wrap(handler: (req: Request, res: Response) => Promise<Response | void>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res)
    } catch (error) {
      if (error instanceof MarqueeNotificationNotFoundError) {
        res.status(404).json({ error: 'NOT_FOUND', message: error.message })
        return
      }
      if (error instanceof MarqueeNotificationOrderError) {
        validationError(res, [{ field: 'ids', message: error.message }])
        return
      }
      next(error)
    }
  }
}

function validationError(res: Response, issues: MarqueeNotificationIssue[]) {
  res.status(400).json({
    error: 'VALIDATION_ERROR',
    message: 'Please review the highlighted fields.',
    details: issues,
  })
}

export function makePublicMarqueeNotificationsHandler(client?: PrismaClient) {
  return wrap(async (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json({ notifications: await listPublicMarqueeNotifications(client ?? prisma) })
  })
}

export const publicMarqueeNotificationsHandler = makePublicMarqueeNotificationsHandler()

export function makeAdminListMarqueeNotificationsHandler(client?: PrismaClient) {
  return wrap(async (_req: Request, res: Response) => {
    res.json({ notifications: await listMarqueeNotifications(client ?? prisma) })
  })
}

export const adminListMarqueeNotificationsHandler = makeAdminListMarqueeNotificationsHandler()

export function makeAdminCreateMarqueeNotificationHandler(client?: PrismaClient) {
  return wrap(async (req: Request, res: Response) => {
    const parsed = parseCreateMarqueeNotification(req.body)
    if (!parsed.ok) return void validationError(res, parsed.issues)
    const notification = await createMarqueeNotification(client ?? prisma, parsed.value)
    res.status(201).json({ notification })
  })
}

export const adminCreateMarqueeNotificationHandler = makeAdminCreateMarqueeNotificationHandler()

export function makeAdminUpdateMarqueeNotificationHandler(client?: PrismaClient) {
  return wrap(async (req: Request, res: Response) => {
    const parsed = parseUpdateMarqueeNotification(req.body)
    if (!parsed.ok) return void validationError(res, parsed.issues)
    const id = typeof req.params.id === 'string' ? req.params.id : ''
    const notification = await updateMarqueeNotification(client ?? prisma, id, parsed.value)
    res.json({ notification })
  })
}

export const adminUpdateMarqueeNotificationHandler = makeAdminUpdateMarqueeNotificationHandler()

export function makeAdminReorderMarqueeNotificationsHandler(client?: PrismaClient) {
  return wrap(async (req: Request, res: Response) => {
    const parsed = parseReorderMarqueeNotifications(req.body)
    if (!parsed.ok) return void validationError(res, parsed.issues)
    const notifications = await reorderMarqueeNotifications(client ?? prisma, parsed.value)
    res.json({ notifications })
  })
}

export const adminReorderMarqueeNotificationsHandler =
  makeAdminReorderMarqueeNotificationsHandler()

export function makeAdminDeleteMarqueeNotificationHandler(client?: PrismaClient) {
  return wrap(async (req: Request, res: Response) => {
    const id = typeof req.params.id === 'string' ? req.params.id : ''
    res.json(await deleteMarqueeNotification(client ?? prisma, id))
  })
}

export const adminDeleteMarqueeNotificationHandler = makeAdminDeleteMarqueeNotificationHandler()
