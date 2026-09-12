import { useState } from 'react'
import { BedDouble, Loader2, Pencil, Ruler, Trash2, Users } from 'lucide-react'
import type { AdminProperty } from '@/types/admin'
import { useAdminProperties } from '@/hooks/useAdminProperties'
import { deleteAdminProperty } from '@/services/admin'
import { AdminPropertyForm } from '@/components/admin/AdminPropertyForm'
import { DetailList, ErrorBanner } from '@/components/admin/AdminFormControls'
import { AdminApiError } from '@/services/admin'

export function PropertiesTab() {
  const { properties, status, error } = useAdminProperties()
  const [editing, setEditing] = useState<AdminProperty | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionDetails, setActionDetails] = useState<Array<{ field: string; message: string }> | undefined>(undefined)

  async function handleDelete(property: AdminProperty) {
    if (!window.confirm(`Delete "${property.name}"? This cannot be undone.`)) return
    setBusyId(property.id)
    setActionError(null)
    setActionDetails(undefined)
    try {
      await deleteAdminProperty(property.id)
    } catch (err) {
      if (err instanceof AdminApiError) {
        setActionError(err.message)
        setActionDetails(err.details)
      } else {
        setActionError('Failed to delete the property.')
      }
    } finally {
      setBusyId(null)
    }
  }

  if (editing) {
    return (
      <AdminPropertyForm
        property={editing}
        onSaved={() => {
          setEditing(null)
          window.location.reload()
        }}
        onCancel={() => setEditing(null)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-magenta-bright">Properties</p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
          HOME CATALOGUE
        </h1>
        <p className="mt-2 max-w-xl text-sm text-text-muted">
          Changes here go live on the public site immediately. Photos are still managed in code.
        </p>
      </div>

      {actionError && (
        <div>
          <ErrorBanner message={actionError} />
          <DetailList details={actionDetails} />
        </div>
      )}

      {status === 'loading' && (
        <div className="flex items-center justify-center gap-3 py-20 text-text-muted">
          <Loader2 size={20} className="animate-spin" />
          Loading properties…
        </div>
      )}

      {status === 'error' && <ErrorBanner message={error ?? 'Failed to load properties.'} />}

      {status === 'ready' && (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {properties.map((property) => (
            <div key={property.id} className="card-surface flex flex-col rounded-panel p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">{property.slug}</p>
                  <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-text-primary">{property.name}</h2>
                  <p className="mt-1 text-xs text-text-muted">{property.shortLabel}</p>
                </div>
                <div
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: property.accent || '#8B5CF6', boxShadow: `0 0 10px ${property.accent || '#8B5CF6'}` }}
                />
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <p className="inline-flex items-center gap-1.5 text-text-muted">
                  <Users size={13} className="text-cyan-bright" /> {property.capacity} guests
                </p>
                <p className="inline-flex items-center gap-1.5 text-text-muted">
                  <BedDouble size={13} className="text-purple-bright" /> {property.bedrooms} bed • {property.beds ?? '—'}
                </p>
                <p className="inline-flex items-center gap-1.5 text-text-muted">
                  <Ruler size={13} className="text-magenta-bright" /> {property.sqft} sqft
                </p>
                <p className="inline-flex items-center gap-1.5 text-text-muted">· {property.bathrooms} bath</p>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {property.amenities.slice(0, 4).map((amenity) => (
                  <span key={amenity} className="rounded-full border border-surface-300/50 px-2.5 py-0.5 text-[10px] text-text-muted">
                    {amenity}
                  </span>
                ))}
                {property.amenities.length > 4 && (
                  <span className="rounded-full border border-surface-300/50 px-2.5 py-0.5 text-[10px] text-text-muted">
                    +{property.amenities.length - 4}
                  </span>
                )}
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-surface-300/30 pt-4">
                <button
                  type="button"
                  onClick={() => setEditing(property)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-surface-300/70 px-3.5 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-purple/50 hover:text-text-primary"
                >
                  <Pencil size={12} />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(property)}
                  disabled={busyId === property.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-surface-300/70 px-3.5 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:border-rose-400/50 hover:text-rose-300 disabled:opacity-50"
                >
                  {busyId === property.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}