import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Loader2,
  XCircle,
  AlertTriangle,
  CalendarX2,
} from 'lucide-react'
import type { Property } from '@/types'
import { useAvailability } from '@/hooks/useAvailability'
import DateRangePicker from '@/components/booking/DateRangePicker'
import GuestSelector from '@/components/booking/GuestSelector'
import { formatShortDate } from '@/lib/date'
import { formatINR, resolveNightlyPricing } from '@/lib/money'
import { cn } from '@/lib/cn'

interface AvailabilityCardProps {
  property: Property
}

export default function AvailabilityCard({ property }: AvailabilityCardProps) {
  const [searchParams, setSearchParams] = useSearchParams()

  const urlCheckIn = searchParams.get('checkIn') ?? ''
  const urlCheckOut = searchParams.get('checkOut') ?? ''
  const urlGuests = searchParams.get('guests')

  const [checkIn, setCheckIn] = useState(urlCheckIn)
  const [checkOut, setCheckOut] = useState(urlCheckOut)
  const [guests, setGuests] = useState(() =>
    Math.min(
      property.capacity,
      Math.max(1, Number(urlGuests) || 2)
    )
  )
  const [calendarOpen, setCalendarOpen] = useState(false)

  const query = useMemo(() => ({ propertyId: property.slug, checkIn, checkOut, guests }), [
    property.slug,
    checkIn,
    checkOut,
    guests,
  ])
  const { status, result, retry } = useAvailability(query)
  const pricing = resolveNightlyPricing(
    property.pricePerNightPaise,
    property.discountedPricePerNightPaise
  )

  useEffect(() => {
    const next = new URLSearchParams()
    if (checkIn) next.set('checkIn', checkIn)
    if (checkOut) next.set('checkOut', checkOut)
    next.set('guests', String(guests))
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkIn, checkOut, guests])

  const bookUrl = useMemo(() => {
    const params = new URLSearchParams({
      property: property.slug,
      checkIn,
      checkOut,
      guests: String(guests),
    })
    return `/book?${params.toString()}`
  }, [property.slug, checkIn, checkOut, guests])

  function onDateChange(range: { checkIn: string; checkOut: string }) {
    setCheckIn(range.checkIn)
    setCheckOut(range.checkOut)
  }

  const fieldBase =
    'flex w-full flex-col gap-1 rounded-2xl border border-surface-300/60 bg-surface-100/50 px-4 py-3 text-left transition-colors hover:border-purple/40'

  return (
    <section id="availability" className="card-surface relative flex flex-col overflow-hidden rounded-panel">
      <div className="flex items-center justify-between gap-4 border-b border-surface-300/30 px-6 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-purple-bright">
          Reserve Your Stay
        </p>
        <div className="text-right">
          <p className="font-display text-xl font-bold tracking-tight text-text-primary">
            {formatINR(pricing.effectivePricePaise)}
          </p>
          {pricing.hasDiscount && (
            <div className="mt-0.5 flex items-center justify-end gap-2">
              <span className="text-[11px] font-medium text-text-muted line-through">
                {formatINR(property.pricePerNightPaise)}
              </span>
              <span className="rounded-full bg-cyan/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-cyan-bright">
                {pricing.discountPercent && pricing.discountPercent > 0
                  ? `${pricing.discountPercent}% off`
                  : 'Offer price'}
              </span>
            </div>
          )}
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-muted">per night · taxes extra</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-6 p-6">
        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className={fieldBase} onClick={() => setCalendarOpen(true)}>
            <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
              <CalendarDays size={12} className="text-cyan-bright" /> Check-in
            </span>
            <span className={cn('text-sm font-semibold', checkIn ? 'text-text-primary' : 'text-text-muted/60')}>
              {checkIn ? formatShortDate(checkIn) : 'Select date'}
            </span>
          </button>
          <button type="button" className={fieldBase} onClick={() => setCalendarOpen(true)}>
            <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
              <CalendarX2 size={12} className="text-magenta-bright" /> Check-out
            </span>
            <span className={cn('text-sm font-semibold', checkOut ? 'text-text-primary' : 'text-text-muted/60')}>
              {checkOut ? formatShortDate(checkOut) : 'Select date'}
            </span>
          </button>
        </div>

        <div className="-mx-6 -mt-1 border-t border-surface-300/30 px-6 pt-5">
          <GuestSelector
            value={guests}
            min={1}
            max={property.capacity}
            onChange={setGuests}
          />
        </div>

        {/* Calendar panel */}
        <AnimatePresence initial={false}>
          {calendarOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="rounded-2xl border border-surface-300/40 bg-surface-100/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs text-text-muted">Pick your dates</p>
                  <button
                    type="button"
                    onClick={() => setCalendarOpen(false)}
                    className="link-underline text-xs text-text-secondary hover:text-text-primary"
                  >
                    Done
                  </button>
                </div>
                <DateRangePicker
                  propertySlug={property.slug}
                  checkIn={checkIn}
                  checkOut={checkOut}
                  onChange={onDateChange}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Availability status + CTA */}
        <div className="mt-auto flex flex-col gap-3">
          <div className="-mx-6 border-t border-surface-300/30 px-6 pt-5">
            <div className="min-h-[3.25rem]">
              <AnimatePresence mode="wait">
                {status === 'idle' && (
                  <motion.div
                    key="idle"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 text-sm text-text-muted"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-surface-300/60 text-xs">
                      <CalendarDays size={13} />
                    </span>
                    Select your dates to check availability.
                  </motion.div>
                )}

                {status === 'loading' && (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 text-sm text-text-secondary"
                  >
                    <Loader2 size={16} className="animate-spin text-purple-bright" />
                    Checking availability…
                  </motion.div>
                )}

                {status === 'available' && result && (
                  <motion.div
                    key="available"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-start gap-2 text-sm"
                  >
                    <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-cyan-bright" />
                    <div>
                      <p className="font-medium text-text-primary">Available for your dates</p>
                      <p className="text-xs text-text-muted">
                        {result.nights} night{result.nights === 1 ? '' : 's'} · {guests} guest
                        {guests === 1 ? '' : 's'} · est. {formatINR(pricing.effectivePricePaise * result.nights)}
                      </p>
                    </div>
                  </motion.div>
                )}

                {status === 'unavailable' && (
                  <motion.div
                    key="unavailable"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-start gap-2 text-sm"
                  >
                    <XCircle size={17} className="mt-0.5 shrink-0 text-magenta-bright" />
                    <div>
                      <p className="font-medium text-text-primary">These dates are unavailable</p>
                      <p className="text-xs text-text-muted">Try a different range.</p>
                    </div>
                  </motion.div>
                )}

                {status === 'error' && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 text-sm"
                  >
                    <AlertTriangle size={16} className="shrink-0 text-magenta-bright" />
                    <span className="text-text-secondary">Unable to check availability.</span>
                    <button
                      type="button"
                      onClick={retry}
                      className="link-underline text-xs font-medium text-purple-bright hover:text-text-primary"
                    >
                      Retry
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {status === 'available' ? (
            <Link
              to={bookUrl}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-purple via-magenta to-cyan bg-[length:200%_100%] bg-left py-4 text-sm font-semibold uppercase tracking-[0.14em] text-ink shadow-glow-purple transition-all duration-300 hover:bg-right hover:shadow-glow-magenta"
            >
              Continue to Book
              <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-full border border-surface-300/50 bg-surface-100/40 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-text-muted/50"
            >
              {status === 'idle' && 'Select Your Dates'}
              {status === 'loading' && 'Checking…'}
              {status === 'unavailable' && 'Dates Unavailable'}
              {status === 'error' && 'Unable to Check'}
            </button>
          )}

          <button
            type="button"
            onClick={() => setCalendarOpen((v) => !v)}
            className="mx-auto inline-flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-text-secondary"
          >
            <span className={cn('transition-transform duration-300', calendarOpen && 'rotate-180')}>
              <ChevronDown size={14} />
            </span>
            {calendarOpen ? 'Hide calendar' : 'Show calendar'}
          </button>
        </div>
      </div>

      <p className="border-t border-surface-300/20 px-6 py-3 text-center text-[11px] tracking-wide text-text-muted">
        Live availability · checked against the AURA HOMES API
      </p>
    </section>
  )
}