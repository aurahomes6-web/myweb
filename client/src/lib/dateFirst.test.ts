import { describe, expect, it } from 'vitest'
import { formatDayMonthYear, isISODate, toISODate } from '@/lib/date'

/**
 * The manager checklist identifies a day by a YYYY-MM-DD key. These helpers are
 * what turn that key into the "26 Sep 2026" the manager reads, so they must
 * never shift a day — a manager looking at the 26th must always be shown the 26th.
 */

describe('isISODate', () => {
  it('accepts a real calendar day', () => {
    expect(isISODate('2026-09-26')).toBe(true)
    expect(isISODate('2026-01-01')).toBe(true)
    expect(isISODate('2024-02-29')).toBe(true) // leap year
  })

  it('rejects a day that does not exist', () => {
    expect(isISODate('2026-02-31')).toBe(false)
    expect(isISODate('2026-04-31')).toBe(false)
    expect(isISODate('2026-13-01')).toBe(false)
    expect(isISODate('2026-00-10')).toBe(false)
    expect(isISODate('2026-01-00')).toBe(false)
    expect(isISODate('2025-02-29')).toBe(false) // not a leap year
  })

  it('rejects anything that is not a plain YYYY-MM-DD key', () => {
    for (const bad of ['', '2026-9-26', '26-09-2026', '2026/09/26', 'today', '2026-09-26T00:00:00Z']) {
      expect(isISODate(bad)).toBe(false)
    }
  })
})

describe('formatDayMonthYear', () => {
  it('renders the readable day the manager picked', () => {
    expect(formatDayMonthYear('2026-09-26')).toBe('26 Sep 2026')
    expect(formatDayMonthYear('2026-01-01')).toBe('1 Jan 2026')
    expect(formatDayMonthYear('2026-12-31')).toBe('31 Dec 2026')
  })

  it('never rolls a day forward or back', () => {
    // A naive `new Date('2026-09-26')` parses as UTC midnight, which is the
    // previous day in any negative-offset timezone.
    expect(formatDayMonthYear('2026-01-01')).toContain('1 Jan 2026')
    expect(formatDayMonthYear('2026-12-31')).toContain('31 Dec 2026')
  })

  it('passes an unrecognised value straight back rather than showing "Invalid Date"', () => {
    expect(formatDayMonthYear('nonsense')).toBe('nonsense')
  })
})

describe('toISODate', () => {
  it('uses local wall-clock parts, not UTC', () => {
    const late = new Date(2026, 8, 26, 23, 30)
    expect(toISODate(late)).toBe('2026-09-26')
    const early = new Date(2026, 0, 1, 0, 15)
    expect(toISODate(early)).toBe('2026-01-01')
  })

  it('round-trips with the formatter', () => {
    const key = toISODate(new Date(2026, 8, 26, 12, 0))
    expect(isISODate(key)).toBe(true)
    expect(formatDayMonthYear(key)).toBe('26 Sep 2026')
  })
})
