import type { NextFunction, Request, Response } from 'express'
import type { PrismaClient } from '../generated/prisma/client.js'
import { prisma } from '../lib/db.js'
import { parsePaymentSettingsUpdate } from '../lib/paymentSettingsValidation.js'
import { isBrowserLoadableUrl, getObjectStorage, type ObjectStorage } from '../storage/storage.js'
import { BadRequestError } from '../services/adminService.js'
import {
  getAdminPaymentSettings,
  getPublicPaymentSettings,
  setPaymentSettingsQr,
  updatePaymentSettingsDetails,
} from '../services/paymentSettingsService.js'

/**
 * Payment-settings endpoints.
 *
 * The public handler serializes exactly four fields (upiName, upiId, upiPhone,
 * qrCodeUrl) and nothing else. The admin handlers sit behind the existing admin
 * session + CSRF middleware — this controller never introduces a second
 * authentication system.
 *
 * Every handler is exposed as a factory so unit tests can inject a fake Prisma
 * client (and, for the QR upload, a fake object store); the production routes
 * use the shared singleton and the real Vercel Blob storage.
 */

function apiError(code: string, message: string) {
  return { error: code, message }
}

function wrap(
  handler: (req: Request, res: Response) => Promise<Response | void>
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res)
    } catch (err) {
      if (err instanceof BadRequestError) {
        return res.status(400).json(apiError('VALIDATION_ERROR', err.message))
      }
      return next(err)
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

// ── public ────────────────────────────────────────────────────────────────

export function makePublicPaymentSettingsHandler(client?: PrismaClient) {
  return wrap(async (_req: Request, res: Response) => {
    const db = client ?? prisma
    res.json(await getPublicPaymentSettings(db))
  })
}

export const publicPaymentSettingsHandler = makePublicPaymentSettingsHandler()

// ── admin ─────────────────────────────────────────────────────────────────

export function makeAdminGetPaymentSettingsHandler(client?: PrismaClient) {
  return wrap(async (_req: Request, res: Response) => {
    const db = client ?? prisma
    res.json({ settings: await getAdminPaymentSettings(db) })
  })
}

export const adminGetPaymentSettingsHandler = makeAdminGetPaymentSettingsHandler()

export function makeAdminUpdatePaymentSettingsHandler(client?: PrismaClient) {
  return wrap(async (req: Request, res: Response) => {
    const parsed = parsePaymentSettingsUpdate(req.body)
    if (!parsed.ok) return void validationError(res, parsed.issues)
    const db = client ?? prisma
    res.json({ settings: await updatePaymentSettingsDetails(db, parsed.value) })
  })
}

export const adminUpdatePaymentSettingsHandler = makeAdminUpdatePaymentSettingsHandler()

/**
 * Replace the active QR with an uploaded image (multipart `image` field).
 *
 * The image is validated and held in memory by `uploadImageMiddleware`, stored
 * in the existing Vercel Blob store, and ONLY then is the resulting public URL
 * persisted as `qrCodeUrl`. If any step fails the previously working QR stays
 * active — the settings row is never half-updated.
 */
export function makeAdminUploadPaymentQrHandler(
  client?: PrismaClient,
  storage?: ObjectStorage
) {
  return wrap(async (req: Request, res: Response) => {
    if (!req.file) {
      return void validationError(res, [{ field: 'image', message: 'Choose a QR image to upload.' }])
    }

    const extension = QR_MIME_EXTENSION[req.file.mimetype] ?? 'png'
    const store = storage ?? getObjectStorage()
    const key = `payment/qr-${Date.now()}.${extension}`

    let stored: { url: string; key: string }
    try {
      stored = await store.put(key, req.file.buffer, req.file.mimetype)
    } catch {
      throw new BadRequestError('The QR image could not be uploaded. Please try again.')
    }

    if (!isBrowserLoadableUrl(stored.url)) {
      throw new BadRequestError(
        'QR upload storage is not configured for this environment — the previous QR stays active.'
      )
    }

    const db = client ?? prisma
    const settings = await setPaymentSettingsQr(db, stored.url)
    res.json({ settings })
  })
}

export const adminUploadPaymentQrHandler = makeAdminUploadPaymentQrHandler()

const QR_MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}