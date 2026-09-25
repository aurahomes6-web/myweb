import type { NextFunction, Request, Response } from 'express'
import type { PrismaClient } from '../generated/prisma/client.js'
import { parseHomepageSettingsUpdate } from '../lib/homepageSettingsValidation.js'
import { prisma } from '../lib/db.js'
import { getObjectStorage, type ObjectStorage } from '../storage/storage.js'
import { BadRequestError } from '../services/adminService.js'
import {
  getAdminHomepageSettings,
  getHomepageSettings,
  HomepageStorageError,
  resetHomepageVisual,
  updateHomepageSettings,
  uploadHomepageVisual,
} from '../services/homepageSettingsService.js'

function wrap(handler: (req: Request, res: Response) => Promise<Response | void>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res)
    } catch (error) {
      if (error instanceof BadRequestError) {
        res.status(400).json({ error: 'VALIDATION_ERROR', message: error.message })
        return
      }
      if (error instanceof HomepageStorageError) {
        res.status(503).json({ error: 'STORAGE_UNAVAILABLE', message: error.message })
        return
      }
      next(error)
    }
  }
}

function validationError(
  res: Response,
  issues: Array<{ field: string; message: string }>
) {
  res.status(400).json({
    error: 'VALIDATION_ERROR',
    message: 'Please review the highlighted fields.',
    details: issues,
  })
}

export function makePublicHomepageSettingsHandler(client?: PrismaClient) {
  return wrap(async (_req: Request, res: Response) => {
    const db = client ?? prisma
    res.json(await getHomepageSettings(db))
  })
}

export const publicHomepageSettingsHandler = makePublicHomepageSettingsHandler()

export function makeAdminGetHomepageSettingsHandler(client?: PrismaClient) {
  return wrap(async (_req: Request, res: Response) => {
    const db = client ?? prisma
    res.json({ settings: await getAdminHomepageSettings(db) })
  })
}

export const adminGetHomepageSettingsHandler = makeAdminGetHomepageSettingsHandler()

export function makeAdminUpdateHomepageSettingsHandler(client?: PrismaClient) {
  return wrap(async (req: Request, res: Response) => {
    const parsed = parseHomepageSettingsUpdate(req.body)
    if (!parsed.ok) return void validationError(res, parsed.issues)
    const db = client ?? prisma
    res.json({ settings: await updateHomepageSettings(db, parsed.value) })
  })
}

export const adminUpdateHomepageSettingsHandler = makeAdminUpdateHomepageSettingsHandler()

export function makeAdminUploadHomepageVisualHandler(
  client?: PrismaClient,
  storage?: ObjectStorage
) {
  return wrap(async (req: Request, res: Response) => {
    if (!req.file) {
      return void validationError(res, [
        { field: 'image', message: 'Choose a homepage visual image to upload.' },
      ])
    }
    const db = client ?? prisma
    const store = storage ?? getObjectStorage()
    const settings = await uploadHomepageVisual(
      db,
      store,
      req.file.buffer,
      req.file.mimetype
    )
    res.json({ settings })
  })
}

export const adminUploadHomepageVisualHandler = makeAdminUploadHomepageVisualHandler()

export function makeAdminDeleteHomepageVisualHandler(
  client?: PrismaClient,
  storage?: ObjectStorage
) {
  return wrap(async (_req: Request, res: Response) => {
    const db = client ?? prisma
    const store = storage ?? getObjectStorage()
    res.json({ settings: await resetHomepageVisual(db, store) })
  })
}

export const adminDeleteHomepageVisualHandler = makeAdminDeleteHomepageVisualHandler()
