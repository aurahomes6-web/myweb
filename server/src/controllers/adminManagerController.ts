import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../lib/db.js'
import {
  parseChecklistItemCreate,
  parseChecklistItemUpdate,
  parseChecklistReorder,
} from '../lib/managerChecklistValidation.js'
import { BadRequestError, ConflictError, NotFoundError } from '../services/adminService.js'
import {
  createAdminChecklistItem,
  deleteAdminChecklistItem,
  listAdminChecklistItems,
  reorderAdminChecklistItems,
  updateAdminChecklistItem,
} from '../services/adminManagerService.js'

/**
 * ADMIN → Manager configuration endpoints.
 *
 * These routes are mounted behind `requireAdmin` (+ CSRF header on mutations), so
 * only an authenticated admin can shape the manager checklist. Managers have no
 * access to them. This configuration page is deliberately NOT linked to the
 * manager panel: the manager reaches /manager by typing it directly.
 */

function validationError(res: Response, issues: Array<{ field: string; message: string }>) {
  res.status(400).json({
    error: 'VALIDATION_ERROR',
    message: 'Please review the highlighted fields.',
    details: issues,
  })
}

function wrap(handler: (req: Request, res: Response) => Promise<Response | void>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res)
    } catch (err) {
      if (err instanceof NotFoundError) {
        return res.status(404).json({ error: 'NOT_FOUND', message: err.message })
      }
      if (err instanceof ConflictError) {
        return res.status(409).json({ error: 'CONFLICT', message: err.message })
      }
      if (err instanceof BadRequestError) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: err.message })
      }
      return next(err)
    }
  }
}

function propertyIdOf(req: Request): string {
  return typeof req.params.propertyId === 'string' ? req.params.propertyId : ''
}

/** GET /api/admin/manager/checklist/:propertyId — items incl. disabled/deleted. */
export const listManagerChecklistHandler = wrap(async (req: Request, res: Response) => {
  const items = await listAdminChecklistItems(prisma, propertyIdOf(req))
  res.json({ items })
})

/** POST /api/admin/manager/checklist/:propertyId — add a task. */
export const createManagerChecklistItemHandler = wrap(async (req: Request, res: Response) => {
  const parsed = parseChecklistItemCreate(req.body)
  if (!parsed.ok) return void validationError(res, parsed.issues)
  const item = await createAdminChecklistItem(prisma, propertyIdOf(req), parsed.value)
  res.status(201).json({ item })
})

/** PATCH /api/admin/manager/checklist/:propertyId/:itemId — edit / enable / disable. */
export const updateManagerChecklistItemHandler = wrap(async (req: Request, res: Response) => {
  const parsed = parseChecklistItemUpdate(req.body)
  if (!parsed.ok) return void validationError(res, parsed.issues)
  const item = await updateAdminChecklistItem(
    prisma,
    propertyIdOf(req),
    typeof req.params.itemId === 'string' ? req.params.itemId : '',
    parsed.value
  )
  res.json({ item })
})

/**
 * DELETE /api/admin/manager/checklist/:propertyId/:itemId — soft delete.
 * Historical completion records are retained; the response reports how many.
 */
export const deleteManagerChecklistItemHandler = wrap(async (req: Request, res: Response) => {
  const result = await deleteAdminChecklistItem(
    prisma,
    propertyIdOf(req),
    typeof req.params.itemId === 'string' ? req.params.itemId : ''
  )
  res.json(result)
})

/** PUT /api/admin/manager/checklist/:propertyId/reorder — persist the new order. */
export const reorderManagerChecklistHandler = wrap(async (req: Request, res: Response) => {
  const parsed = parseChecklistReorder(req.body)
  if (!parsed.ok) return void validationError(res, parsed.issues)
  const items = await reorderAdminChecklistItems(prisma, propertyIdOf(req), parsed.value.ids)
  res.json({ items })
})
