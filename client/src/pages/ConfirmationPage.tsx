import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  Clock,
  MessageCircle,
  Phone,
  QrCode,
  Send,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatShortDate, nightsBetween } from '@/lib/date'
import { buildWhatsAppMessage, buildWhatsAppUrl, GENDER_LABEL } from '@/lib/whatsapp'
import { fetchBooking } from '@/services/bookings'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import type { BookingResponse } from '@/types'

/** A booking cancelled because its UPI payment was declined by the admin. */
function isRejectedBooking(booking: BookingResponse): boolean {
  return booking.status === 'CANCELLED' && booking.paymentStatus === 'REJECTED'
}

/** A confirmed booking whose UPI payment is still awaiting verification. */
function isPendingPayment(booking: BookingResponse): boolean {
  return booking.status === 'CONFIRMED' && booking.paymentStatus === 'PENDING'
}

/**
 * WhatsApp click-to-chat step (Phase 6).
 *
 * The booking is already confirmed in the database at this point. This card
 * opens WhatsApp at most once automatically: normally the tab was already
 * opened by the booking form (browser-safe, within the click activation) and
 * is reported via `whatsAppOpened`. The effect below is only a fallback and is
 * kept for direct visits. A manual "Open WhatsApp" retry always works.
 * Nothing here ever re-submits or creates a second booking. The prefilled
 * link uses `booking.whatsAppMessage` — the server-composed message that
 * carries each guest's full Aadhaar for this documentary flow. On a refreshed
 * ticket (public lookup) that message is absent and no link is offered, so a
 * masked message is never sent.
 */
