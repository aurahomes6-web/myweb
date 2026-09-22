import { useState } from 'react'
import { Loader2, Percent, Ticket, X } from 'lucide-react'
import type { AppliedCoupon } from '@/types'
import { CouponValidationError, validateCoupon } from '@/services/coupons'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/cn'

interface CouponBoxProps {
  propertyId: string
  checkIn: string
  checkOut: string
  /** Server-computed discount amounts are lifted here for the summary. */
  onCouponChange: (coupon: AppliedCoupon | null) => void
}

/**
 * Public coupon input (Phase 5). Talks to the EXISTING validate endpoint:
 *   POST /api/coupons/validate
 * The server decides what the code is worth for these exact dates; the client
 * only surfaces the discount. On "Remove" the summary falls back to the
 * original totals and the booking is sent WITHOUT the code.
 */
export function CouponBox({ propertyId, checkIn, checkOut, onCouponChange }: CouponBoxProps) {
  const [input, setInput] = useState('')
  const [validating, setValidating] = useState(false)
  const [applied, setApplied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [discountPaise, setDiscountPaise] = useState(0)

  async function handleApply() {
    const code = input.trim()
    if (!code || validating) return
    setValidating(true)
    setError(null)
    try {
      const result = await validateCoupon({ couponCode: code, propertyId, checkIn, checkOut })
      setApplied(true)
      setDiscountPaise(result.discountPaise)
      onCouponChange({ code: result.code, discountPaise: result.discountPaise })
    } catch (err) {
      setApplied(false)
      onCouponChange(null)
      setError(err instanceof CouponValidationError ? err.message : 'This coupon could not be applied.')
    } finally {
      setValidating(false)
    }
  }

  function handleRemove() {
    setInput('')
    setApplied(false)
    setDiscountPaise(0)
    setError(null)
    onCouponChange(null)
  }

  if (applied) {
    return (
      <div className="rounded-2xl border border-cyan/35 bg-cyan/10 px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Ticket size={16} className="shrink-0 text-cyan-bright" />
            <div>
              <p className="text-sm font-semibold text-text-primary">{input.trim().toUpperCase()} applied</p>
              <p className="text-xs text-cyan-bright">
                {discountPaise > 0 ? `${formatINR(discountPaise)} off your stay` : 'Applied to your stay'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-text-muted transition-colors hover:text-rose-300"
          >
            <X size={13} />
            Remove
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Have a coupon?</span>
          <input
            value={input}
            onChange={(event) => {
              setInput(event.target.value.toUpperCase())
              setError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void handleApply()
              }
            }}
            placeholder="Enter code"
            disabled={validating}
            className={cn(
              'w-full rounded-xl border border-surface-300/70 bg-surface-100/50 px-4 py-2.5 text-sm uppercase text-text-primary placeholder:text-text-muted/50 placeholder:normal-case outline-none transition-colors focus:border-purple/50 focus:ring-2 focus:ring-purple/20',
              error && 'border-magenta/60'
            )}
          />
        </label>
        <button
          type="button"
          onClick={() => void handleApply()}
          disabled={validating || !input.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-surface-300/70 px-4 py-2.5 text-xs font-semibold text-text-secondary transition-colors hover:border-purple/50 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {validating ? <Loader2 size={13} className="animate-spin" /> : <Percent size={13} />}
          Apply
        </button>
      </div>
      {error && <p className="text-xs text-magenta-bright">{error}</p>}
      <p className="text-[11px] text-text-muted">
        Discounts are calculated by the payment system and shown here for preview only.
      </p>
    </div>
  )
}