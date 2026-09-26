const DAY_MS = 86_400_000

/** Local wall-clock ISO date (YYYY-MM-DD) — never UTC, to avoid day-shift bugs. */
export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

export function today(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

/** 0 = Sunday … 6 = Saturday for the day-name header of the month grid. */
export function firstWeekday(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), 1).getDay()
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export function nightsBetween(checkIn: string, checkOut: string): number {
  const from = fromISODate(checkIn)
  const to = fromISODate(checkOut)
  return Math.round((to.getTime() - from.getTime()) / DAY_MS)
}

export function isValidRange(checkIn: string, checkOut: string, minDate?: Date): boolean {
  if (!checkIn || !checkOut) return false
  const inDate = fromISODate(checkIn)
  const outDate = fromISODate(checkOut)
  if (outDate.getTime() <= inDate.getTime()) return false
  if (minDate && inDate.getTime() < minDate.getTime()) return false
  return true
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isISODate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const date = fromISODate(value)
  // Rejects overflow like 2026-02-31, which `new Date` would roll forward.
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

/**
 * '2026-09-26' → '26 Sep 2026'. Built from LOCAL parts (see `fromISODate`), so
 * the day a manager picked is never shifted a day by UTC conversion.
 */
export function formatDayMonthYear(iso: string): string {
  if (!isISODate(iso)) return iso
  const date = fromISODate(iso)
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`
}

export function formatMonthYear(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

export function formatShortDate(iso: string): string {
  const date = fromISODate(iso)
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function formatDayShort(date: Date): string {
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}