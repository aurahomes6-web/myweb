import { isDateString, toUtcDate } from './dateUtils.js'

export interface BookingDateBlockInput {
  startDate: string
  endDate: string
}

export interface BookingDateBlockValidationIssue {
  field: string
  message: string
}

export type BookingDateBlockValidationResult =
  | { ok: true; value: BookingDateBlockInput }
  | { ok: false; issues: BookingDateBlockValidationIssue[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseBookingDateBlock(body: unknown): BookingDateBlockValidationResult {
  if (!isRecord(body)) {
    return { ok: false, issues: [{ field: 'body', message: 'A JSON request body is required.' }] }
  }
  const startDate = body.startDate
  const endDate = body.endDate
  if (!isDateString(startDate)) {
    return { ok: false, issues: [{ field: 'startDate', message: 'startDate must be a valid YYYY-MM-DD date.' }] }
  }
  if (!isDateString(endDate)) {
    return { ok: false, issues: [{ field: 'endDate', message: 'endDate must be a valid YYYY-MM-DD date.' }] }
  }
  if (startDate > endDate) {
    return { ok: false, issues: [{ field: 'endDate', message: 'endDate must be on or after startDate.' }] }
  }
  return { ok: true, value: { startDate, endDate } }
}

export function bookingDateBlockDates(input: BookingDateBlockInput): { startDate: Date; endDate: Date } {
  return { startDate: toUtcDate(input.startDate), endDate: toUtcDate(input.endDate) }
}
