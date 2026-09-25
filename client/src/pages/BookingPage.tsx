import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarX2,
  Users,
  BedDouble,
  Bath,
  Lock,
  Loader2,
  Ticket,
} from 'lucide-react'
import { useProperties, usePropertyBySlug } from '@/services/properties'
import { accentPalettes } from '@/config/accents'
import PropertyVisual from '@/components/visuals/PropertyVisual'
import GuestDetailsForm from '@/components/booking/GuestDetailsForm'
import PaymentStep from '@/components/booking/PaymentStep'
import { CouponBox } from '@/components/booking/CouponBox'
import NotFoundContent from '@/components/ui/NotFoundContent'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { cn } from '@/lib/cn'
import { formatINR, resolveNightlyPricing } from '@/lib/money'
import { formatShortDate, isValidRange, nightsBetween, today } from '@/lib/date'
import type { AppliedCoupon, BookingFormData, BookingResponse, Property, PropertySlug } from '@/types'

function PropertyPicker() {
  const reduced = useReducedMotion()
  const { items } = useProperties()

  return (
    <div className="mx-auto max-w-3xl px-5 pb-28 pt-32 sm:px-8 lg:pt-36">
      <motion.div
        initial={reduced ? undefined : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <Link
          to="/"
          className="mb-12 inline-flex items-center gap-2 text-sm text-text-muted transition-colors hover:text-text-primary"
        >
          <ArrowLeft size={15} />
          Back to home
        </Link>

        <p className="mb-5 text-xs font-medium uppercase tracking-[0.32em] text-purple-bright flex items-center gap-3">
          <span className="h-px w-8 bg-current opacity-50" />
          Begin Booking
        </p>
        <h1 className="font-display text-4xl font-bold tracking-tight text-text-primary sm:text-5xl">
          CHOOSE YOUR <span className="text-gradient">HOME</span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-text-secondary">
          Your booking hasn't been linked to a home yet. Pick one below to start.
        </p>

        <div className="mt-12 flex flex-col gap-5">
          {items.map((property) => {
            const palette = accentPalettes[property.accent]
            return (
              <Link
                key={property.id}
                to={`/book?property=${property.slug}`}
                className="group card-surface flex items-center gap-5 overflow-hidden rounded-card p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover sm:gap-6"
              >
                <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-xl sm:h-24 sm:w-32">
                  <PropertyVisual
                    image={property.image}
                    accent={property.accent}
                    variant={property.visual}
                    label={`${property.name} artwork`}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: palette.bright }}>
                    {property.shortLabel}
                  </p>
                  <h2 className="mt-1 truncate font-display text-lg font-semibold text-text-primary sm:text-xl">
                    {property.name}
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-muted">
                    <span className="inline-flex items-center gap-1.5"><Users size={13} style={{ color: palette.main }} />{property.capacity} guests</span>
                    <span className="inline-flex items-center gap-1.5"><BedDouble size={13} style={{ color: palette.main }} />{property.bedrooms} bed</span>
                    <span className="inline-flex items-center gap-1.5"><Bath size={13} style={{ color: palette.main }} />{property.bathrooms} bath</span>
                  </div>
                </div>
                <ArrowRight
                  size={18}
                  className="shrink-0 text-text-muted transition-all duration-300 group-hover:translate-x-1 group-hover:text-cyan-bright"
                />
              </Link>
            )
          })}
        </div>
      </motion.div>
    </div>
  )
}

/**
 * Two-step booking wizard for one property + one validated date range.
 *
 * Step 1 collects guest identity (GuestDetailsForm); step 2 collects the UPI
 * transfer (PaymentStep). Both steps share the coupon and totals. The parent
 * keys this component by the property/dates so any change resets it from
 * scratch — no derived-state effect needed.
 */
