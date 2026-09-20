import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchBlockedDates } from '@/services/availability'
import type { PropertySlug } from '@/types'
import {
  WEEKDAYS,
  addDays,
  daysInMonth,
  firstWeekday,
  formatMonthYear,
  fromISODate,
  isSameDay,
  startOfMonth,
  toISODate,
  today,
} from '@/lib/date'
import { cn } from '@/lib/cn'

interface DateRangePickerProps {
  propertySlug: PropertySlug
  checkIn: string
  checkOut: string
  onChange: (range: { checkIn: string; checkOut: string }) => void
}

const MAX_MONTHS_AHEAD = 12

export default function DateRangePicker({
  propertySlug,
  checkIn,
  checkOut,
  onChange,
}: DateRangePickerProps) {
  const todayDate = useMemo(() => today(), [])
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(todayDate))
  const [blocked, setBlocked] = useState<Set<string>>(() => new Set())

  const viewStart = toISODate(viewMonth)
  const viewEnd = toISODate(addDays(addDays(startOfMonth(viewMonth), daysInMonth(viewMonth)), -1))

  useEffect(() => {
    let active = true
    fetchBlockedDates({ propertyId: propertySlug, from: viewStart, to: viewEnd }).then((dates) => {
      if (active) setBlocked(new Set(dates))
    })
    return () => {
      active = false
    }
  }, [propertySlug, viewStart, viewEnd])

  const checkInDate = checkIn ? fromISODate(checkIn) : null
  const checkOutDate = checkOut ? fromISODate(checkOut) : null

  const canGoBack = viewMonth.getTime() > startOfMonth(todayDate).getTime()
  const canGoForward =
    viewMonth.getFullYear() < todayDate.getFullYear() ||
    (viewMonth.getFullYear() === todayDate.getFullYear() &&
      viewMonth.getMonth() < todayDate.getMonth() + MAX_MONTHS_AHEAD)

  function selectDay(date: Date) {
    const iso = toISODate(date)
    if (date.getTime() < todayDate.getTime()) return
    if (!checkInDate) {
      onChange({ checkIn: iso, checkOut: '' })
      return
    }
    if (!checkOutDate) {
      if (date.getTime() <= checkInDate.getTime()) {
        onChange({ checkIn: iso, checkOut: '' })
      } else {
        onChange({ checkIn, checkOut: iso })
      }
      return
    }
    if (date.getTime() >= checkInDate.getTime() && date.getTime() <= checkOutDate.getTime()) {
      onChange({ checkIn: iso, checkOut: '' })
      return
    }
    onChange({ checkIn: iso, checkOut: '' })
  }

  const blanks = firstWeekday(viewMonth)
  const cells = daysInMonth(viewMonth)

  const dayLabel = (day: number) => {
    const date = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day)
    const iso = toISODate(date)
    const isPast = date.getTime() < todayDate.getTime()
    const isBlocked = blocked.has(iso)
    const isCheckIn = checkIn === iso
    const isCheckOut = checkOut === iso
    const inRange =
      checkInDate && checkOutDate && date.getTime() > checkInDate.getTime() && date.getTime() < checkOutDate.getTime()
    const isRangeEdge = Boolean(inRange)
    const isToday = isSameDay(date, todayDate)

    return (
      <button
        key={iso}
        type="button"
        disabled={isPast}
        onClick={() => selectDay(date)}
        aria-label={date.toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
        aria-pressed={isCheckIn || isCheckOut || isRangeEdge}
        className={cn(
          'relative flex h-10 w-full items-center justify-center rounded-lg text-[13px] transition-colors duration-200 sm:h-11',
          isPast && 'cursor-not-allowed text-text-muted/40',
          !isPast && !isRangeEdge && !isCheckIn && !isCheckOut && 'text-text-secondary hover:bg-surface-200/70',
          isBlocked && isPast && 'text-text-muted/25',
          (isCheckIn || isCheckOut) &&
            'bg-gradient-to-br from-purple to-cyan font-semibold text-ink shadow-glow-purple',
          isRangeEdge && 'bg-surface-200/60 text-text-secondary'
        )}
      >
        {isBlocked && !isPast && (
          <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-magenta/70" />
        )}
        {isToday && !isCheckIn && !isCheckOut && (
          <span
            className={cn(
              'absolute inset-y-1 inset-x-1 rounded-md border border-purple/35',
              isRangeEdge && 'border-cyan/35'
            )}
          />
        )}
        <span className={cn(isBlocked && !isPast && !isCheckIn && !isCheckOut && 'opacity-40')}>
          {day}
        </span>
      </button>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-2">
        <button
          type="button"
          onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          disabled={!canGoBack}
          aria-label="Previous month"
          className="grid h-9 w-9 place-items-center rounded-full text-text-secondary transition-colors hover:bg-surface-200/70 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="font-display text-sm font-semibold tracking-wide text-text-primary">
          {formatMonthYear(viewMonth)}
        </span>
        <button
          type="button"
          onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          disabled={!canGoForward}
          aria-label="Next month"
          className="grid h-9 w-9 place-items-center rounded-full text-text-secondary transition-colors hover:bg-surface-200/70 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day) => (
          <div key={day} className="pb-1 text-center text-[11px] font-medium uppercase tracking-wider text-text-muted">
            {day}
          </div>
        ))}
        {Array.from({ length: blanks }, (_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {Array.from({ length: cells }, (_, i) => dayLabel(i + 1))}
      </div>

      <AnimatePresence>
        {(checkIn || checkOut) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-surface-300/40 pt-3 text-xs text-text-muted">
              {checkIn && (
                <span className="rounded-full bg-surface-200/70 px-3 py-1.5 text-text-secondary">
                  Check-in — <span className="font-medium text-text-primary">{checkIn}</span>
                </span>
              )}
              {checkOut && (
                <span className="rounded-full bg-surface-200/70 px-3 py-1.5 text-text-secondary">
                  Check-out — <span className="font-medium text-text-primary">{checkOut}</span>
                </span>
              )}
              <button
                type="button"
                onClick={() => onChange({ checkIn: '', checkOut: '' })}
                className="ml-auto underline-offset-2 hover:underline"
              >
                Clear dates
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}