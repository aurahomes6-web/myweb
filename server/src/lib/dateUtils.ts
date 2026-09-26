const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const MS_PER_DAY = 86_400_000

export function isDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return false
  // `Date` silently rolls impossible days forward (2026-02-31 becomes 3 Mar), so
  // round-trip the key: a real calendar date always maps back to itself.
  return date.toISOString().slice(0, 10) === value
}

/** Convert a local YYYY-MM-DD key into a UTC-midnight Date for Postgres DATE columns. */
export function toUtcDate(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`)
}

/** Convert a Postgres DATE value back into a YYYY-MM-DD key. */
export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(dateKey: string, days: number): string {
  const date = toUtcDate(dateKey)
  date.setUTCDate(date.getUTCDate() + days)
  return toDateKey(date)
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = toUtcDate(checkOut).getTime() - toUtcDate(checkIn).getTime()
  return Math.round(ms / MS_PER_DAY)
}

/** Today's date in the server's local timezone, as a YYYY-MM-DD key. */
export function todayKey(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Human-readable date for message bodies, e.g. "15 Sep 2026". */
export function formatDateKey(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  return `${date.getUTCDate()} ${MONTHS_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

/** Iterate every YYYY-MM-DD key in the inclusive range [from, to]. */
export function eachDateInRange(from: string, to: string): string[] {
  const dates: string[] = []
  for (let key = from; key <= to; key = addDays(key, 1)) {
    dates.push(key)
  }
  return dates
}