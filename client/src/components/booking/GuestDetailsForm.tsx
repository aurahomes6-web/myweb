import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  BadgeCheck,
  ChevronDown,
  Fingerprint,
  Loader2,
  Lock,
  Phone,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import type {
  BookingFormData,
  BookingResponse,
  GuestGenderValue,
  Property,
} from '@/types'
import { BookingApiError, createBooking } from '@/services/bookings'
import { GENDER_OPTIONS } from '@/lib/gender'
import { buildWhatsAppUrl } from '@/lib/whatsapp'

interface GuestDetailsFormProps {
  property: Property
  checkIn: string
  checkOut: string
  guestCount: number
  /** Validated coupon code to attach to the booking. Sent verbatim; the server applies it. */
  couponCode?: string
  onSuccess: (booking: BookingResponse, whatsAppOpened?: boolean) => void
}

interface GuestRow {
  fullName: string
  aadhaar: string
  gender: '' | GuestGenderValue
  age: string
}

interface SubmitBanner {
  kind: 'unavailable' | 'notfound' | 'validation' | 'server' | 'network'
  message: string
}

const INITIAL_ROW: GuestRow = { fullName: '', aadhaar: '', gender: '', age: '' }

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

function isIndianPhone(value: string): boolean {
  const compact = value.replace(/[\s-]/g, '')
  if (/^\+?91\d{10}$/.test(compact)) return /^[6-9]\d{9}$/.test(compact.slice(-10))
  return /^[6-9]\d{9}$/.test(compact)
}

