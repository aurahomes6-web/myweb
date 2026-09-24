import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Check, Loader2, Phone, X } from 'lucide-react'
import type { PaymentStatusValue } from '@/types'
import type { AdminPayment } from '@/types/admin'
import {
  acceptAdminPayment,
  AdminApiError,
  fetchAdminPayments,
  rejectAdminPayment,
} from '@/services/admin'
import { StatusPill } from '@/components/admin/StatusPill'
import { RejectPaymentPanel } from '@/components/admin/RejectPaymentPanel'
import { DetailList, ErrorBanner } from '@/components/admin/AdminFormControls'
import { formatShortDate } from '@/lib/date'
import { formatINR } from '@/lib/money'

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Direct-UPI payment ledger (server: paymentService).
 *
 * Every booking that carried a UTR at submission shows up here. Accepting a
 * PENDING payment keeps the booking confirmed (dates stay held); rejecting one
 * cancels the booking, releases its nights and surfaces the optional reason on
 * the customer's confirmation page and booking tracker. The UTR is only ever
 * shown inside this admin section — no public API returns it.
 */
export function PaymentsTab() {
  const [payments, setPayments] = useState<AdminPayment[]>([])
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'ALL' | PaymentStatusValue>('ALL')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionDetails, setActionDetails] = useState<Array<{ field: string; message: string }> | undefined>(undefined)
  const [rejectingId, setRejectingId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setPayments(await fetchAdminPayments())
      setLoadStatus('ready')
    } catch (err) {
      setLoadStatus('error')
      setLoadError(err instanceof AdminApiError ? err.message : 'Failed to load payments.')
    }
  }, [])

  const reload = useCallback(() => {
    setLoadStatus('loading')
    void fetchData()
  }, [fetchData])

  useEffect(() => {
    let active = true
    fetchAdminPayments()
      .then((items) => {
        if (!active) return
        setPayments(items)
        setLoadStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setLoadStatus('error')
        setLoadError(err instanceof AdminApiError ? err.message : 'Failed to load payments.')
      })
    return () => {
      active = false
    }
  }, [])

  async function handleAccept(id: string) {
    if (!window.confirm('Accept this UPI payment? The booking stays confirmed and its dates stay held.')) return
    setBusyId(id)
    setActionError(null)
    setActionDetails(undefined)
    try {
      await acceptAdminPayment(id)
      await reload()
    } catch (err) {
      if (err instanceof AdminApiError) {
        setActionError(err.message)
        setActionDetails(err.details)
      } else {
        setActionError('Failed to accept the payment.')
      }
    } finally {
      setBusyId(null)
    }
  }

  async function handleReject(id: string, rejectionMessage?: string) {
    setBusyId(id)
    setActionError(null)
    setActionDetails(undefined)
    try {
      await rejectAdminPayment(id, rejectionMessage)
      setRejectingId(null)
      await reload()
    } catch (err) {
      if (err instanceof AdminApiError) {
        setActionError(err.message)
        setActionDetails(err.details)
      } else {
        setActionError('Failed to reject the payment.')
      }
    } finally {
      setBusyId(null)
    }
  }

  const visible = filter === 'ALL' ? payments : payments.filter((p) => p.paymentStatus === filter)
  const pendingCount = payments.filter((p) => p.paymentStatus === 'PENDING').length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-purple-bright">Payments</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            UPI PAYMENTS
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {pendingCount > 0
              ? `${pendingCount} payment${pendingCount === 1 ? '' : 's'} awaiting verification.`
              : 'No payments awaiting verification.'}
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-full border border-surface-300/50 p-1">
          {(['ALL', 'PENDING', 'ACCEPTED', 'REJECTED'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={
                'rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ' +
                (filter === value
                  ? 'bg-gradient-to-r from-purple/25 to-cyan/25 text-text-primary ring-1 ring-purple/30'
                  : 'text-text-muted hover:text-text-primary')
              }
            >
              {value === 'ALL' ? 'All' : value[0] + value.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {actionError && (
        <div>
          <ErrorBanner message={actionError} />
          <DetailList details={actionDetails} />
        </div>
      )}

      {loadStatus === 'loading' && (
        <div className="flex items-center justify-center gap-3 py-20 text-text-muted">
          <Loader2 size={20} className="animate-spin" />
          Loading payments…
        </div>
      )}

      {loadStatus === 'error' && <ErrorBanner message={loadError ?? 'Failed to load payments.'} />}

      {loadStatus === 'ready' && visible.length === 0 && (
        <div className="card-surface rounded-panel p-12 text-center text-text-muted">
          <p className="font-display text-lg text-text-primary">No payments here yet.</p>
          <p className="mt-2 text-sm">Bookings submitted with a UTR will show up in this list.</p>
        </div>
      )}

      {loadStatus === 'ready' && visible.length > 0 && (
        <div className="card-surface overflow-hidden rounded-panel">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className="border-b border-surface-300/40 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                  <th className="px-5 py-3.5">Reference</th>
                  <th className="px-5 py-3.5">Guest</th>
                  <th className="px-5 py-3.5">Amount</th>
                  <th className="px-5 py-3.5">Dates</th>
                  <th className="px-5 py-3.5">UTR</th>
                  <th className="px-5 py-3.5">Submitted</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((payment) => (
                  <PaymentRow
                    key={payment.id}
                    payment={payment}
                    busy={busyId === payment.id}
                    rejecting={rejectingId === payment.id}
                    onAccept={() => void handleAccept(payment.id)}
                    onOpenReject={() => {
                      setActionError(null)
                      setActionDetails(undefined)
                      setRejectingId(payment.id)
                    }}
                    onCloseReject={() => setRejectingId(null)}
                    onReject={(message) => void handleReject(payment.id, message)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function PaymentRow({
  payment,
  busy,
  rejecting,
  onAccept,
  onOpenReject,
  onCloseReject,
  onReject,
}: {
  payment: AdminPayment
  busy: boolean
  rejecting: boolean
  onAccept: () => void
  onOpenReject: () => void
  onCloseReject: () => void
  onReject: (rejectionMessage?: string) => void
}) {
  return (
    <>
      <tr className="border-b border-surface-300/20 transition-colors last:border-b-0 hover:bg-surface-100/40">
        <td className="px-5 py-4">
          <p className="font-semibold text-text-primary">{payment.code}</p>
          <p className="mt-0.5 text-xs text-text-muted">
            <StatusPill status={payment.bookingStatus} />
          </p>
        </td>
        <td className="px-5 py-4">
          <p className="inline-flex items-center gap-1.5 text-text-primary">
            <Phone size={12} className="text-text-muted" />
            {payment.primaryPhone}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">{payment.property.name}</p>
        </td>
        <td className="px-5 py-4 font-semibold text-text-primary">
          {payment.finalPricePaise != null ? formatINR(payment.finalPricePaise) : '—'}
        </td>
        <td className="px-5 py-4">
          <p className="text-text-primary">{formatShortDate(payment.checkIn)}</p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-text-muted">
            <CalendarDays size={11} />
            {formatShortDate(payment.checkOut)}
          </p>
        </td>
        <td className="px-5 py-4">
          <p className="font-mono text-xs font-semibold tracking-wide text-text-primary">{payment.utr}</p>
          <p className="mt-0.5 text-[11px] text-text-muted">
            {payment.nights} night{payment.nights === 1 ? '' : 's'} · {payment.guestCount} guest
            {payment.guestCount === 1 ? '' : 's'}
          </p>
        </td>
        <td className="px-5 py-4 text-xs text-text-muted">{formatDateTime(payment.paymentSubmittedAt)}</td>
        <td className="px-5 py-4">
          <StatusPill status={payment.paymentStatus} />
        </td>
        <td className="px-5 py-4">
          <div className="flex items-center justify-end gap-2">
            {payment.paymentStatus === 'PENDING' ? (
              <>
                <button
                  type="button"
                  onClick={onAccept}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:border-emerald-400/60 hover:bg-emerald-400/10 disabled:opacity-50"
                >
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Accept
                </button>
                <button
                  type="button"
                  onClick={onOpenReject}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:border-rose-400/60 hover:bg-rose-400/10 disabled:opacity-50"
                >
                  <X size={12} />
                  Reject
                </button>
              </>
            ) : (
              <span className="text-xs text-text-muted">—</span>
            )}
          </div>
        </td>
      </tr>
      {rejecting && (
        <tr className="border-b border-surface-300/20 bg-magenta/[0.04]">
          <td colSpan={8} className="px-5 py-4">
            <RejectPaymentPanel
              busy={busy}
              onCancel={onCloseReject}
              onConfirm={(message) => {
                onCloseReject()
                onReject(message)
              }}
            />
          </td>
        </tr>
      )}
    </>
  )
}