import { useCallback, useEffect, useState } from 'react'
import { Ban, CalendarDays, Loader2, Pencil, Phone } from 'lucide-react'
import type { BookingStatusValue } from '@/types'
import type { AdminBooking } from '@/types/admin'
import {
  AdminApiError,
  cancelAdminBooking,
  fetchAdminBooking,
  fetchAdminBookings,
} from '@/services/admin'
import { AdminBookingForm } from '@/components/admin/AdminBookingForm'
import { DetailList, ErrorBanner } from '@/components/admin/AdminFormControls'
import { StatusPill } from '@/components/admin/StatusPill'
import { formatShortDate } from '@/lib/date'

export function BookingsTab() {
  const [bookings, setBookings] = useState<AdminBooking[]>([])
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'ALL' | BookingStatusValue>('ALL')
  const [editing, setEditing] = useState<AdminBooking | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionDetails, setActionDetails] = useState<Array<{ field: string; message: string }> | undefined>(undefined)

  const fetchData = useCallback(async () => {
    try {
      setBookings(await fetchAdminBookings())
      setLoadStatus('ready')
    } catch (err) {
      setLoadStatus('error')
      setLoadError(err instanceof AdminApiError ? err.message : 'Failed to load bookings.')
    }
  }, [])

  const reload = useCallback(() => {
    setLoadStatus('loading')
    void fetchData()
  }, [fetchData])

  useEffect(() => {
    let active = true
    fetchAdminBookings()
      .then((items) => {
        if (!active) return
        setBookings(items)
        setLoadStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setLoadStatus('error')
        setLoadError(err instanceof AdminApiError ? err.message : 'Failed to load bookings.')
      })
    return () => {
      active = false
    }
  }, [])

  async function openEditor(id: string) {
    setActionError(null)
    setActionDetails(undefined)
    try {
      setEditing(await fetchAdminBooking(id))
    } catch (err) {
      if (err instanceof AdminApiError) {
        setActionError(err.message)
        setActionDetails(err.details)
      } else {
        setActionError('Failed to load the booking.')
      }
    }
  }

  async function handleCancel(id: string) {
    if (!window.confirm('Cancel this booking? This releases its nights.')) return
    setBusyId(id)
    setActionError(null)
    setActionDetails(undefined)
    try {
      await cancelAdminBooking(id)
      await reload()
    } catch (err) {
      if (err instanceof AdminApiError) {
        setActionError(err.message)
        setActionDetails(err.details)
      } else {
        setActionError('Failed to cancel the booking.')
      }
    } finally {
      setBusyId(null)
    }
  }

  if (editing) {
    return (
      <AdminBookingForm
        booking={editing}
        onSaved={() => {
          setEditing(null)
          void reload()
        }}
        onCancel={() => setEditing(null)}
      />
    )
  }

  const visible = filter === 'ALL' ? bookings : bookings.filter((b) => b.status === filter)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-purple-bright">Bookings</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            BOOKING REQUESTS
          </h1>
        </div>

        <div className="flex items-center gap-1 rounded-full border border-surface-300/50 p-1">
          {(['ALL', 'PENDING', 'CONFIRMED', 'CANCELLED'] as const).map((value) => (
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
          Loading bookings…
        </div>
      )}

      {loadStatus === 'error' && <ErrorBanner message={loadError ?? 'Failed to load bookings.'} />}

      {loadStatus === 'ready' && visible.length === 0 && (
        <div className="card-surface rounded-panel p-12 text-center text-text-muted">
          <p className="font-display text-lg text-text-primary">No bookings here yet.</p>
          <p className="mt-2 text-sm">New customer bookings will show up in this list.</p>
        </div>
      )}

      {loadStatus === 'ready' && visible.length > 0 && (
        <div className="card-surface overflow-hidden rounded-panel">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-surface-300/40 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                  <th className="px-5 py-3.5">Reference</th>
                  <th className="px-5 py-3.5">Property</th>
                  <th className="px-5 py-3.5">Dates</th>
                  <th className="px-5 py-3.5">Guests</th>
                  <th className="px-5 py-3.5">Contact</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((booking) => (
                  <tr
                    key={booking.id}
                    className="border-b border-surface-300/20 transition-colors last:border-b-0 hover:bg-surface-100/40"
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold text-text-primary">{booking.code}</p>
                      <p className="mt-0.5 text-xs text-text-muted">{booking.nights} night{booking.nights === 1 ? '' : 's'}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-text-primary">{booking.property.name}</p>
                      <p className="mt-0.5 text-xs text-text-muted">{booking.property.shortLabel}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-text-primary">{formatShortDate(booking.checkIn)}</p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-text-muted">
                        <CalendarDays size={11} />
                        {formatShortDate(booking.checkOut)}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-text-primary">{booking.guestCount}</p>
                      <p className="mt-0.5 text-xs text-text-muted">adults</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="inline-flex items-center gap-1.5 text-text-primary">
                        <Phone size={12} className="text-text-muted" />
                        {booking.primaryPhone}
                      </p>
                    </td>
                    <td className="px-5 py-4"><StatusPill status={booking.status} /></td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void openEditor(booking.id)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-surface-300/70 px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-purple/50 hover:text-text-primary"
                        >
                          <Pencil size={12} />
                          Edit
                        </button>
                        {booking.status !== 'CANCELLED' && (
                          <button
                            type="button"
                            onClick={() => void handleCancel(booking.id)}
                            disabled={busyId === booking.id}
                            className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:border-rose-400/60 hover:bg-rose-400/10 disabled:opacity-50"
                          >
                            {busyId === booking.id ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}