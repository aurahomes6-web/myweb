import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../lib/db.js'
import {
  clearManagerSessionCookie,
  currentManager,
  issueManagerSession,
  managerSessionConfig,
  managerSessionCookie,
  verifyManagerPassword,
  type ManagerSessionConfig,
} from '../lib/managerAuth.js'
import {
  parseChecklistDate,
  parseCompletionToggle,
  parseManagerReport,
} from '../lib/managerChecklistValidation.js'
import { BadRequestError, ConflictError, NotFoundError } from '../services/adminService.js'
import {
  getManagerChecklist,
  getManagerReportRecipient,
  listManagerProperties,
  prepareManagerReport,
  setManagerChecklistCompletion,
} from '../services/managerService.js'

/**
 * Manager-only API.
 *
 * Every route except `POST /login` and `GET /config` is mounted behind
 * `requireManager`, which verifies the `aura_manager_session` cookie AND
 * re-reads an active `ManagerUser` row. A manager session can therefore never
 * satisfy the admin guard (different cookie, different secret, different
 * `sub`), so `/admin` and every `/api/admin/*` route stay closed to managers —
 * hiding links is never the mechanism, the backend is.
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

function requirePrincipal(res: Response): { id: string; username: string } {
  const manager = currentManager(res)
  if (!manager) {
    throw new BadRequestError('Manager session missing.')
  }
  return manager
}

export function managerLogin(config: ManagerSessionConfig | null) {
  return async (req: Request, res: Response) => {
    if (!config) {
      return res
        .status(503)
        .json({ error: 'MANAGER_NOT_CONFIGURED', message: 'Manager authentication is not configured.' })
    }

    const body = (req.body ?? {}) as Record<string, unknown>
    const username = typeof body.username === 'string' ? body.username.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (username.length === 0 || password.length === 0) {
      return res
        .status(401)
        .json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' })
    }

    const account = await prisma.managerUser.findFirst({
      where: { username, isActive: true },
      select: { id: true, username: true, displayName: true, passwordHash: true },
    })

    // Always run a verification so a missing account and a wrong password take
    // a comparable amount of time.
    const hash = account?.passwordHash ?? 'scrypt$16384$8$1$00$00'
    const valid = verifyManagerPassword(password, hash) && account !== null

    if (!valid || !account) {
      return res
        .status(401)
        .json({ error: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' })
    }

    const token = issueManagerSession(config, account.username)
    res.setHeader('Set-Cookie', managerSessionCookie(token, config))
    res.json({
      ok: true,
      manager: {
        username: account.username,
        displayName: account.displayName,
      },
    })
  }
}

export function managerLogout(config: ManagerSessionConfig | null) {
  return async (_req: Request, res: Response) => {
    if (config) res.setHeader('Set-Cookie', clearManagerSessionCookie(config))
    return res.json({ ok: true })
  }
}

export const managerMe = wrap(async (_req: Request, res: Response) => {
  const manager = requirePrincipal(res)
  res.json({
    ok: true,
    authenticated: true,
    manager: { username: manager.username, displayName: null },
  })
})

/** GET /api/manager/properties — canonical Penthouse 1 → 2 → 3 order. */
export const managerPropertiesHandler = wrap(async (_req: Request, res: Response) => {
  const properties = await listManagerProperties(prisma)
  res.json({ properties })
})

/** GET /api/manager/checklist/:propertyId — the active checklist for a day. */
export const managerChecklistHandler = wrap(async (req: Request, res: Response) => {
  const manager = requirePrincipal(res)
  const propertyId = typeof req.params.propertyId === 'string' ? req.params.propertyId : ''
  const parsedDate = parseChecklistDate(req.query.date)
  if (!parsedDate.ok) return void validationError(res, parsedDate.issues)

  const checklist = await getManagerChecklist(
    prisma,
    manager.id,
    propertyId,
    parsedDate.value.dateKey
  )
  res.json({ checklist })
})

/** POST /api/manager/checklist/:propertyId/:itemId — tick / untick one task. */
export const managerCompletionHandler = wrap(async (req: Request, res: Response) => {
  const manager = requirePrincipal(res)
  const propertyId = typeof req.params.propertyId === 'string' ? req.params.propertyId : ''
  const itemId = typeof req.params.itemId === 'string' ? req.params.itemId : ''

  const parsedToggle = parseCompletionToggle(req.body)
  if (!parsedToggle.ok) return void validationError(res, parsedToggle.issues)
  const parsedDate = parseChecklistDate(
    typeof (req.body ?? {}).date === 'string' ? (req.body as Record<string, unknown>).date : ''
  )
  if (!parsedDate.ok) return void validationError(res, parsedDate.issues)

  const completion = await setManagerChecklistCompletion(
    prisma,
    manager.id,
    propertyId,
    itemId,
    parsedDate.value.dateKey,
    parsedToggle.value.completed
  )
  res.json({ completion })
})

/**
 * GET /api/manager/config — whether the AURA HOMES WhatsApp number is
 * configured. The NUMBER itself is never sent to the client: the report link is
 * composed server-side so nothing is hardcoded in the frontend.
 */
export const managerConfigHandler = wrap(async (_req: Request, res: Response) => {
  res.json({ whatsappConfigured: getManagerReportRecipient() !== null })
})

/**
 * POST /api/manager/report — compose the WhatsApp click-to-chat link for the
 * report. This only OPENS the conversation with a pre-filled message; the
 * manager still presses send, and nothing here claims delivery.
 */
export const managerReportHandler = wrap(async (req: Request, res: Response) => {
  const manager = requirePrincipal(res)
  const body = (req.body ?? {}) as Record<string, unknown>
  const propertyId = typeof body.propertyId === 'string' ? body.propertyId : ''
  const parsedReport = parseManagerReport(body)
  if (!parsedReport.ok) return void validationError(res, parsedReport.issues)
  if (propertyId === '') {
    return void validationError(res, [{ field: 'propertyId', message: 'Choose a property first.' }])
  }
  // The report is filed under the day the manager is looking at, so a night-shift
  // report at 00:15 about "today" still carries today's date.
  const parsedDate = parseChecklistDate(typeof body.date === 'string' ? body.date : '')
  if (!parsedDate.ok) return void validationError(res, parsedDate.issues)

  const prepared = await prepareManagerReport(prisma, {
    propertyId,
    managerUsername: manager.username,
    report: parsedReport.value.message,
    dateKey: parsedDate.value.dateKey,
  })
  res.json({ prepared })
})

export { managerSessionConfig }