function BookingWizard({
  property,
  checkIn,
  checkOut,
  guests,
}: {
  property: Property
  checkIn: string
  checkOut: string
  guests: number
}) {
  const navigate = useNavigate()
  const reduced = useReducedMotion()

  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null)
  const [step, setStep] = useState<'details' | 'payment'>('details')
  const [basePayload, setBasePayload] = useState<BookingFormData | null>(null)

  const palette = accentPalettes[property.accent]
  const rangeValid = isValidRange(checkIn, checkOut, today())
  const nights = rangeValid ? nightsBetween(checkIn, checkOut) : 0
  const pricing = resolveNightlyPricing(
    property.pricePerNightPaise,
    property.discountedPricePerNightPaise
  )

  const subtotal = nights * pricing.effectivePricePaise
  const totalDue = Math.max(0, subtotal - (coupon?.discountPaise ?? 0))

  return (
    <div className={cn('grid gap-12', rangeValid ? 'lg:grid-cols-[minmax(0,1fr)_400px]' : '')}>
      <div className="flex flex-col gap-12">
        {/* Range notice */}
        {!rangeValid && (
          <motion.div
            initial={reduced ? undefined : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-start gap-4 rounded-2xl border border-surface-300/40 bg-surface-100/50 p-6 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <CalendarX2 size={20} className="mt-0.5 shrink-0 text-magenta-bright" />
              <div>
                <p className="text-sm font-semibold text-text-primary">Pick your dates first</p>
                <p className="mt-1 text-sm text-text-muted">
                  A valid check-in and check-out range is needed to reserve this home.
                </p>
              </div>
            </div>
            <Link
              to={`/properties/${property.slug}#availability`}
              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-surface-300/70 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-text-primary transition-colors hover:border-purple/45 hover:shadow-glow-purple"
            >
              Check availability
              <ArrowRight size={14} />
            </Link>
          </motion.div>
        )}

        {rangeValid && (
          <>
            <GuestDetailsForm
              hidden={step !== 'details'}
              propertyId={property.slug}
              checkIn={checkIn}
              checkOut={checkOut}
              guestCount={guests}
              couponCode={coupon?.code}
              onProceed={(payload: BookingFormData) => {
                setBasePayload(payload)
                setStep('payment')
              }}
            />

            {step === 'payment' && basePayload && (
              <PaymentStep
                basePayload={basePayload}
                originalTotal={subtotal}
                finalTotal={totalDue}
                coupon={coupon}
                onBack={() => setStep('details')}
                onSuccess={(booking: BookingResponse, whatsAppOpened?: boolean) => {
                  navigate('/confirmation', {
                    state: { booking, autoWhatsApp: true, whatsAppOpened: whatsAppOpened === true },
                  })
                }}
              />
            )}
          </>
        )}
      </div>

      {/* Booking summary */}
      <aside className={cn(rangeValid && 'lg:sticky lg:top-28 lg:self-start')}>
        <div className="card-surface flex flex-col rounded-panel p-6 sm:p-7">
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-xl">
              <PropertyVisual
                image={property.image}
                accent={property.accent}
                variant={property.visual}
                label=""
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: palette.bright }}>
                Your stay
              </p>
              <h1 className="truncate font-display text-lg font-semibold text-text-primary">
                {property.name}
              </h1>
              <p className="text-xs text-text-muted">{property.shortLabel}</p>
            </div>
          </div>

          <div className="my-6 h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${palette.main}55, transparent)` }} />

          {rangeValid ? (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-surface-300/50 bg-surface-100/40 p-4">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
                    <CalendarDays size={12} className="text-cyan-bright" /> Check-in
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-text-primary">{formatShortDate(checkIn)}</p>
                </div>
                <div className="rounded-2xl border border-surface-300/50 bg-surface-100/40 p-4">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
                    <CalendarX2 size={12} className="text-magenta-bright" /> Check-out
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-text-primary">{formatShortDate(checkOut)}</p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-surface-300/50 bg-surface-100/40 px-4 py-3.5">
                <span className="text-sm text-text-secondary">Guests</span>
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <Users size={14} className="text-cyan-bright" />
                  {guests} {guests === 1 ? 'guest' : 'guests'}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted">Duration</span>
                <span className="font-semibold text-text-primary">
                  {nights} night{nights === 1 ? '' : 's'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-text-muted">Nightly rate</span>
                <div className="text-right">
                  <span className="font-semibold text-text-primary">{formatINR(pricing.effectivePricePaise)}</span>
                  {pricing.hasDiscount && (
                    <div className="mt-0.5 flex items-center justify-end gap-2">
                      <span className="text-[11px] text-text-muted line-through">
                        {formatINR(property.pricePerNightPaise)}
                      </span>
                      <span className="rounded-full bg-cyan/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-cyan-bright">
                        {pricing.discountPercent && pricing.discountPercent > 0
                          ? `${pricing.discountPercent}% off`
                          : 'Offer price'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted">Stay total</span>
                <span className="font-semibold text-text-primary">{formatINR(subtotal)}</span>
              </div>

              {coupon && (
                <div className="flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-1.5 text-text-muted">
                    <Ticket size={13} className="text-cyan-bright" /> Coupon {coupon.code}
                  </span>
                  <span className="font-semibold text-cyan-bright">− {formatINR(coupon.discountPaise)}</span>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-surface-300/30 pt-3">
                <span className="text-sm font-semibold text-text-secondary">Total due</span>
                <span className="font-display text-xl font-bold tracking-tight text-text-primary">
                  {formatINR(totalDue)}
                </span>
              </div>

              {/* Coupon entry — the parent keys this wizard, so it resets whenever the stay changes */}
              <CouponBox
                propertyId={property.id}
                checkIn={checkIn}
                checkOut={checkOut}
                onCouponChange={setCoupon}
              />
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-2xl border border-surface-300/40 bg-surface-100/40 p-4 text-sm text-text-muted">
              <Lock size={16} className="mt-0.5 shrink-0 text-text-muted" />
              <p>Select your dates on the property page to build this summary.</p>
            </div>
          )}

          <div className="mt-7 border-t border-surface-300/30 pt-6">
            <div className="flex items-start gap-3 rounded-2xl border border-surface-300/40 bg-surface-100/40 p-4 text-sm text-text-muted">
              <Lock size={15} className="mt-0.5 shrink-0 text-text-muted" />
              <p>
                Guest identity details are collected securely in the form and
                sent when you pay. The stay total is paid by UPI and verified by
                Aura Homes before your booking is confirmed.
              </p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

export default function BookingPage() {
  const [searchParams] = useSearchParams()

  const propertySlug = searchParams.get('property') as PropertySlug | null
  const checkIn = searchParams.get('checkIn') ?? ''
  const checkOut = searchParams.get('checkOut') ?? ''
  const guestsParam = searchParams.get('guests')

  const { property, isMissing, status } = usePropertyBySlug(propertySlug ?? undefined)

  if (!propertySlug) {
    return <PropertyPicker />
  }

  if (status === 'loading' && !property) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={28} className="animate-spin text-text-muted" />
      </div>
    )
  }

  if (isMissing || !property) {
    return <NotFoundContent />
  }

  const guests = Math.min(property.capacity, Math.max(1, Number(guestsParam) || 2))

  return (
    <div className="mx-auto max-w-7xl px-5 pb-28 pt-28 sm:px-8 lg:pt-32">
      <Link
        to={`/properties/${property.slug}`}
        className="mb-10 inline-flex items-center gap-2 text-sm text-text-muted transition-colors hover:text-text-primary"
      >
        <ArrowLeft size={15} />
        Back to {property.name}
      </Link>

      {/* Keying by the validated stay resets the wizard (coupon, step, payload)
          whenever the property or dates change. */}
      <BookingWizard
        key={`${property.slug}-${checkIn}-${checkOut}`}
        property={property}
        checkIn={checkIn}
        checkOut={checkOut}
        guests={guests}
      />
    </div>
  )
}