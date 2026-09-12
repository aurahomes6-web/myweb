import { useCallback, useEffect, useState } from 'react'
import { Ban, CalendarDays, Loader2, Pencil, Phone, Plus, Trash2 } from 'lucide-react'
import type { AdminAirbnb } from '@/types/admin'
import {
  AdminApiError,
  cancelAdminAirbnb,
  deleteAdminAirbnb,
  fetchAdminAirbnb,
  fetchAdminAirbnbItem,
} from '@/services/admin'
import { AdminAirbnbForm } from '@/components/admin/AdminAirbnbForm'
import { DetailList, ErrorBanner } from '@/components/admin/AdminFormControls'
import { StatusPill } from '@/components/admin/StatusPill'
import Button from '@/components/ui/Button'
import { formatShortDate } from '@/lib/date'

export function AirbnbTab() {
  const [reservations, setReservations] = useState<AdminAirbnb[]>([])
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [includeCancelled, setIncludeCancelled] = useState(false)
  const [editing, setEditing] = useState<AdminAirbnb | null>(null)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionDetails, setActionDetails] = useState<Array<{ field: string; message: string }> | undefined>(undefined)

  const fetchData = useCallback(async () => {
    try {
      setReservations(await fetchAdminAirbnb())
      setLoadStatus('ready')
    } catch (err) {
      setLoadStatus('error')
      setLoadError(err instanceof AdminApiError ? err.message : 'Failed to load Airbnb reservations.')
    }
  }, [])

  const reload = useCallback(() => {
    setLoadStatus('loading')
    void fetchData()
  }, [fetchData])

  useEffect(() => {
    let active = true
    fetchAdminAirbnb()
      .then((items) => {
        if (!active) return
        setReservations(items)
        setLoadStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setLoadStatus('error')
        setLoadError(err instanceof AdminApiError ? err.message : 'Failed to load Airbnb reservations.')
      })
    return () => {
      active = false
    }
  }, [])

  async function openEditor(id: string) {
    setActionError(null)
    setActionDetails(undefined)
    try {
      setEditing(await fetchAdminAirbnbItem(id))
    } catch (err) {
      if (err instanceof AdminApiError) {
        setActionError(err.message)
        setActionDetails(err.details)
      } else {
        setActionError('Failed to load the reservation.')
      }
    }
  }

  async function runMutation(confirmMessage: string, action: () => Promise<unknown>) {
    if (!window.confirm(confirmMessage)) return
    setActionError(null)
    setActionDetails(undefined)
    try {
      await action()
      await reload()
    } catch (err) {
      if (err instanceof AdminApiError) {
        setActionError(err.message)
        setActionDetails(err.details)
      } else {
        setActionError('The action could not be completed.')
      }
    }
  }

  async function handleCancel(id: string) {
    setBusyId(id)
    await runMutation('Cancel this reservation? Its blocked nights will be released.', () => cancelAdminAirbnb(id))
    setBusyId(null)
  }

  async function handleDelete(id: string) {
    setBusyId(id)
    await runMutation('Delete this reservation permanently? Its blocked nights will be released.', () => deleteAdminAirbnb(id))
    setBusyId(null)
  }

  if (editing || creating) {
    return (
      <AdminAirbnbForm
        editing={editing}
        onSaved={() => {
          setEditing(null)
          setCreating(false)
          void reload()
        }}
        onCancel={() => {
          setEditing(null)
          setCreating(false)
        }}
      />
    )
  }

  const visible = reservations.filter((r) => includeCancelled || r.status === 'ACTIVE')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-bright">Airbnb</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            AIRBNB RESERVATIONS
          </h1>
          <p className="mt-2 max-w-xl text-sm text-text-muted">
            Active reservations block those nights from the public calendar. Cancelling or deleting one releases its nights.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-semibold text-text-muted">
            <input
              type="checkbox"
              checked={includeCancelled}
              onChange={(event) => setIncludeCancelled(event.target.checked)}
              className="h-4 w-4 accent-purple"
            />
            Include cancelled
          </label>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} />
            New reservation
          </Button>
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
          Loading reservations…
        </div>
      )}

      {loadStatus === 'error' && <ErrorBanner message={loadError ?? 'Failed to load reservations.'} />}

      {loadStatus === 'ready' && visible.length === 0 && (
        <div className="card-surface rounded-panel p-12 text-center text-text-muted">
          <p className="font-display text-lg text-text-primary">No Airbnb reservations.</p>
          <p className="mt-2 text-sm">
            Add one using «New reservation» to protect those nights from public booking.
          </p>
        </div>
      )}

      {loadStatus === 'ready' && visible.length > 0 && (
        <div className="card-surface overflow-hidden rounded-panel">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr className="border-b border-surface-300/40 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                  <th className="px-5 py-3.5">Reservation</th>
                  <th className="px-5 py-3.5">Guest</th>
                  <th className="px-5 py-3.5">Property</th>
                  <th className="px-5 py-3.5">Dates</th>
                  <th className="px-5 py-3.5">Guests</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((reservation) => (
                  <tr
                    key={reservation.id}
                    className="border-b border-surface-300/20 transition-colors last:border-b-0 hover:bg-surface-100/40"
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold text-text-primary">{reservation.reservationNumber || 'No number'}</p>
                      <p className="mt-0.5 text-xs text-text-muted">{reservation.nights} night{reservation.nights === 1 ? '' : 's'}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="inline-flex items-center gap-1.5 text-text-primary">
                        <Phone size={12} className="text-text-muted" />
                        {reservation.guestName}
                      </p>
                      <p className="mt-0.5 text-xs text-text-muted">{reservation.primaryPhone}</p>
                    </td>
                    <td className="px-5 py-4">
                      {reservation.property ? (
                        <>
                          <p className="text-text-primary">{reservation.property.name}</p>
                          <p className="mt-0.5 text-xs text-text-muted">{reservation.property.shortLabel}</p>
                        </>
                      ) : (
                        <p>
                          <span className="inline-flex items-center rounded-full border border-amber-300/40 bg-amber-400/10 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                            Unassigned
                          </span>
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-text-primary">{formatShortDate(reservation.checkIn)}</p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-text-muted">
                        <CalendarDays size={11} />
                        {formatShortDate(reservation.checkOut)}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-text-primary">{reservation.guestCount}</p>
                      <p className="mt-0.5 text-xs text-text-muted">guests</p>
                    </td>
                    <td className="px-5 py-4"><StatusPill status={reservation.status} /></td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void openEditor(reservation.id)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-surface-300/70 px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-purple/50 hover:text-text-primary"
                        >
                          <Pencil size={12} />
                          Edit
                        </button>
                        {reservation.status === 'ACTIVE' && (
                          <button
                            type="button"
                            onClick={() => void handleCancel(reservation.id)}
                            disabled={busyId === reservation.id}
                            className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:border-rose-400/60 hover:bg-rose-400/10 disabled:opacity-50"
                          >
                            {busyId === reservation.id ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                            Cancel
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handleDelete(reservation.id)}
                          disabled={busyId === reservation.id}
                          className="inline-flex items-center gap-1.5 rounded-full border border-surface-300/70 px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:border-rose-400/50 hover:text-rose-300 disabled:opacity-50"
                        >
                          {busyId === reservation.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                          Delete
                        </button>
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