export default function GuestDetailsForm({
  property,
  checkIn,
  checkOut,
  guestCount,
  couponCode,
  onSuccess,
}: GuestDetailsFormProps) {
  const [primaryPhone, setPrimaryPhone] = useState('')
  const [rows, setRows] = useState<GuestRow[]>(() =>
    Array.from({ length: guestCount }, () => ({ ...INITIAL_ROW }))
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [banner, setBanner] = useState<SubmitBanner | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Synchronous lock: guards against a second submit before React re-renders
  // with the disabled state, so rapid double-clicks can never create a
  // duplicate booking.
  const submittingRef = useRef(false)

  function updateRow(index: number, patch: Partial<GuestRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
    if (errors[`g${index}.fullName`]) setErrors((prev) => omitKey(prev, `g${index}.fullName`))
    if (errors[`g${index}.aadhaar`]) setErrors((prev) => omitKey(prev, `g${index}.aadhaar`))
    if (errors[`g${index}.gender`]) setErrors((prev) => omitKey(prev, `g${index}.gender`))
    if (errors[`g${index}.age`]) setErrors((prev) => omitKey(prev, `g${index}.age`))
  }

  function omitKey(prev: Record<string, string>, key: string): Record<string, string> {
    const next = { ...prev }
    delete next[key]
    return next
  }

  function validate(): Record<string, string> {
    const next: Record<string, string> = {}

    if (!primaryPhone.trim()) {
      next.primaryPhone = 'A primary contact phone is required.'
    } else if (!isIndianPhone(primaryPhone)) {
      next.primaryPhone = 'Enter a valid 10-digit Indian mobile number.'
    }

    rows.forEach((row, index) => {
      const key = `g${index}`
      const name = row.fullName.trim()
      if (!name) {
        next[`${key}.fullName`] = 'Full name is required.'
      } else if (name.length > 120) {
        next[`${key}.fullName`] = 'Full name is too long.'
      }

      const aadhaar = normalizeDigits(row.aadhaar)
      if (!aadhaar) {
        next[`${key}.aadhaar`] = 'Aadhaar number is required.'
      } else if (!/^\d{12}$/.test(aadhaar)) {
        next[`${key}.aadhaar`] = 'Aadhaar must be exactly 12 digits.'
      }

      if (!row.gender) {
        next[`${key}.gender`] = 'Please choose a gender.'
      }

      if (!row.age) {
        next[`${key}.age`] = 'Age is required.'
      } else {
        const age = Number(row.age)
        if (!Number.isInteger(age) || age < 1 || age > 120) {
          next[`${key}.age`] = 'Age must be a whole number between 1 and 120.'
        }
      }
    })

    const aadhaarOwners = new Map<string, number>()
    const validAadhaar = new Set<string>()
    rows.forEach((row) => {
      const aadhaar = normalizeDigits(row.aadhaar)
      if (/^\d{12}$/.test(aadhaar)) validAadhaar.add(aadhaar)
    })

    rows.forEach((row, index) => {
      const key = `g${index}`
      const aadhaar = normalizeDigits(row.aadhaar)
      if (!validAadhaar.has(aadhaar)) return
      const owner = aadhaarOwners.get(aadhaar)
      if (owner !== undefined) {
        next[`${key}.aadhaar`] = `Each guest must have a unique Aadhaar number. Guest ${owner + 1} already uses it.`
      } else {
        aadhaarOwners.set(aadhaar, index)
      }
    })

    const seenIdentical = new Map<string, number>()
    rows.forEach((row, index) => {
      const key = `g${index}`
      const aadhaar = normalizeDigits(row.aadhaar)
      if (!/^\d{12}$/.test(aadhaar)) return
      const identity = [
        row.fullName.trim().toLowerCase(),
        aadhaar,
        row.gender,
        row.age,
      ].join('|')
      const owner = seenIdentical.get(identity)
      if (owner !== undefined && !next[`${key}.fullName`]) {
        next[`${key}.fullName`] = `This guest is identical to Guest ${owner + 1}. Enter each guest only once.`
      } else {
        seenIdentical.set(identity, index)
      }
    })

    return next
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting || submittingRef.current) return
    submittingRef.current = true

    const nextErrors = validate()
    setErrors(nextErrors)
    setBanner(null)

    if (Object.keys(nextErrors).length > 0) {
      // Release the synchronous lock: a failed validation must not freeze the
      // submit button for every later attempt.
      submittingRef.current = false
      document.getElementById('guest-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    const payload: BookingFormData = {
      propertyId: property.slug,
      checkIn,
      checkOut,
      guestCount,
      primaryPhone: normalizeDigits(primaryPhone),
      guests: rows.map((row) => ({
        fullName: row.fullName.trim(),
        aadhaarNumber: normalizeDigits(row.aadhaar),
        gender: row.gender as GuestGenderValue,
        age: Number(row.age),
      })),
      couponCode: couponCode && couponCode.trim() ? couponCode.trim() : undefined,
    }

    // Browser-safe WhatsApp: reserve the target tab synchronously while the
    // submit click is still in the user activation (window.open after an
    // await/navigation is silently blocked), then point it at the wa.me link
    // once the booking exists. Closed again if the request fails or WhatsApp
    // is not configured. The prefilled message (`booking.whatsAppMessage`)
    // carries each guest's full Aadhaar for this documentary send — it never
    // touches the booking ID, path, query params, storage or logs.
    let whatsAppPopup: Window | null = null
    try {
      whatsAppPopup = window.open('', '_blank')
    } catch {
      whatsAppPopup = null
    }

    setSubmitting(true)
    try {
      const booking = await createBooking(payload)
      let whatsAppOpened = false
      const waUrl = buildWhatsAppUrl(booking)
      if (whatsAppPopup && !whatsAppPopup.closed) {
        if (waUrl) {
          whatsAppPopup.location.href = waUrl
          whatsAppOpened = true
        } else {
          whatsAppPopup.close()
        }
      }
      onSuccess(booking, whatsAppOpened)
    } catch (error) {
      if (whatsAppPopup && !whatsAppPopup.closed) whatsAppPopup.close()
      setSubmitting(false)
      submittingRef.current = false
      if (error instanceof BookingApiError) {
        if (error.code === 'PROPERTY_UNAVAILABLE') {
          setBanner({ kind: 'unavailable', message: error.message })
        } else if (error.code === 'PROPERTY_NOT_FOUND') {
          setBanner({ kind: 'notfound', message: error.message })
        } else if (error.code === 'VALIDATION_ERROR') {
          setBanner({ kind: 'validation', message: error.message })
          const merged = { ...nextErrors }
          for (const detail of error.details ?? []) {
            const m = detail.field.match(/^guests\[(\d+)\]\.(.+)$/)
            if (m) merged[`g${m[1]}.${m[2]}`] = detail.message
            else merged[detail.field] = detail.message
          }
          setErrors(merged)
        } else {
          setBanner({ kind: 'server', message: error.message })
        }
      } else {
        setBanner({
          kind: 'network',
          message: 'We could not reach our server. Check your connection and try again.',
        })
      }
    }
  }

  const bannerCopy: Record<SubmitBanner['kind'], string> = {
    unavailable: 'Choose different dates',
    notfound: 'Go back',
    validation: 'Fix the highlighted fields',
    server: 'Try again',
    network: 'Try again',
  }

  return (
    <section id="guest-details" aria-labelledby="guest-details-heading">
      <h2 id="guest-details-heading" className="sr-only">
        Guest registration
      </h2>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-7">
        <div className="card-surface flex flex-col rounded-panel p-6 sm:p-7">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple/30 to-cyan/20 text-cyan-bright">
              <ShieldCheck size={17} />
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold text-text-primary">
                Primary contact
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">
                Used for booking confirmations. The lead guests in your stay is{' '}
                <span className="font-semibold text-text-secondary">{rows[0]?.fullName.trim() || 'Guest 1'}</span>.
              </p>
            </div>
          </div>

          <div className="mt-5">
            <label
              htmlFor="primary-phone"
              className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-text-secondary"
            >
              <Phone size={13} className="text-cyan-bright" /> Primary phone
            </label>
            <input
              id="primary-phone"
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
        </div>

        <div className="card-surface flex flex-col rounded-panel p-6 sm:p-7">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple/30 to-cyan/20 text-purple-bright">
                <Users size={17} />
              </div>
              <div>
                <h3 className="font-display text-lg font-semibold text-text-primary">
                  Guests staying
                </h3>
                <p className="text-xs text-text-muted">{guestCount} {guestCount === 1 ? 'guest' : 'guests'}</p>
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
                disabled={submitting}
              >
                <legend className="px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Guest {index + 1}
                  {index === 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-cyan/15 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-cyan-bright">
                      <BadgeCheck size={11} /> Primary
                    </span>
                  )}
                </legend>

                <div className="mt-3 flex flex-col gap-4">
                  <div>
                    <label
                      htmlFor={`guest-${index}-full-name`}
                      className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-text-secondary"
                    >
                      Full name
                    </label>
                    <input
                      id={`guest-${index}-full-name`}
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
                        htmlFor={`guest-${index}-gender`}
                        className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-text-secondary"
                      >
                        Gender
                      </label>
                      <div className="relative">
                      <select
                        id={`guest-${index}-gender`}
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
                        htmlFor={`guest-${index}-age`}
                        className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-text-secondary"
                      >
                        Age
                      </label>
                      <input
                        id={`guest-${index}-age`}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="e.g. 34"
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
                      htmlFor={`guest-${index}-aadhaar`}
                      className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-text-secondary"
                    >
                      <Fingerprint size={13} className="text-magenta-bright" /> Aadhaar number
                    </label>
                    <input
                      id={`guest-${index}-aadhaar`}
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
                      Sent securely at confirmation. Never stored in your browser or shown on the public site.
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
            className={cn(
              'flex flex-col gap-3 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between',
              banner.kind === 'unavailable'
                ? 'border-magenta/50 bg-magenta/10'
                : 'border-surface-300/50 bg-surface-100/50'
            )}
          >
            <div className="flex items-start gap-3">
              <AlertCircle
                size={18}
                className={cn(
                  'mt-0.5 shrink-0',
                  banner.kind === 'unavailable' ? 'text-magenta-bright' : 'text-text-muted'
                )}
              />
              <p className="text-sm leading-relaxed text-text-secondary">{banner.message}</p>
            </div>
            {banner.kind === 'unavailable' ? (
              <Link
                to={`/properties/${property.slug}#availability`}
                className="shrink-0 rounded-full border border-magenta/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-magenta-bright transition-colors hover:bg-magenta/10"
              >
                {bannerCopy[banner.kind]}
              </Link>
            ) : (
              <span className="sr-only">{bannerCopy[banner.kind]}</span>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="group inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-purple via-magenta to-cyan bg-[length:200%_100%] bg-left py-4 text-sm font-semibold uppercase tracking-[0.14em] text-ink shadow-glow-purple transition-all duration-300 hover:bg-right hover:shadow-glow-magenta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-bright focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-glow-purple"
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Confirming your stay…
            </>
          ) : (
            <>
              <BadgeCheck size={16} />
              Confirm booking
            </>
          )}
        </button>

        <p className="text-center text-xs leading-relaxed text-text-muted">
          By confirming, you agree to stay-at-home validation of guest identity at
          check-in. The lead guest receives the official confirmation by WhatsApp.
        </p>
      </form>
    </section>
  )
}