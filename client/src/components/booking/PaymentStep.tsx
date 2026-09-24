import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  Copy,
  CreditCard,
  Download,
  Loader2,
  Lock,
  Phone,
  QrCode,
  ShieldCheck,
  UserRound,
  Wallet,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatINR } from '@/lib/money'
import { buildWhatsAppUrl } from '@/lib/whatsapp'
import { BookingApiError, createBooking } from '@/services/bookings'
import {
  copyUpiId,
  downloadUpiQr,
  isValidUtr,
  normalizeUtr,
  UPI_ACCOUNT,
  UPI_ID,
  UPI_PHONE,
  UPI_QR_PATH,
} from '@/lib/upi'
import type { AppliedCoupon, BookingFormData, BookingResponse } from '@/types'

interface PaymentStepProps {
  basePayload: BookingFormData
  originalTotal: number
  finalTotal: number
  coupon: AppliedCoupon | null
  onBack: () => void
  onSuccess: (booking: BookingResponse, whatsAppOpened?: boolean) => void
}

interface SubmitBanner {
  kind: 'unavailable' | 'notfound' | 'validation' | 'server' | 'network'
  message: string
}

const bannerCopy: Record<SubmitBanner['kind'], string> = {
  unavailable: 'Choose different dates',
  notfound: 'Go back',
  validation: 'Fix the highlighted fields',
  server: 'Try again',
  network: 'Try again',
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

/**
 * Direct-UPI payment step of the normal booking flow.
 *
 * The guest pays the exact stay total to the AURA HOMES UPI ID below, then
 * submits the 12–22 character UTR from their payment app. The booking is created
 * server-side with `paymentStatus = PENDING`; Aura Homes verifies the transfer
 * on the admin side and accepts it (or rejects it and releases the dates).
 *
 * The created booking's `whatsAppMessage` (full Aadhaar pre-fill) is placed into
 * the WhatsApp click-to-chat link exactly as before — the target tab is reserved
 * synchronously inside the submit click's user activation.
 */
export default function PaymentStep({
  basePayload,
  originalTotal,
  finalTotal,
  coupon,
  onBack,
  onSuccess,
}: PaymentStepProps) {
  const [utr, setUtr] = useState('')
  const [utrError, setUtrError] = useState<string | null>(null)
  const [banner, setBanner] = useState<SubmitBanner | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  // Synchronous lock: guards against a second submit before React re-renders
  // with the disabled state, so rapid double-clicks can never create a
  // duplicate booking.
  const submittingRef = useRef(false)

  const hasDiscount = coupon && coupon.discountPaise > 0

  async function handleCopy() {
    const ok = await copyUpiId()
    if (!ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2200)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting || submittingRef.current) return

    const normalized = normalizeUtr(utr)
    if (!isValidUtr(normalized)) {
      setUtrError('Enter the 12–22 character UTR (transaction reference) from your UPI payment.')
      document.getElementById('payment')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    submittingRef.current = true
    setBanner(null)
    setUtrError(null)

    // Browser-safe WhatsApp: reserve the target tab synchronously while the
    // submit click is still in the user activation, then point it at the wa.me
    // link once the booking exists. Closed again if the request fails or
    // WhatsApp is not configured.
    let whatsAppPopup: Window | null = null
    try {
      whatsAppPopup = window.open('', '_blank')
    } catch {
      whatsAppPopup = null
    }

    setSubmitting(true)
    try {
      const booking = await createBooking({ ...basePayload, utr: normalized })
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
        let utrDetail: string | undefined
        for (const detail of error.details ?? []) {
          if (detail.field === 'utr') utrDetail = detail.message
        }
        if (utrDetail) setUtrError(utrDetail)
        if (error.code === 'PROPERTY_UNAVAILABLE') {
          setBanner({ kind: 'unavailable', message: error.message })
        } else if (error.code === 'PROPERTY_NOT_FOUND') {
          setBanner({ kind: 'notfound', message: error.message })
        } else if (error.code === 'VALIDATION_ERROR' && !utrDetail) {
          setBanner({ kind: 'validation', message: error.message })
        } else if (error.code !== 'VALIDATION_ERROR') {
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

  return (
    <section id="payment" aria-labelledby="payment-heading">
      <h2 id="payment-heading" className="sr-only">
        Direct UPI payment
      </h2>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        {/* Amount due */}
        <div className="card-surface flex flex-col rounded-panel p-6 sm:p-7">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple/30 to-cyan/20 text-cyan-bright">
              <Wallet size={17} />
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold text-text-primary">Amount to pay</h3>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">
                Transfer exactly this amount to Aura Homes using any UPI app, then
                submit the transaction reference below.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-surface-300/50 bg-surface-100/40 p-5 text-center">
            <p className="font-display text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
              {formatINR(finalTotal)}
            </p>
            {hasDiscount && (
              <div className="mt-2 flex items-center justify-center gap-2 text-sm">
                <span className="text-text-muted line-through">{formatINR(originalTotal)}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-cyan/15 px-2.5 py-0.5 text-xs font-semibold text-cyan-bright">
                  − {formatINR(coupon.discountPaise)}
                </span>
              </div>
            )}
            <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-text-muted">
              Stay · UPI transfer · no booking fee
            </p>
          </div>
        </div>

        {/* QR + pay-by */}
        <div className="card-surface flex flex-col rounded-panel p-6 sm:p-7">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple/30 to-magenta/20 text-purple-bright">
              <QrCode size={17} />
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold text-text-primary">Pay via UPI</h3>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">
                Scan this QR from any UPI app (GPay, PhonePe, Paytm, BHIM) and pay the
                amount shown above.
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:justify-center">
            <div className="shrink-0 rounded-2xl border border-surface-300/60 bg-white p-4">
              <img
                src={UPI_QR_PATH}
                alt="Aura Homes UPI QR code"
                width={220}
                height={220}
                className="h-56 w-56 rounded-xl object-contain"
              />
            </div>

            <div className="flex w-full max-w-sm flex-col gap-3">
              <dl className="flex flex-col divide-y divide-surface-300/40">
                <div className="flex items-center justify-between gap-3 py-3">
                  <dt className="flex items-center gap-2 text-sm text-text-muted">
                    <UserRound size={14} className="text-cyan-bright" /> Payable to
                  </dt>
                  <dd className="text-sm font-semibold text-text-primary">{UPI_ACCOUNT}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-3">
                  <dt className="flex items-center gap-2 text-sm text-text-muted">
                    <Phone size={14} className="text-cyan-bright" /> Phone
                  </dt>
                  <dd className="font-mono text-sm font-semibold text-text-primary">{UPI_PHONE}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-3">
                  <dt className="flex items-center gap-2 text-sm text-text-muted">
                    <CreditCard size={14} className="text-cyan-bright" /> UPI ID
                  </dt>
                  <dd className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-text-primary">{UPI_ID}</span>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1.5 rounded-full border border-surface-300/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary transition-colors hover:border-cyan/45 hover:text-cyan-bright"
                    >
                      {copied ? <Check size={11} className="text-cyan-bright" /> : <Copy size={11} />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </dd>
                </div>
              </dl>

              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => void downloadUpiQr()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-surface-300/80 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-text-primary transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan/45 hover:shadow-glow-cyan"
                >
                  <Download size={14} className="text-cyan-bright" />
                  Save QR image
                </button>
                <p className="text-center text-[11px] text-text-muted">
                  Tip: save the QR to pay from another device, or copy the UPI ID above.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* UTR */}
        <div className="card-surface flex flex-col rounded-panel p-6 sm:p-7">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan/30 to-purple/20 text-magenta-bright">
              <BadgeCheck size={17} />
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold text-text-primary">
                Share your UTR
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">
                After paying, copy the 12–22 character transaction reference (UTR) from
                your UPI app and paste it here. Aura Homes verifies the transfer and
                confirms your booking.
              </p>
            </div>
          </div>

          <label
            htmlFor="utr"
            className="mb-2 mt-5 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-text-secondary"
          >
            <ShieldCheck size={13} className="text-cyan-bright" /> UTR number
          </label>
          <input
            id="utr"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. 408216918253"
            value={utr}
            onChange={(event) => {
              setUtr(event.target.value)
              if (utrError) setUtrError(null)
              if (banner) setBanner(null)
            }}
            className={cn(
              'input-glass w-full px-4 py-3.5 font-mono text-sm text-text-primary placeholder:text-text-muted/50',
              utrError && 'border-magenta/70 focus-visible:border-magenta focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-magenta)_18%,transparent)]'
            )}
          />
          <FieldError message={utrError ?? undefined} />
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-text-muted">
            <Lock size={11} className="mt-0.5 shrink-0" />
            The UTR is sent securely to Aura Homes for verification and is never
            shown publicly.
          </p>
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
                to={`/properties/${basePayload.propertyId}#availability`}
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
              Submitting payment…
            </>
          ) : (
            <>
              Submit payment
              <ArrowRight
                size={16}
                className="transition-transform duration-300 group-hover:translate-x-1"
              />
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 text-sm text-text-muted transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ArrowLeft size={14} />
          Back to guest details
        </button>
      </form>
    </section>
  )
}