import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  ChevronDown,
  Fingerprint,
  Home,
  Loader2,
  Lock,
  MessageCircle,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { GENDER_OPTIONS } from '@/lib/gender'
import {
  MAX_AIRBNB_GUESTS,
  normalizeReservationNumber,
  validateAirbnbForm,
  type AirbnbFormState,
  type AirbnbGuestRow,
} from '@/lib/airbnb'
import { AirbnbApiError, submitAirbnbDetails } from '@/services/airbnb'
import type { AirbnbDetailsResult, GuestGenderValue } from '@/types'

const inputBase =
  'input-glass w-full px-4 py-3.5 text-sm text-text-primary placeholder:text-text-muted/50 disabled:cursor-not-allowed disabled:opacity-55'

function classForError(hasError: boolean): string {
  return cn(
    inputBase,
    hasError &&
      'border-magenta/70 focus-visible:border-magenta focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-magenta)_18%,transparent)]'
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="mt-2 flex items-center gap-1.5 text-xs text-magenta-bright" role="alert">
      <AlertCircle size={12} className="shrink-0" />
      {message}
    </p>
  )
}

function normalizeDigits(value: string): string {
  return value.replace(/[\s-]/g, '')
}

function emptyRows(count: number): AirbnbGuestRow[] {
  return Array.from({ length: count }, () => ({ fullName: '', aadhaar: '', gender: '', age: '' }))
}

