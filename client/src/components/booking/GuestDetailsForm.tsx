import { useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  ChevronDown,
  Fingerprint,
  Lock,
  Phone,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import type { BookingFormData, GuestGenderValue } from '@/types'
import { GENDER_OPTIONS } from '@/lib/gender'

interface GuestDetailsFormProps {
  /** Property slug sent as `propertyId` in the booking payload. */
  propertyId: string
  /** Hides the step while keeping its state alive for the booking wizard. */
  hidden?: boolean
  checkIn: string
  checkOut: string
  guestCount: number
  /** Validated coupon code to attach to the booking. Sent verbatim; the server applies it. */
  couponCode?: string
  /** Hands a fully-validated payload up to the booking wizard (payment step). */
  onProceed: (payload: BookingFormData) => void
}

interface GuestRow {
  fullName: string
  aadhaar: string
  gender: '' | GuestGenderValue
  age: string
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
  propertyId,
  hidden = false,
  checkIn,
  checkOut,
  guestCount,
  couponCode,
  onProceed,
}: GuestDetailsFormProps) {
  const [primaryPhone, setPrimaryPhone] = useState('')
  const [rows, setRows] = useState<GuestRow[]>(() =>
    Array.from({ length: guestCount }, () => ({ ...INITIAL_ROW }))
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextErrors = validate()
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      document.getElementById('guest-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    const payload: BookingFormData = {
      propertyId,
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

    onProceed(payload)
  }

  return (
    <section id="guest-details" aria-labelledby="guest-details-heading" hidden={hidden}>
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

        <button
          type="submit"
          className="group inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-purple via-magenta to-cyan bg-[length:200%_100%] bg-left py-4 text-sm font-semibold uppercase tracking-[0.14em] text-ink shadow-glow-purple transition-all duration-300 hover:bg-right hover:shadow-glow-magenta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-bright focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Continue to payment
          <ArrowRight
            size={16}
            className="transition-transform duration-300 group-hover:translate-x-1"
          />
        </button>

        <p className="text-center text-xs leading-relaxed text-text-muted">
          Next you will pay by UPI and share your transaction reference (UTR) to
          lock in your stay. Guest identity is verified at check-in, and the lead
          guest receives the official confirmation by WhatsApp.
        </p>
      </form>
    </section>
  )
}