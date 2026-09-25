import type { NextFunction, Request, Response } from 'express'
import type { PrismaClient } from '../generated/prisma/client.js'
import { prisma } from '../lib/db.js'
import { parseDetailsQuery, type DetailsQuery } from '../lib/detailsQueryValidation.js'
import { BadRequestError, ConflictError, NotFoundError } from '../services/adminService.js'
import {
  DetailsTooLargeError,
  listDetailsProperties,
  queryDetails,
} from '../services/detailsService.js'
import {
  buildDetailsPdf,
  buildDetailsWorkbook,
  detailsExportFileName,
} from '../services/detailsExportService.js'

/**
 * Admin → Details reporting endpoints.
 *
 * READ-ONLY reporting over data that already exists: NORMAL bookings and AIRBNB
 * reservations are queried independently and presented as one table. This
 * controller never writes, and never changes how either booking system behaves.
 *
 * All three routes sit behind `requireAdmin` (see routes/admin.ts), which is
 * what makes returning the FULL Aadhaar number safe here. Nothing is logged.
 */

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const PDF_CONTENT_TYPE = 'application/pdf'

function validationError(res: Response, issues: Array<{ field: string; message: string }>) {
  res.status(400).json({
    error: 'VALIDATION_ERROR',
    message: 'Please review the highlighted filters.',
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
      if (err instanceof BadRequestError || err instanceof DetailsTooLargeError) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: err.message })
      }
      return next(err)
    }
  }
}

function parseQuery(req: Request, res: Response): DetailsQuery | null {
  const parsed = parseDetailsQuery(req.query as Record<string, unknown>)
  if (!parsed.ok) {
    validationError(res, parsed.issues)
    return null
  }
  return parsed.value
}

/**
 * GET /api/admin/details — one page of the merged, filtered, sorted table.
 *
 * The optional `client` argument lets tests inject a fake Prisma client; the
 * production route uses the shared singleton.
 */
export function makeListDetailsHandler(client?: PrismaClient) {
  return wrap(async (req: Request, res: Response) => {
    const query = parseQuery(req, res)
    if (query === null) return

    const db = client ?? prisma
    const [{ records, total, summary }, properties] = await Promise.all([
      queryDetails(db, query),
      listDetailsProperties(db),
    ])

    const pageCount = Math.max(Math.ceil(total / query.pageSize), 1)
    const start = (query.page - 1) * query.pageSize
    const safePage = Math.min(query.page, pageCount)

    res.json({
      // Out-of-range pages return an empty slice rather than an error so deep
      // links and stale filter state never break the page.
      records: records.slice(start, start + query.pageSize),
      total,
      page: safePage,
      pageSize: query.pageSize,
      pageCount,
      summary,
      properties,
      appliedQuery: {
        source: query.source,
        propertyId: query.propertyId,
        status: query.status,
        paymentStatus: query.paymentStatus,
        search: query.search,
        dateBasis: query.dateBasis,
        preset: query.preset,
        range: query.range,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      },
    })
  })
}

export const listDetailsHandler = makeListDetailsHandler()

/**
 * GET /api/admin/details/export/excel — a real .xlsx of the filtered rows.
 */
export function makeExportDetailsExcelHandler(client?: PrismaClient) {
  return wrap(async (req: Request, res: Response) => {
    const query = parseQuery(req, res)
    if (query === null) return

    const db = client ?? prisma
    const { records, summary } = await queryDetails(db, query)
    const properties = await listDetailsProperties(db)
    const propertyName =
      properties.find((property) => property.id === query.propertyId)?.name ?? 'All properties'

    const buffer = await buildDetailsWorkbook(records, summary, exportMeta(query, propertyName), query)
    res.setHeader('Content-Type', XLSX_CONTENT_TYPE)
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${detailsExportFileName('xlsx', query.range.from, query.range.to)}"`
    )
    res.setHeader('Content-Length', String(buffer.length))
    res.end(buffer)
  })
}

export const exportDetailsExcelHandler = makeExportDetailsExcelHandler()

/** GET /api/admin/details/export/pdf — landscape PDF with repeated headers. */
export function makeExportDetailsPdfHandler(client?: PrismaClient) {
  return wrap(async (req: Request, res: Response) => {
    const query = parseQuery(req, res)
    if (query === null) return

    const db = client ?? prisma
    const { records, summary } = await queryDetails(db, query)
    const properties = await listDetailsProperties(db)
    const propertyName =
      properties.find((property) => property.id === query.propertyId)?.name ?? 'All properties'

    const buffer = buildDetailsPdf(records, summary, exportMeta(query, propertyName), query)
    res.setHeader('Content-Type', PDF_CONTENT_TYPE)
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${detailsExportFileName('pdf', query.range.from, query.range.to)}"`
    )
    res.setHeader('Content-Length', String(buffer.length))
    res.end(buffer)
  })
}

export const exportDetailsPdfHandler = makeExportDetailsPdfHandler()

const SORT_LABELS: Record<DetailsQuery['sortBy'], string> = {
  checkIn: 'Check-in date',
  checkOut: 'Check-out date',
  bookingDate: 'Booking date',
  guestName: 'Guest name',
  property: 'Property',
  source: 'Source',
  status: 'Status',
  amount: 'Amount',
}

function exportMeta(query: DetailsQuery, propertyName: string) {
  return {
    generatedAt: new Date(),
    source: query.source === 'ALL' ? 'All (Normal + Airbnb)' : query.source,
    propertyName,
    status: query.status ?? 'All',
    paymentStatus: query.paymentStatus ?? 'All',
    search: query.search ?? '—',
    dateBasis: query.dateBasis,
    datePreset: query.preset,
    rangeFrom: query.range.from,
    rangeTo: query.range.to,
    sortLabel: `${SORT_LABELS[query.sortBy]} (${query.sortOrder === 'asc' ? 'ascending' : 'descending'})`,
  }
}