export default function AirbnbBookingPage() {
  const [reservationNumber, setReservationNumber] = useState('')
  const [guestName, setGuestName] = useState('')
  const [primaryPhone, setPrimaryPhone] = useState('')
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [guestCount, setGuestCount] = useState(2)
  const [rows, setRows] = useState<AirbnbGuestRow[]>(() => emptyRows(2))

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [banner, setBanner] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
  const [result, setResult] = useState<AirbnbDetailsResult | null>(null)

  function omitKey(prev: Record<string, string>, key: string): Record<string, string> {
    const next = { ...prev }
    delete next[key]
    return next
  }

  function changeGuestCount(next: number) {
    const count = Math.min(MAX_AIRBNB_GUESTS, Math.max(1, next))
    setGuestCount(count)
    setRows((prev) => {
      const copy = prev.slice(0, count)
      while (copy.length < count) copy.push({ fullName: '', aadhaar: '', gender: '', age: '' })
      return copy
    })
    setErrors((prev) => {
      const nextErrors = { ...prev }
      delete nextErrors.guestCount
      return nextErrors
    })
  }

  function updateRow(index: number, patch: Partial<AirbnbGuestRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
    for (const field of ['fullName', 'aadhaar', 'gender', 'age'] as const) {
      if (errors[`g${index}.${field}`]) {
        setErrors((prev) => omitKey(prev, `g${index}.${field}`))
      }
    }
  }

  function mergeServerIssues(nextErrors: Record<string, string>, details: Array<{ field: string; message: string }>) {
    for (const detail of details) {
      const m = detail.field.match(/^guests\[(\d+)\]\.(.+)$/)
      if (m) nextErrors[`g${m[1]}.${m[2]}`] = detail.message
      else nextErrors[detail.field] = detail.message
    }
  }

  async function handleSend() {
    if (sending || sendingRef.current) return
    sendingRef.current = true

    const form: AirbnbFormState = {
      reservationNumber,
      guestName,
      primaryPhone,
      checkIn,
      checkOut,
      guestCount,
      guests: rows,
    }

    const nextErrors = validateAirbnbForm(form)
    setErrors(nextErrors)
    setBanner(null)

    if (Object.keys(nextErrors).length > 0) {
      document.getElementById('airbnb-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      sendingRef.current = false
      return
    }

    const payload = {
      reservationNumber: normalizeReservationNumber(reservationNumber),
      guestName: guestName.trim(),
      primaryPhone: normalizeDigits(primaryPhone),
      checkIn,
      checkOut,
      guestCount,
      guests: rows.map((row) => ({
        fullName: row.fullName.trim(),
        aadhaarNumber: normalizeDigits(row.aadhaar),
        gender: row.gender as GuestGenderValue,
        age: Number(row.age),
      })),
    }

    setSending(true)
    try {
      const prepared = await submitAirbnbDetails(payload)
      setResult(prepared)

      if (prepared.recipient) {
        const url = `https://wa.me/${prepared.recipient}?text=${encodeURIComponent(prepared.message)}`
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch (error) {
      setSending(false)
      sendingRef.current = false
      if (error instanceof AirbnbApiError && error.code === 'VALIDATION_ERROR') {
        const merged = { ...nextErrors }
        mergeServerIssues(merged, error.details ?? [])
        setErrors(merged)
        setBanner('Please review the highlighted fields.')
      } else {
        setBanner(
          error instanceof AirbnbApiError
            ? error.message
            : 'We could not reach our server. Check your connection and try again.'
        )
      }
    }
  }

  /* ------------------------------ Details ready ------------------------------ */
  if (result) {
    const url = result.recipient
      ? `https://wa.me/${result.recipient}?text=${encodeURIComponent(result.message)}`
      : null

    return (
      <div className="mx-auto max-w-3xl px-5 pb-28 pt-28 sm:px-8 lg:pt-32">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-6"
        >
          <div className="card-surface relative overflow-hidden rounded-panel p-8 text-center sm:p-10">
            <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-cyan/20 blur-3xl" />
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 18 }}
              className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-cyan to-purple text-white shadow-glow-cyan"
            >
              <CheckCircle2 size={30} />
            </motion.div>
            <p className="relative mt-6 text-xs font-semibold uppercase tracking-[0.32em] text-cyan-bright">
              Aura Homes — Via Airbnb
            </p>
            <h1 className="relative mt-3 font-display text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
              DETAILS <span className="text-gradient">READY</span>
            </h1>
            <p className="relative mx-auto mt-4 max-w-md text-sm leading-relaxed text-text-muted">
              Your Airbnb reservation details have been prepared for WhatsApp. Please
              make sure you have pressed <span className="font-semibold text-text-primary">Send</span> before leaving.
            </p>

            <div className="relative mt-7 flex flex-wrap items-center justify-center gap-3">
              {result.reservationNumber && (
                <span className="inline-flex items-center gap-2 rounded-full border border-surface-300/60 bg-surface-100/50 px-5 py-2.5 font-mono text-sm font-bold tracking-[0.1em] text-text-primary">
                  {result.reservationNumber}
                </span>
              )}
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan to-purple px-6 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-white shadow-glow-cyan transition-all duration-300 hover:-translate-y-0.5 hover:shadow-glow-purple"
                >
                  <Send size={14} /> Open WhatsApp
                </a>
              )}
            </div>

            {!url && (
              <p className="relative mt-5 text-xs text-text-muted">
                WhatsApp is not configured for this site yet. You can call or message us directly instead.
              </p>
            )}
          </div>

          <div className="card-surface rounded-panel p-6 sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-bright">
              About this flow
            </p>
            <p className="mt-3 text-sm leading-relaxed text-text-secondary">
              We did not create a new booking on our website — your reservation stays
              with Airbnb. Sending these details only helps our team prepare your
              stay. Aadhaar numbers are included only in the WhatsApp message you
              send — they are never shown on this page.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-purple via-magenta to-cyan bg-[length:200%_100%] bg-left px-7 py-3.5 text-sm font-semibold uppercase tracking-[0.14em] text-white shadow-glow-purple transition-all duration-300 hover:bg-right hover:shadow-glow-magenta"
            >
              <Home size={15} /> Return home
            </Link>
            <button
              type="button"
              onClick={() => {
                setResult(null)
                setSending(false)
                sendingRef.current = false
              }}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-surface-300/80 px-7 py-3.5 text-sm font-semibold uppercase tracking-[0.14em] text-text-primary backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan/45 hover:shadow-glow-cyan"
            >
              <ArrowLeft size={15} /> Edit details
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  /* ------------------------------ Details form ------------------------------ */
  return (
    <div className="mx-auto max-w-3xl px-5 pb-28 pt-28 sm:px-8 lg:pt-32">
      <Link
        to="/"
        className="mb-10 inline-flex items-center gap-2 text-sm text-text-muted transition-colors hover:text-text-primary"
      >
        <ArrowLeft size={15} />
        Back to home
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="mb-5 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.32em] text-cyan-bright">
          <span className="h-px w-8 bg-current opacity-50" />
          Booked via Airbnb?
        </p>
        <h1 className="font-display text-4xl font-bold tracking-tight text-text-primary sm:text-5xl">
          SEND YOUR <span className="text-gradient">AIRBNB</span> STAY DETAILS
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-text-secondary">
          Already have an Airbnb reservation? Send your stay details to our WhatsApp
          so our team can prepare your check-in. This does not create a new booking
          on this site.
        </p>
      </motion.div>

      <form
        id="airbnb-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          handleSend()
        }}
        className="mt-12 flex flex-col gap-7"
      >
        {/* Airbnb reservation */}
        <div className="card-surface flex flex-col rounded-panel p-6 sm:p-7">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan/30 to-purple/20 text-cyan-bright">
              <MessageCircle size={17} />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-text-primary">
                Airbnb reservation details
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">
                Use the details from your Airbnb confirmation.
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-5">
            <div>
              <label
                htmlFor="airbnb-reservation-number"
                className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-text-secondary"
              >
                <BadgeCheck size={13} className="text-cyan-bright" /> Reservation / confirmation number
                  <span className="font-normal normal-case tracking-normal text-text-muted">(optional)</span>
                </label>
              <input
                id="airbnb-reservation-number"
                type="text"
                autoComplete="off"
                placeholder="e.g. ABC123456"
                value={reservationNumber}
                onChange={(event) => {
                  setReservationNumber(normalizeReservationNumber(event.target.value))
                  if (errors.reservationNumber) setErrors((prev) => omitKey(prev, 'reservationNumber'))
                }}
                className={classForError(Boolean(errors.reservationNumber))}
              />
              <FieldError message={errors.reservationNumber} />
            </div>

            <div>
              <label
                htmlFor="airbnb-guest-name"
                className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-text-secondary"
              >
                <Users size={13} className="text-cyan-bright" /> Guest / reservation name
              </label>
              <input
                id="airbnb-guest-name"
                type="text"
                autoComplete="name"
                placeholder="Name on the reservation"
                value={guestName}
                onChange={(event) => {
                  setGuestName(event.target.value)
                  if (errors.guestName) setErrors((prev) => omitKey(prev, 'guestName'))
                }}
                className={classForError(Boolean(errors.guestName))}
              />
              <FieldError message={errors.guestName} />
            </div>

            <div>
              <label
                htmlFor="airbnb-primary-phone"
                className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-text-secondary"
              >
                <MessageCircle size={13} className="text-cyan-bright" /> Primary phone number
              </label>
              <input
                id="airbnb-primary-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+91 98123 45678"
                value={primaryPhone}
                onChange={(event) => {
                  setPrimaryPhone(event.target.value)
                  if (errors.primaryPhone) setErrors((prev) => omitKey(prev, 'primaryPhone'))
                }}
                className={classForError(Boolean(errors.primaryPhone))}
              />
              <FieldError message={errors.primaryPhone} />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="airbnb-check-in"
                  className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-text-secondary"
                >
                  <CalendarDays size={13} className="text-cyan-bright" /> Check-in date
                </label>
                <input
                  id="airbnb-check-in"
                  type="date"
                  value={checkIn}
                  onChange={(event) => {
                    setCheckIn(event.target.value)
                    if (errors.checkIn) setErrors((prev) => omitKey(prev, 'checkIn'))
                  }}
                  className={classForError(Boolean(errors.checkIn))}
                />
                <FieldError message={errors.checkIn} />
              </div>
              <div>
                <label
                  htmlFor="airbnb-check-out"
                  className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-text-secondary"
                >
                  <CalendarX2 size={13} className="text-cyan-bright" /> Check-out date
                </label>
                <input
                  id="airbnb-check-out"
                  type="date"
                  value={checkOut}
                  onChange={(event) => {
                    setCheckOut(event.target.value)
                    if (errors.checkOut) setErrors((prev) => omitKey(prev, 'checkOut'))
                  }}
                  className={classForError(Boolean(errors.checkOut))}
                />
                <FieldError message={errors.checkOut} />
              </div>
            </div>

            <div>
              <label
                htmlFor="airbnb-guest-count"
                className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-text-secondary"
              >
                <Users size={13} className="text-cyan-bright" /> Number of guests
              </label>
              <div className="relative">
                <select
                  id="airbnb-guest-count"
                  value={guestCount}
                  onChange={(event) => changeGuestCount(Number(event.target.value))}
                  className={cn(
                    inputBase,
                    'select-glass w-full cursor-pointer appearance-none pl-4 pr-10'
                  )}
                >
                  {Array.from({ length: MAX_AIRBNB_GUESTS }, (_, i) => i + 1).map((count) => (
                    <option key={count} value={count}>
                      {count} {count === 1 ? 'guest' : 'guests'}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-muted"
                />
              </div>
              <FieldError message={errors.guestCount} />
              <p className="mt-1.5 text-[11px] text-text-muted">
                Guest detail forms update automatically with your selection.
              </p>
            </div>
          </div>
        </div>

        {/* Guest details */}
        <div className="card-surface flex flex-col rounded-panel p-6 sm:p-7">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple/30 to-cyan/20 text-purple-bright">
                <ShieldCheck size={17} />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold text-text-primary">Guest details</h2>
                <p className="text-xs text-text-muted">
                  {guestCount} {guestCount === 1 ? 'guest' : 'guests'} for this reservation
                </p>
              </div>
            </div>
            <p className="flex items-center gap-1.5 text-[11px] text-text-muted">
              <Lock size={11} className="shrink-0 text-text-muted" />
              Details stay private
            </p>
          </div>

          <div className="flex flex-col gap-5">
            {rows.map((row, index) => (
              <fieldset
                key={index}
                className="rounded-2xl border border-surface-300/50 bg-surface-100/40 p-4 sm:p-5"
                disabled={sending}
              >
                <legend className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Guest {index + 1}
                </legend>

                <div className="mt-3 flex flex-col gap-4">
                  <div>
                    <label
                      htmlFor={`airbnb-guest-${index}-full-name`}
                      className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-text-secondary"
                    >
                      Full name
                    </label>
                    <input
                      id={`airbnb-guest-${index}-full-name`}
                      type="text"
                      autoComplete="name"
                      placeholder="Guest name as per government ID"
                      value={row.fullName}
                      onChange={(event) => updateRow(index, { fullName: event.target.value })}
                      className={classForError(Boolean(errors[`g${index}.fullName`]))}
                    />
                    <FieldError message={errors[`g${index}.fullName`]} />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor={`airbnb-guest-${index}-gender`}
                        className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-text-secondary"
                      >
                        Gender
                      </label>
                      <div className="relative">
                        <select
                          id={`airbnb-guest-${index}-gender`}
                          value={row.gender}
                          onChange={(event) =>
                            updateRow(index, { gender: event.target.value as GuestGenderValue | '' })
                          }
                          className={cn(
                            'input-glass select-glass w-full cursor-pointer appearance-none py-3.5 pl-4 pr-10 text-sm',
                            Boolean(errors[`g${index}.gender`]) &&
                              'border-magenta/70 focus-visible:border-magenta focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-magenta)_18%,transparent)]',
                            !row.gender && 'text-text-muted/50'
                          )}
                        >
                          <option value="" disabled>
                            Choose
                          </option>
                          {GENDER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={16}
                          aria-hidden="true"
                          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-muted"
                        />
                      </div>
                      <FieldError message={errors[`g${index}.gender`]} />
                    </div>

                    <div>
                      <label
                        htmlFor={`airbnb-guest-${index}-age`}
                        className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-text-secondary"
                      >
                        Age
                      </label>
                      <input
                        id={`airbnb-guest-${index}-age`}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="e.g. 28"
                        value={row.age}
                        onChange={(event) =>
                          updateRow(index, { age: event.target.value.replace(/\D/g, '').slice(0, 3) })
                        }
                        className={classForError(Boolean(errors[`g${index}.age`]))}
                      />
                      <FieldError message={errors[`g${index}.age`]} />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor={`airbnb-guest-${index}-aadhaar`}
                      className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-text-secondary"
                    >
                      <Fingerprint size={13} className="text-magenta-bright" /> Aadhaar number
                    </label>
                    <input
                      id={`airbnb-guest-${index}-aadhaar`}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="12-digit Aadhaar number"
                      value={row.aadhaar}
                      onChange={(event) =>
                        updateRow(index, { aadhaar: event.target.value.replace(/\D/g, '').slice(0, 12) })
                      }
                      className={classForError(Boolean(errors[`g${index}.aadhaar`]))}
                    />
                    <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-text-muted">
                      <Lock size={11} className="shrink-0 text-text-muted" />
                      Included in the WhatsApp message you send and never shown on this page.
                    </p>
                    <FieldError message={errors[`g${index}.aadhaar`]} />
                  </div>
                </div>
              </fieldset>
            ))}
          </div>
        </div>

        {banner && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-2xl border border-magenta/50 bg-magenta/10 p-5"
          >
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-magenta-bright" />
            <p className="text-sm leading-relaxed text-text-secondary">{banner}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={sending}
          className="group inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-cyan via-purple to-cyan bg-[length:200%_100%] bg-left py-4 text-sm font-semibold uppercase tracking-[0.14em] text-white shadow-glow-cyan transition-all duration-300 hover:bg-right hover:shadow-glow-purple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-bright focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-glow-cyan"
        >
          {sending ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Preparing your details…
            </>
          ) : (
            <>
              <Send size={16} />
              Send details via WhatsApp
            </>
          )}
        </button>

        <p className="text-center text-xs leading-relaxed text-text-muted">
          This opens WhatsApp with your stay details pre-filled and you press Send
          yourself. Your reservation stays with Airbnb — we never create a second
          booking on this site.
        </p>
      </form>
    </div>
  )
}