function WhatsAppStep({
  booking,
  autoOpen,
  whatsAppOpened,
}: {
  booking: BookingResponse
  autoOpen?: boolean
  whatsAppOpened?: boolean
}) {
  const notif = booking.notification
  const waUrl = buildWhatsAppUrl(booking)

  useEffect(() => {
    if (!autoOpen || whatsAppOpened || notif?.sent === true || !waUrl) return
    let opened = false
    try {
      const win = window.open(waUrl, '_blank', 'noopener,noreferrer')
      opened = win !== null
    } catch {
      opened = false
    }
    if (!opened) {
      // popup blocked or no handler — the manual button below always works.
      console.info('[whatsapp] auto-open unavailable, using manual button')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [])

  // `serverSent` is the server-reported delivery flag — it is always false in
  // this project because no WhatsApp provider is wired up (the server never
  // claims a send). The client-side wa.me open is the only thing the app can
  // actually verify, so a successful open counts as "opened" here.
  const serverSent = notif?.sent === true
  const opened = whatsAppOpened === true
  const shared = serverSent || opened

  return (
    <div className="card-surface rounded-panel p-6 sm:p-7">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan/30 to-purple/20 text-cyan-bright">
          <MessageCircle size={18} />
        </div>
        <div>
          <h2 className="font-display text-base font-semibold text-text-primary">
            Send booking details on WhatsApp
          </h2>
          <p className="text-xs text-text-muted">
            {shared
              ? serverSent
                ? 'Delivered by the server'
                : 'Opened on your device'
              : 'One last step — share your booking with Aura Homes'}
          </p>
        </div>
        {notif && (
          <span
            className={cn(
              'ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]',
              shared ? 'bg-cyan/15 text-cyan-bright' : 'bg-surface-300/40 text-text-muted'
            )}
          >
            {shared ? (serverSent ? 'Sent' : 'Opened') : 'Not sent'}
          </span>
        )}
      </div>

      {shared ? (
        <p className="mt-4 text-sm text-text-secondary">
          {serverSent
            ? 'Your booking summary was delivered to WhatsApp. No further action is needed.'
            : 'WhatsApp was opened with your booking summary. If it did not go through, use the button below to share it again.'}
        </p>
      ) : (
        <>
          <p className="mt-4 text-sm text-text-secondary">
            {isPendingPayment(booking)
              ? 'Your booking and payment are awaiting verification — sharing the summary on WhatsApp helps our team confirm it faster.'
              : isRejectedBooking(booking)
                ? 'Your payment could not be verified. Sharing this summary on WhatsApp connects you directly with our team.'
                : 'Your booking is already confirmed in our system. Open WhatsApp and tap'}
            {!isPendingPayment(booking) && !isRejectedBooking(booking) && (
              <>
                {' '}
                <span className="font-semibold text-text-primary"> Send </span>
                {' '}
                to share this summary with Aura Homes.
              </>
            )}
          </p>

          <pre className="mt-5 overflow-x-auto rounded-2xl border border-surface-300/50 bg-surface-100/40 p-5 font-mono text-xs leading-relaxed text-text-secondary">
            {booking.whatsAppMessage ?? buildWhatsAppMessage(booking)}
          </pre>
        </>
      )}

      {!serverSent && waUrl ? (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple via-magenta to-cyan bg-[length:200%_100%] bg-left px-7 py-3.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink shadow-glow-purple transition-all duration-300 hover:bg-right hover:shadow-glow-magenta"
        >
          <Send size={14} /> Open WhatsApp
        </a>
      ) : !serverSent && notif?.recipient ? (
        <p className="mt-5 text-xs leading-relaxed text-text-muted">
          The WhatsApp share link is only available right after completing
          your booking. Your booking is on file — call us if you need to share
          your details again.
        </p>
      ) : !serverSent ? (
        <p className="mt-5 text-xs leading-relaxed text-text-muted">
          WhatsApp is not configured for this booking yet. Reach Aura Homes on
          the phone and our team will assist you.
        </p>
      ) : null}

      {!shared && (
        <p className="mt-4 text-[11px] leading-relaxed text-text-muted">
          Open WhatsApp and press Send to share this booking with Aura Homes.
          Aadhaar numbers are included only in this message you send — they are
          never shown publicly on this page.
        </p>
      )}
    </div>
  )
}

export default function ConfirmationPage() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const reduced = useReducedMotion()

  const stateBooking = (location.state as { booking?: BookingResponse } | null)?.booking
  const reference = searchParams.get('ref')

  const [booking, setBooking] = useState<BookingResponse | null>(stateBooking ?? null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    stateBooking ? 'ready' : reference ? 'loading' : 'error'
  )
  const [ticketOpen, setTicketOpen] = useState(false)

  useEffect(() => {
    // Always re-sync with the backend: it is the source of truth for status.
    // `location.state.booking` was captured at submission time and can be stale
    // (e.g. still PENDING after an admin already accepted the payment), so we
    // re-fetch by code and overlay the fresh fields while keeping the
    // create-time WhatsApp pre-fill message, which the public lookup omits.
    const refCode = stateBooking?.code ?? reference
    if (!refCode) return
    let cancelled = false
    fetchBooking(refCode)
      .then((result) => {
        if (cancelled) return
        setBooking((prev) => ({
          ...(prev ?? result),
          ...result,
          whatsAppMessage: prev?.whatsAppMessage,
        }))
        setStatus('ready')
      })
      .catch(() => {
        // Without any initial data there is nothing to show, so surface the
        // lookup error. With state data in memory we keep rendering it.
        if (!cancelled && !stateBooking) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [reference, stateBooking])

  return (
    <div className="mx-auto max-w-3xl px-5 pb-28 pt-28 sm:px-8 lg:pt-32">
      <Link
        to="/"
        className="mb-10 inline-flex items-center gap-2 text-sm text-text-muted transition-colors hover:text-text-primary"
      >
        <ArrowLeft size={15} />
        Back to home
      </Link>

      {status === 'loading' && (
        <div className="card-surface rounded-panel p-10 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-purple/30 border-t-purple-bright" />
          <p className="mt-5 text-sm text-text-muted">Locating your booking…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="card-surface rounded-panel p-10 text-center">
          <p className="font-display text-2xl font-semibold text-text-primary">Booking not found</p>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-text-muted">
            We could not find that booking reference. Double-check the confirmation
            link you were sent, or start a new reservation.
          </p>
          <Link
            to="/properties"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple via-magenta to-cyan py-3.5 px-7 text-sm font-semibold uppercase tracking-[0.14em] text-ink shadow-glow-purple transition-all duration-300 hover:shadow-glow-magenta"
          >
            Browse homes <ArrowRight size={14} />
          </Link>
        </div>
      )}

      {status === 'ready' && booking && (
        <motion.div
          initial={reduced ? undefined : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-6"
        >
          <div className="card-surface relative overflow-hidden rounded-panel p-8 text-center sm:p-10">
            <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-purple/20 blur-3xl" />
            <motion.div
              initial={reduced ? undefined : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 18 }}
              className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple to-cyan text-ink shadow-glow-purple"
            >
              <CheckCircle2 size={30} />
            </motion.div>
            <p className="relative mt-6 text-xs font-semibold uppercase tracking-[0.32em] text-purple-bright">
              Aura Homes
            </p>
            <h1 className="relative mt-3 font-display text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
              {isRejectedBooking(booking) ? (
                <>
                  BOOKING <span className="text-gradient">REJECTED</span>
                </>
              ) : booking.status === 'CANCELLED' ? (
                <>
                  BOOKING <span className="text-gradient">CANCELLED</span>
                </>
              ) : isPendingPayment(booking) ? (
                <>
                  BOOKING <span className="text-gradient">RECEIVED</span>
                </>
              ) : (
                <>
                  BOOKING <span className="text-gradient">CONFIRMED</span>
                </>
              )}
            </h1>
            <p className="relative mt-4 text-sm leading-relaxed text-text-muted">
              {isRejectedBooking(booking) ? (
                <>
                  We're sorry — your payment for the stay at {booking.property.name} could
                  not be verified. Please contact us if you have any questions.
                </>
              ) : booking.status === 'CANCELLED' ? (
                <>
                  We're sorry — your booking at {booking.property.name} could not be
                  completed. Please contact us for any questions.
                </>
              ) : isPendingPayment(booking) ? (
                <>
                  Your stay at {booking.property.name} is on hold while we verify your
                  UPI payment. Keep your Booking ID handy for check-in.
                </>
              ) : (
                <>
                  Your stay at {booking.property.name} is reserved. Keep your Booking ID
                  handy for check-in.
                </>
              )}
            </p>

            {booking.paymentStatus && booking.paymentStatus !== 'ACCEPTED' && (
              <div className="relative mx-auto mt-6 inline-flex items-center gap-2 rounded-full border border-amber/40 bg-amber/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-bright">
                {booking.paymentStatus === 'REJECTED'
                  ? 'Payment declined — booking cancelled'
                  : 'Payment verification pending'}
              </div>
            )}

            {booking.status === 'CONFIRMED' && booking.paymentStatus === 'ACCEPTED' && (
              <div className="relative mx-auto mt-6 inline-flex items-center gap-2 rounded-full border border-cyan/40 bg-cyan/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-bright">
                Payment verified — confirmed
              </div>
            )}

            <div className="relative mx-auto mt-7 inline-flex items-center gap-3 rounded-full border border-surface-300/60 bg-surface-100/50 px-6 py-3">
              <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">
                Booking ID
              </span>
              <span className="font-mono text-lg font-bold tracking-[0.12em] text-text-primary">
                {booking.code}
              </span>
            </div>

            <div className="relative mx-auto mt-5 flex max-w-md items-start gap-3 rounded-2xl border border-cyan/25 bg-cyan/10 px-4 py-3.5 text-left">
              <span className="text-base leading-none" aria-hidden="true">
                📱
              </span>
              <div>
                <p className="text-xs leading-relaxed text-text-secondary">
                  {isPendingPayment(booking) ? (
                    <>
                      Share your booking on WhatsApp so our team can verify your UPI
                      payment and confirm your stay faster.
                    </>
                  ) : isRejectedBooking(booking) ? (
                    <>
                      Your payment could not be verified. Contact us — your booking has
                      been cancelled and your dates released.
                    </>
                  ) : (
                    <>
                      Please make sure your booking details are sent to our WhatsApp so
                      our team can process your reservation.
                    </>
                  )}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
                  {isPendingPayment(booking)
                    ? 'Your dates are held — we just need to confirm your transfer.'
                    : isRejectedBooking(booking)
                      ? 'If this is a mistake, please reach out and we will look into it.'
                      : 'Your stay is already reserved — sending WhatsApp only helps us prepare your check-in.'}
                </p>
              </div>
            </div>
          </div>

          <div className="card-surface flex flex-col rounded-panel p-6 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-300/30 pb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple/30 to-cyan/20 text-cyan-bright">
                  <BadgeCheck size={18} />
                </div>
                <div>
                  <p className="font-display text-base font-semibold text-text-primary">
                    {booking.property.name}
                  </p>
                  <p className="text-xs text-text-muted">{booking.property.shortLabel}</p>
                </div>
              </div>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]',
                  booking.status === 'CANCELLED'
                    ? 'bg-magenta/15 text-magenta-bright'
                    : booking.paymentStatus === 'PENDING'
                      ? 'bg-amber/15 text-amber-bright'
                      : 'bg-cyan/15 text-cyan-bright'
                )}
              >
                {isRejectedBooking(booking) ? (
                  <>
                    <CalendarX2 size={12} /> Rejected
                  </>
                ) : booking.status === 'CANCELLED' ? (
                  <>
                    <CalendarX2 size={12} /> Cancelled
                  </>
                ) : isPendingPayment(booking) ? (
                  <>
                    <Clock size={12} /> Awaiting payment verification
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={12} /> Confirmed
                  </>
                )}
              </span>
            </div>

            <div className="grid gap-4 pt-5 sm:grid-cols-2">
              <div className="rounded-2xl border border-surface-300/50 bg-surface-100/40 p-4">
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
                  <CalendarDays size={12} className="text-cyan-bright" /> Check-in
                </p>
                <p className="mt-1.5 text-sm font-semibold text-text-primary">{formatShortDate(booking.checkIn)}</p>
              </div>
              <div className="rounded-2xl border border-surface-300/50 bg-surface-100/40 p-4">
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
                  <CalendarX2 size={12} className="text-magenta-bright" /> Check-out
                </p>
                <p className="mt-1.5 text-sm font-semibold text-text-primary">{formatShortDate(booking.checkOut)}</p>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-surface-300/50 bg-surface-100/40 px-4 py-3.5">
                <span className="text-sm text-text-secondary">Duration</span>
                <span className="text-sm font-semibold text-text-primary">
                  {nightsBetween(booking.checkIn, booking.checkOut)} nights
                </span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-surface-300/50 bg-surface-100/40 px-4 py-3.5">
                <span className="text-sm text-text-secondary">Guests</span>
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <Users size={14} className="text-cyan-bright" />
                  {booking.guestCount} {booking.guestCount === 1 ? 'guest' : 'guests'}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-surface-300/50 bg-surface-100/40 px-4 py-3.5 sm:col-span-2">
                <span className="text-sm text-text-secondary">Primary contact</span>
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <Phone size={14} className="text-cyan-bright" />
                  +91 {booking.primaryPhone}
                </span>
              </div>
            </div>
          </div>

          <WhatsAppStep
            booking={booking}
            autoOpen={(location.state as { autoWhatsApp?: boolean } | null)?.autoWhatsApp === true}
            whatsAppOpened={(location.state as { whatsAppOpened?: boolean } | null)?.whatsAppOpened === true}
          />

          {booking.status === 'CANCELLED' && booking.rejectionMessage && (
            <div
              role="alert"
              className="rounded-2xl border border-magenta/50 bg-magenta/10 p-5 text-sm leading-relaxed text-text-secondary"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-magenta-bright">
                Reason
              </p>
              <p className="mt-1.5">{booking.rejectionMessage}</p>
            </div>
          )}

          <button
            type="button"
            onClick={() => setTicketOpen((open) => !open)}
            aria-expanded={ticketOpen}
            aria-controls="booking-ticket"
            className="group inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-purple via-magenta to-cyan bg-[length:200%_100%] bg-left py-4 text-sm font-semibold uppercase tracking-[0.14em] text-ink shadow-glow-purple transition-all duration-300 hover:bg-right hover:shadow-glow-magenta"
          >
            <QrCode size={16} />
            {ticketOpen ? 'Hide booking ticket' : 'View booking ticket'}
          </button>

          <div
            id="booking-ticket"
            hidden={!ticketOpen}
            className="card-surface rounded-panel p-6 sm:p-7"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-purple-bright">
              Aura Homes — Stay Ticket
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-b border-dashed border-surface-300/50 pb-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Booking ID</p>
                <p className="mt-1 font-mono text-base font-bold tracking-[0.1em] text-text-primary">{booking.code}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Home</p>
                <p className="mt-1 text-sm font-semibold text-text-primary">{booking.property.name}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-5 sm:grid-cols-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Check-in</p>
                <p className="mt-1 text-sm font-semibold text-text-primary">{formatShortDate(booking.checkIn)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Check-out</p>
                <p className="mt-1 text-sm font-semibold text-text-primary">{formatShortDate(booking.checkOut)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Host</p>
                <p className="mt-1 text-sm font-semibold text-text-primary">Aura Homes</p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-surface-300/50 bg-surface-100/40 p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">Guests</p>
              <ul className="mt-3 flex flex-col gap-2.5">
                {booking.guests.map((guest) => (
                  <li key={guest.fullName} className="flex items-center gap-2.5 text-sm text-text-primary">
                    <Users size={13} className="text-cyan-bright" />
                    <span className={cn(guest.isPrimary && 'font-semibold')}>{guest.fullName}</span>
                    {guest.isPrimary && (
                      <span className="rounded-full bg-cyan/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-bright">
                        Primary
                      </span>
                    )}
                    <span className="ml-auto text-xs text-text-muted">
                      {GENDER_LABEL[guest.gender]} · {guest.age}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="mt-5 text-xs leading-relaxed text-text-muted">
              Please carry a valid Government-issued ID for every guest at check-in.
              Aadhaar details stay private and are only used to verify this stay.
            </p>
          </div>

          <div className="text-center">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
            >
              Back to home <ArrowRight size={14} />
            </Link>
          </div>
        </motion.div>
      )}
    </div>
  )
}