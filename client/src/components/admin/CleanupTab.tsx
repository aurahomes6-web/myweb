import { useState, type FormEvent } from 'react'
import { AlertTriangle, Database, Eraser } from 'lucide-react'
import type { AdminCleanupResult } from '@/types/admin'
import {
  AdminApiError,
  cleanupAdminAirbnb,
  cleanupAdminAllData,
  cleanupAdminBlockedDates,
  cleanupAdminBookings,
} from '@/services/admin'
import { DetailList, ErrorBanner, Field, TextInput } from '@/components/admin/AdminFormControls'
import Button from '@/components/ui/Button'

interface CleanupAction {
  key: string
  title: string
  description: string
  phrase: string
  cta: string
  run: () => Promise<AdminCleanupResult>
}

const ACTIONS: CleanupAction[] = [
  {
    key: 'bookings',
    title: 'Delete all direct bookings',
    description:
      'Removes every direct booking request and its guest records. Property listings and all their configuration stay untouched.',
    phrase: 'DELETE',
    cta: 'Delete all bookings',
    run: cleanupAdminBookings,
  },
  {
    key: 'airbnb',
    title: 'Delete all Airbnb reservations',
    description:
      'Removes every Airbnb reservation (assigned and unassigned), its guest records, and the nights it blocked on the public calendar.',
    phrase: 'DELETE',
    cta: 'Delete all Airbnb reservations',
    run: cleanupAdminAirbnb,
  },
  {
    key: 'blocked',
    title: 'Delete Airbnb-blocked nights',
    description:
      'Releases only the calendar nights blocked by Airbnb reservations. Manually blocked dates are preserved and the reservations themselves stay visible.',
    phrase: 'DELETE',
    cta: 'Delete Airbnb-blocked nights',
    run: cleanupAdminBlockedDates,
  },
  {
    key: 'all',
    title: 'Delete everything except properties',
    description:
      'Wipes every booking, guest record, Airbnb reservation and blocked date (including manually blocked ones). The 3 property listings and their configuration are always preserved.',
    phrase: 'DELETE ALL',
    cta: 'Delete all booking data',
    run: cleanupAdminAllData,
  },
]

function formatSummary(result: AdminCleanupResult): string {
  const plural = (count: number) => (count === 1 ? '' : 's')
  const parts: string[] = []
  if (result.deletedBookings) parts.push(`${result.deletedBookings} booking${plural(result.deletedBookings)}`)
  if (result.deletedGuests) parts.push(`${result.deletedGuests} guest record${plural(result.deletedGuests)}`)
  if (result.deletedReservations)
    parts.push(`${result.deletedReservations} Airbnb reservation${plural(result.deletedReservations)}`)
  if (result.deletedAirbnbGuests)
    parts.push(`${result.deletedAirbnbGuests} Airbnb guest record${plural(result.deletedAirbnbGuests)}`)
  if (result.deletedBlockedDates)
    parts.push(`${result.deletedBlockedDates} blocked night${plural(result.deletedBlockedDates)}`)
  return parts.length > 0 ? `Removed: ${parts.join(', ')}.` : 'Nothing to remove — the database is already clean.'
}

interface ConfirmCardProps {
  action: CleanupAction
}

function ConfirmCard({ action }: ConfirmCardProps) {
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<AdminCleanupResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [details, setDetails] = useState<Array<{ field: string; message: string }> | undefined>(undefined)

  const matches = confirm.trim().toUpperCase() === action.phrase

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!matches) return
    setBusy(true)
    setError(null)
    setDetails(undefined)
    setDone(null)
    try {
      setDone(await action.run())
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message)
        setDetails(err.details)
      } else {
        setError('The cleanup could not be completed. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card-surface flex flex-col gap-5 rounded-panel p-6">
      <div>
        <h2 className="font-display text-lg font-bold tracking-tight text-text-primary">{action.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">{action.description}</p>
      </div>

      {done && (
        <div
          role="status"
          className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300"
        >
          {formatSummary(done)}
        </div>
      )}
      {error && (
        <div>
          <ErrorBanner message={error} />
          <DetailList details={details} />
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label={`Type “${action.phrase}” to confirm`} className="flex-1">
          <TextInput
            value={confirm}
            onChange={(event) => {
              setConfirm(event.target.value)
              setDone(null)
            }}
            placeholder={action.phrase}
            disabled={busy}
            autoComplete="off"
          />
        </Field>
        <Button type="submit" variant="secondary" size="md" disabled={!matches || busy} className="shrink-0">
          {busy ? 'Deleting…' : action.cta}
        </Button>
      </div>
    </form>
  )
}

export function CleanupTab() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-400/10 text-rose-300 ring-1 ring-rose-400/30">
            <Database size={18} />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-rose-300">Maintenance</p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
              DATABASE CLEANUP
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-text-muted">
              Destructive actions for clearing test/reset data. Every action requires an exact confirmation phrase,
              runs inside a single transaction, and NEVER touches the property listings or drops any tables.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-amber-300/30 bg-amber-400/5 px-4 py-3 text-sm text-amber-200">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <p>
          Deleted data cannot be recovered. Bookings and reservations are removed permanently — this is only for
          clearing manual test entries, never for routine use.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {ACTIONS.map((action) => (
          <ConfirmCard key={action.key} action={action} />
        ))}
      </div>

      <p className="flex items-center gap-2 text-xs text-text-muted">
        <Eraser size={13} />
        After a cleanup, totals refresh automatically the next time you open the Bookings or Airbnb tabs.
      </p>
    </div>
  )
}