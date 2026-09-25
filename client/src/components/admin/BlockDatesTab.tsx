import { useEffect, useState, type FormEvent } from 'react'
import { CalendarX2, Loader2, Plus, Trash2 } from 'lucide-react'
import type { AdminBookingDateBlock } from '@/types/admin'
import { useAdminProperties } from '@/hooks/useAdminProperties'
import {
  AdminApiError,
  createAdminBookingDateBlock,
  deleteAdminBookingDateBlock,
  fetchAdminBookingDateBlocks,
} from '@/services/admin'
import { ErrorBanner, Field, TextInput } from '@/components/admin/AdminFormControls'
import Button from '@/components/ui/Button'

export function BlockDatesTab() {
  const { properties, status, error: propertiesError } = useAdminProperties()
  const [propertyId, setPropertyId] = useState('')
  const selectedPropertyId = propertyId || properties[0]?.id || ''
  const [blocks, setBlocks] = useState<AdminBookingDateBlock[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedPropertyId) return
    let active = true
    fetchAdminBookingDateBlocks(selectedPropertyId)
      .then((items) => {
        if (active) {
          setBlocks(items)
          setError(null)
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof AdminApiError ? err.message : 'Failed to load blocked dates.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [selectedPropertyId])

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (!selectedPropertyId || !startDate || !endDate) {
      setError('Choose a property and enter both dates.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const block = await createAdminBookingDateBlock(selectedPropertyId, { startDate, endDate })
      setBlocks((current) => [...current, block].sort((a, b) => a.startDate.localeCompare(b.startDate)))
      setStartDate('')
      setEndDate('')
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Failed to block these dates.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(block: AdminBookingDateBlock) {
    if (!window.confirm(`Remove the block from ${block.startDate} to ${block.endDate}?`)) return
    setSaving(true)
    setError(null)
    try {
      await deleteAdminBookingDateBlock(selectedPropertyId, block.id)
      setBlocks((current) => current.filter((item) => item.id !== block.id))
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Failed to remove the date block.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-magenta-bright">Block Dates</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
          NORMAL BOOKING CALENDAR
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          Block a date range for AURA HOMES direct bookings. These blocks do not affect Airbnb reservations.
        </p>
      </div>

      {propertiesError && <ErrorBanner message={propertiesError} />}
      {error && <ErrorBanner message={error} />}

      <form onSubmit={handleCreate} className="card-surface flex flex-col gap-5 rounded-panel p-6">
        <Field label="Property">
          <select
             value={selectedPropertyId}
            onChange={(event) => setPropertyId(event.target.value)}
            disabled={status !== 'ready' || saving}
            className="w-full rounded-xl border border-surface-300/70 bg-surface-100/50 px-4 py-2.5 text-sm text-text-primary outline-none focus:border-purple/50"
          >
            {properties.map((property) => (
              <option key={property.id} value={property.id}>{property.name}</option>
            ))}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date">
            <TextInput type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={saving} />
          </Field>
          <Field label="End date" hint="The end date is blocked as well.">
            <TextInput type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} disabled={saving} />
          </Field>
        </div>
         <Button type="submit" size="sm" disabled={saving || !selectedPropertyId} className="self-start">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Add block
        </Button>
      </form>

      <div className="card-surface rounded-panel p-6">
        <div className="flex items-center gap-2">
          <CalendarX2 size={18} className="text-purple-bright" />
          <h2 className="font-display text-lg font-bold text-text-primary">Blocked ranges</h2>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-text-muted"><Loader2 size={16} className="animate-spin" /> Loading…</div>
        ) : blocks.length === 0 ? (
          <p className="py-8 text-sm text-text-muted">No normal-booking date blocks for this property.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {blocks.map((block) => (
              <li key={block.id} className="flex items-center justify-between gap-4 rounded-xl border border-surface-300/40 bg-surface-100/40 px-4 py-3 text-sm">
                <span className="text-text-primary">{block.startDate} → {block.endDate}</span>
                <button
                  type="button"
                  onClick={() => void handleDelete(block)}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-magenta-bright disabled:opacity-50"
                >
                  <Trash2 size={13} /> Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
