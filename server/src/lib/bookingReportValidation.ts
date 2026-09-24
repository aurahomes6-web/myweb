import { isDateString, toUtcDate } from './dateUtils.js'

/**
 * Validation for the admin booking-report date range.
 *
 * The report is filtered on `booking.createdAt`, so the range is expressed as
 * an inclusive pair of YYYY-MM-DD keys and bounded so a request can never
 * generate an unbounded spreadsheet.
 */

const MS_PER_DAY = 86_400_000

/** Longest acceptable period, inclusive of both days (This Year = 366 fits). */
export const MAX_REPORT_RANGE_DAYS = 366

export interface BookingReportRange {
  from: string
  to: string
}

export type ParseReportRangeResult =
  | { ok: true; value: BookingReportRange }
  | { ok: false; issues: Array<{ field: string; message: string }> }

export function parseReportRange(fromRaw: unknown, toRaw: unknown): ParseReportRangeResult {
  const from = typeof fromRaw === 'string' ? fromRaw.trim() : ''
  const to = typeof toRaw === 'string' ? toRaw.trim() : ''
  const issues: Array<{ field: string; message: string }> = []

  if (!isDateString(from)) {
    issues.push({ field: 'from', message: 'Provide a valid start date (YYYY-MM-DD).' })
  }
  if (!isDateString(to)) {
    issues.push({ field: 'to', message: 'Provide a valid end date (YYYY-MM-DD).' })
  }
  if (issues.length > 0) return { ok: false, issues }

  if (from > to) {
    issues.push({ field: 'to', message: 'The start date must be on or before the end date.' })
    return { ok: false, issues }
  }

  const days = Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / MS_PER_DAY) + 1
  if (days > MAX_REPORT_RANGE_DAYS) {
    issues.push({
      field: 'to',
      message: `The selected period is too large. Choose ${MAX_REPORT_RANGE_DAYS} days or fewer.`,
    })
    return { ok: false, issues }
  }

  return { ok: true, value: { from, to } }
}