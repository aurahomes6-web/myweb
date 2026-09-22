import { useEffect, useState, type FormEvent } from 'react'
import { Loader2, Percent, Plus, Ticket, Trash2 } from 'lucide-react'
import type { AdminCoupon, AdminCouponDiscountType } from '@/types/admin'
import {
  AdminApiError,
  createAdminCoupon,
  deleteAdminCoupon,
  fetchAdminCoupons,
  setAdminCouponActive,
} from '@/services/admin'
import { DetailList, ErrorBanner, Field, Select, TextInput } from '@/components/admin/AdminFormControls'
import Button from '@/components/ui/Button'
import { formatINR, inrToPaise } from '@/lib/money'
import { cn } from '@/lib/cn'

type CouponLoad = 'loading' | 'error' | 'ready'

/** Mirror of the server's usable-check for display purposes only. */
function couponActive(coupon: AdminCoupon): boolean {
  if (coupon.deactivatedAt !== null) return false
  if (coupon.expiresAt !== null && new Date(coupon.expiresAt).getTime() <= Date.now()) return false
  if (coupon.maxUses !== null && coupon.uses >= coupon.maxUses) return false
  return true
}

function formatExpiry(value: string | null): string | null {
  if (value === null) return null
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function CouponsTab() {
  const [state, setState] = useState<CouponLoad>('loading')
  const [listError, setListError] = useState<string | null>(null)
  const [coupons, setCoupons] = useState<AdminCoupon[]>([])

  // Create form state
  const [showCreate, setShowCreate] = useState(false)
  const [code, setCode] = useState('')
  const [discountType, setDiscountType] = useState<AdminCouponDiscountType>('PERCENTAGE')
  const [discountValue, setDiscountValue] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createDetails, setCreateDetails] = useState<Array<{ field: string; message: string }> | undefined>(undefined)

  // Row actions
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionDetails, setActionDetails] = useState<Array<{ field: string; message: string }> | undefined>(undefined)

  async function load() {
    setState('loading')
    setListError(null)
    try {
      setCoupons(await fetchAdminCoupons())
      setState('ready')
    } catch (err) {
      setState('error')
      setListError(err instanceof AdminApiError ? err.message : 'Failed to load coupons.')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function validateCreate(): string[] {
    const errors: string[] = []
    if (!code.trim()) errors.push('Please enter a coupon code.')
    else if (code.trim().length > 40) errors.push('Coupon codes are limited to 40 characters.')
    else if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(code.trim().toUpperCase())) errors.push('Codes may only use letters, numbers, underscore and hyphen (no spaces or symbols).')

    const raw = Number(discountValue.trim().replace(/,/g, ''))
    if (!Number.isFinite(raw) || raw <= 0) {
      errors.push('Please enter a discount amount greater than 0.')
    } else if (discountType === 'PERCENTAGE' && (raw > 100 || Math.floor(raw) !== raw)) {
      errors.push('Percentage discounts must be a whole number between 1 and 100.')
    }

    if (maxUses.trim()) {
      const uses = Number(maxUses)
      if (!Number.isInteger(uses) || uses <= 0) errors.push('Maximum uses must be a whole number greater than 0.')
    }
    return errors
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    const errors = validateCreate()
    if (errors.length > 0) {
      setCreateError(errors.join(' '))
      setCreateDetails(undefined)
      return
    }

    setCreating(true)
    setCreateError(null)
    setCreateDetails(undefined)
    const raw = Number(discountValue.trim().replace(/,/g, ''))
    try {
      const created = await createAdminCoupon({
        code: code.trim().toUpperCase(),
        discountType,
        discountValue: discountType === 'FIXED' ? inrToPaise(raw) : raw,
        maxUses: maxUses.trim() ? Number(maxUses) : null,
        expiresAt: expiresAt.trim() ? expiresAt.trim() : null,
      })
      setCoupons((prev) => [created, ...prev])
      setCode('')
      setDiscountType('PERCENTAGE')
      setDiscountValue('')
      setMaxUses('')
      setExpiresAt('')
      setShowCreate(false)
    } catch (err) {
      if (err instanceof AdminApiError) {
        setCreateError(err.message)
        setCreateDetails(err.details)
      } else {
        setCreateError('The coupon could not be created.')
      }
    } finally {
      setCreating(false)
    }
  }

  async function handleToggleActive(coupon: AdminCoupon, active: boolean) {
    setBusyId(coupon.id)
    setActionError(null)
    setActionDetails(undefined)
    try {
      const updated = await setAdminCouponActive(coupon.id, active)
      setCoupons((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    } catch (err) {
      if (err instanceof AdminApiError) {
        setActionError(err.message)
        setActionDetails(err.details)
      } else {
        setActionError('The coupon could not be updated.')
      }
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(coupon: AdminCoupon) {
    if (!window.confirm(`Delete coupon "${coupon.code}"? Coupons that have already been used cannot be deleted.`)) return
    setBusyId(coupon.id)
    setActionError(null)
    setActionDetails(undefined)
    try {
      await deleteAdminCoupon(coupon.id)
      setCoupons((prev) => prev.filter((item) => item.id !== coupon.id))
    } catch (err) {
      if (err instanceof AdminApiError) {
        setActionError(err.message)
        setActionDetails(err.details)
      } else {
        setActionError('The coupon could not be deleted.')
      }
    } finally {
      setBusyId(null)
    }
  }

  const isExhausted = (coupon: AdminCoupon) => coupon.maxUses !== null && coupon.uses >= coupon.maxUses
  const isExpired = (coupon: AdminCoupon) => coupon.expiresAt !== null && new Date(coupon.expiresAt).getTime() <= Date.now()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-magenta-bright">Coupons</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            OFFER CODES
          </h1>
          <p className="mt-2 max-w-xl text-sm text-text-muted">
            Create referral or seasonal codes guests can apply on the booking page. The price math is done by the
            server at booking time — this panel just creates and toggles the codes.
          </p>
        </div>
        {!showCreate && (
          <Button variant="secondary" size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} />
            New coupon
          </Button>
        )}
      </div>

      {actionError && (
        <div>
          <ErrorBanner message={actionError} />
          <DetailList details={actionDetails} />
        </div>
      )}

      {listError && state === 'error' && (
        <div className="flex flex-col items-start gap-3">
          <ErrorBanner message={listError} />
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      )}

      {showCreate && (
        <form
          onSubmit={(event) => void handleCreate(event)}
          className="card-surface flex flex-col gap-4 rounded-panel p-6"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Create coupon</p>
          {createError && (
            <div>
              <ErrorBanner message={createError} />
              <DetailList details={createDetails} />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Code">
              <TextInput
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="AURA10"
                maxLength={40}
                disabled={creating}
              />
            </Field>
            <Field label="Type">
              <Select value={discountType} onChange={(event) => setDiscountType(event.target.value as AdminCouponDiscountType)} disabled={creating}>
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="FIXED">Fixed (₹)</option>
              </Select>
            </Field>
            <Field label={discountType === 'FIXED' ? 'Discount (₹)' : 'Discount (%)'} hint={discountType === 'PERCENTAGE' ? 'Whole percent off the stay total.' : 'Saved as paise — e.g. 100 → ₹100 off.'}>
              <TextInput
                type="text"
                inputMode="decimal"
                value={discountValue}
                onChange={(event) => setDiscountValue(event.target.value.replace(/[^\d,]/g, ''))}
                placeholder={discountType === 'FIXED' ? '1000' : '15'}
                disabled={creating}
              />
            </Field>
            <Field label="Max uses" hint="Optional. Stop accepting the code after this many bookings.">
              <TextInput
                type="number"
                min={1}
                value={maxUses}
                onChange={(event) => setMaxUses(event.target.value.replace(/\D/g, ''))}
                placeholder="Unlimited"
                disabled={creating}
              />
            </Field>
            <Field label="Expires" hint="Optional. Code stops working after this date (UTC).">
              <TextInput
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                disabled={creating}
              />
            </Field>
          </div>
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)} disabled={creating}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={creating}>
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Ticket size={14} />}
              Create coupon
            </Button>
          </div>
        </form>
      )}

      {state === 'loading' && (
        <div className="flex items-center justify-center gap-3 py-20 text-text-muted">
          <Loader2 size={20} className="animate-spin" />
          Loading coupons…
        </div>
      )}

      {state === 'ready' && coupons.length === 0 && (
        <div className="card-surface flex flex-col items-center gap-3 rounded-panel px-6 py-16 text-center">
          <Ticket size={22} className="text-text-muted" />
          <p className="font-display text-lg font-semibold text-text-primary">No coupons yet</p>
          <p className="max-w-md text-sm text-text-muted">
            Create your first offer code with the “New coupon” button above, then share it with guests.
          </p>
        </div>
      )}

      {state === 'ready' && coupons.length > 0 && (
        <div className="flex flex-col gap-4">
          {coupons.map((coupon) => {
            const active = couponActive(coupon)
            return (
              <div key={coupon.id} className="card-surface flex flex-col gap-4 rounded-panel p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <p className="font-display text-xl font-bold tracking-tight text-text-primary">{coupon.code}</p>
                      <span
                        className={cn(
                          'rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]',
                          active
                            ? 'bg-cyan/20 text-cyan-bright ring-1 ring-cyan/30'
                            : 'bg-surface-300/20 text-text-muted ring-1 ring-surface-300/40'
                        )}
                      >
                        {active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-text-primary">
                      {coupon.discountType === 'FIXED' ? (
                        <span className="inline-flex items-center gap-1 font-semibold">{formatINR(coupon.discountValue)} flat discount</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold">
                          <Percent size={13} className="text-magenta-bright" /> {coupon.discountValue}% off stay total
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === coupon.id}
                      onClick={() => void handleToggleActive(coupon, !active)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-surface-300/70 px-3.5 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-purple/50 hover:text-text-primary disabled:opacity-50"
                    >
                      {busyId === coupon.id ? <Loader2 size={12} className="animate-spin" /> : null}
                      {active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(coupon)}
                      disabled={busyId === coupon.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-surface-300/70 px-3.5 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:border-rose-400/50 hover:text-rose-300 disabled:opacity-50"
                    >
                      {busyId === coupon.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      Delete
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-6 gap-y-1.5 border-t border-surface-300/30 pt-3 text-xs text-text-muted">
                  <span>
                    Used <span className="font-semibold text-text-secondary">{coupon.uses}</span>
                    {coupon.maxUses !== null ? (
                      <>
                        {' '}of <span className="font-semibold text-text-secondary">{coupon.maxUses}</span>
                      </>
                    ) : (
                      ' (unlimited)'
                    )}
                    {coupon.usageCount !== coupon.uses ? ` · ${coupon.usageCount} total` : ''}
                  </span>
                  {coupon.expiresAt !== null && (
                    <span className={isExpired(coupon) ? 'text-magenta-bright' : undefined}>
                      Expires {formatExpiry(coupon.expiresAt)}
                    </span>
                  )}
                  {coupon.deactivatedAt !== null && !active && (
                    <span>Turned off {formatExpiry(coupon.deactivatedAt)}</span>
                  )}
                  {isExhausted(coupon) && <span className="text-magenta-bright">Limit reached</span>}
                  {!coupon.deactivatedAt && coupon.expiresAt === null && !isExhausted(coupon) && <span>No expiry</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}