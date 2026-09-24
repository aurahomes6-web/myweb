import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  Clock,
  Loader2,
  Search,
  Users,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatShortDate } from '@/lib/date'
import { formatINR } from '@/lib/money'
import { BookingApiError, trackBooking } from '@/services/bookings'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import type { BookingTrackingResult } from '@/types'

type TrackState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; data: BookingTrackingResult }
  | { kind: 'error'; message: string }

function statusCard(data: BookingTrackingResult) {
  if (data.status === 'CONFIRMED') {
    return {
      icon: CheckCircle2,
      title:
        data.paymentStatus === 'ACCEPTED'
          ? 'Payment verified — your booking is confirmed'
          : 'Booking confirmed — payment verification pending',
      body:
        data.paymentStatus === 'ACCEPTED'
          ? 'Your UPI transfer has been verified by Aura Homes. Your dates are held and your stay is confirmed.'
          : 'Your UPI transfer is being checked by Aura Homes. Your dates are held while verification is in progress.',
      accent:
        data.paymentStatus === 'ACCEPTED'
          ? ['text-cyan-bright', 'bg-cyan/15']
          : ['text-amber-bright', 'bg-amber/15'],
    } as const
  }
  if (data.status === 'CANCELLED' && data.rejectionMessage) {
    return {
      icon: XCircle,
      title: 'Booking cancelled',
      body: data.rejectionMessage,
      accent: ['text-magenta-bright', 'bg-magenta/15'],
    } as const
  }
  return {
    icon: Clock,
    title: `Booking ${data.status}`, // PENDING (rare on the public track path)
    body: 'Your booking is awaiting confirmation. Please contact Aura Homes if you have questions.',
    accent: ['text-text-muted', 'bg-surface-300/40'],
  } as const
}

export default function TrackBookingPage() {
  const reduced = useReducedMotion()
  const [code, setCode] = useState('')
  const [state, setState] = useState<TrackState>({ kind: 'idle' })

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = code.trim()
    if (!trimmed) return
    setState({ kind: 'loading' })
    try {
      const data = await trackBooking(trimmed.toUpperCase())
      setState({ kind: 'ready', data })
    } catch (error) {
      const message =
        error instanceof BookingApiError && error.code === 'NOT_FOUND'
          ? 'We could not find a booking for that code. Double-check the Booking ID from your confirmation.'
          : 'We could not reach our server. Check your connection and try again.'
      setState({ kind: 'error', message })
    }
  }

  const card = state.kind === 'ready' ? statusCard(state.data) : null

  return (
    <div className="mx-auto max-w-2xl px-5 pb-28 pt-28 sm:px-8 lg:pt-32">
      <Link
        to="/"
        className="mb-10 inline-flex items-center gap-2 text-sm text-text-muted transition-colors hover:text-text-primary"
      >
        <ArrowLeft size={15} />
        Back to home
      </Link>

      <motion.div
        initial={reduced ? undefined : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="mb-5 text-xs font-medium uppercase tracking-[0.32em] text-purple-bright flex items-center gap-3">
          <span className="h-px w-8 bg-current opacity-50" />
          Track Booking
        </p>
        <h1 className="font-display text-4xl font-bold tracking-tight text-text-primary sm:text-5xl">
          WHERE IS MY <span className="text-gradient">STAY?</span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-text-secondary">
          Enter the Booking ID you received at checkout to check your payment and
          stay status.
        </p>

        <form onSubmit={handleSubmit} className="mt-9 flex flex-col gap-3 sm:flex-row">
          <label htmlFor="track-code" className="sr-only">
            Booking ID
          </label>
          <input
            id="track-code"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. AURA8F2K9Q"
            value={code}
            onChange={(event) => {
              setCode(event.target.value)
              if (state.kind === 'error') setState({ kind: 'idle' })
            }}
            className="input-glass w-full px-4 py-3.5 font-mono text-sm uppercase tracking-[0.08em] text-text-primary placeholder:normal-case placeholder:tracking-normal placeholder:text-text-muted/50"
          />
          <button
            type="submit"
            disabled={state.kind === 'loading'}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-purple via-magenta to-cyan bg-[length:200%_100%] bg-left px-7 py-3.5 text-sm font-semibold uppercase tracking-[0.14em] text-ink shadow-glow-purple transition-all duration-300 hover:bg-right hover:shadow-glow-magenta disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state.kind === 'loading' ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Search size={15} />
            )}
            Track
          </button>
        </form>

        {state.kind === 'error' && (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-magenta/50 bg-magenta/10 p-5 text-sm leading-relaxed text-text-secondary"
          >
            {state.message}
          </div>
        )}

        {state.kind === 'ready' && state.data && card && (
          <motion.div
            initial={reduced ? undefined : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mt-8 flex flex-col gap-6"
          >
            <div
              className={cn(
                'card-surface flex items-start gap-4 rounded-panel p-6 sm:p-7',
                'border-l-4'
              )}
            >
              <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full', card.accent[1])}>
                <card.icon size={20} className={card.accent[0]} />
              </div>
              <div>
                <p className="font-display text-lg font-semibold text-text-primary">{card.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-text-muted">{card.body}</p>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="font-mono font-semibold tracking-[0.1em] text-text-primary">
                      {state.data.code}
                    </span>
                  </span>
                  {state.data.paymentStatus && (
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]',
                        card.accent[1],
                        card.accent[0]
                      )}
                    >
                      {state.data.paymentStatus === 'ACCEPTED' ? 'Payment verified' : state.data.paymentStatus === 'REJECTED' ? 'Payment declined' : 'Payment pending'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="card-surface flex flex-col rounded-panel p-6 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-300/30 pb-5">
                <div>
                  <p className="font-display text-base font-semibold text-text-primary">
                    {state.data.property.name}
                  </p>
                  <p className="text-xs text-text-muted">{state.data.property.shortLabel}</p>
                </div>
                <span className="rounded-full bg-cyan/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-bright">
                  {state.data.nights} night{state.data.nights === 1 ? '' : 's'}
                </span>
              </div>

              <div className="grid gap-4 pt-5 sm:grid-cols-2">
                <div className="rounded-2xl border border-surface-300/50 bg-surface-100/40 p-4">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
                    <CalendarDays size={12} className="text-cyan-bright" /> Check-in
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-text-primary">{formatShortDate(state.data.checkIn)}</p>
                </div>
                <div className="rounded-2xl border border-surface-300/50 bg-surface-100/40 p-4">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
                    <CalendarX2 size={12} className="text-magenta-bright" /> Check-out
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-text-primary">{formatShortDate(state.data.checkOut)}</p>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-surface-300/50 bg-surface-100/40 px-4 py-3.5">
                  <span className="text-sm text-text-secondary">Guests</span>
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary">
                    <Users size={14} className="text-cyan-bright" />
                    {state.data.guestCount} {state.data.guestCount === 1 ? 'guest' : 'guests'}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-surface-300/50 bg-surface-100/40 px-4 py-3.5">
                  <span className="text-sm text-text-secondary">Total paid</span>
                  <span className="text-sm font-semibold text-text-primary">
                    {state.data.finalPricePaise != null ? formatINR(state.data.finalPricePaise) : '—'}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {state.kind === 'ready' && (
          <p className="mt-6 text-[11px] leading-relaxed text-text-muted">
            This tracker shows only your booking status — guest identity details are
            never displayed publicly.
          </p>
        )}

        <div className="mt-10 text-center">
          <Link
            to="/book"
            className="inline-flex items-center gap-2 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
          >
            Start a new booking <ArrowRight size={14} />
          </Link>
        </div>
      </motion.div>
    </div>
  )
}