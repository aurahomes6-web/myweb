import { useState, type FormEvent } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import type { AdminProperty } from '@/types/admin'
import { AdminApiError, updateAdminProperty } from '@/services/admin'
import { DetailList, ErrorBanner, Field, Select, TextArea, TextInput } from '@/components/admin/AdminFormControls'
import Button from '@/components/ui/Button'

interface AdminPropertyFormProps {
  property: AdminProperty
  onSaved: () => void
  onCancel: () => void
}

const ACCENTS = ['purple', 'cyan', 'magenta'] as const
const ACCENT_LABELS: Record<(typeof ACCENTS)[number], string> = {
  purple: 'Bronze',
  cyan: 'Amber',
  magenta: 'Copper',
}
const VISUALS = ['moon', 'dawn', 'evening'] as const

function numberOr(name: string, fallback = 0): number {
  const parsed = Number(name)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function AdminPropertyForm({ property, onSaved, onCancel }: AdminPropertyFormProps) {
  const [name, setName] = useState(property.name)
  const [shortLabel, setShortLabel] = useState(property.shortLabel)
  const [shortDescription, setShortDescription] = useState(property.shortDescription)
  const [description, setDescription] = useState(property.description)
  const [capacity, setCapacity] = useState(String(property.capacity))
  const [bedrooms, setBedrooms] = useState(String(property.bedrooms))
  const [beds, setBeds] = useState(property.beds === null ? '' : String(property.beds))
  const [bathrooms, setBathrooms] = useState(String(property.bathrooms))
  const [sqft, setSqft] = useState(String(property.sqft))
  const [amenities, setAmenities] = useState(property.amenities.join('\n'))
  const [accent, setAccent] = useState<string>(ACCENTS.includes(property.accent as (typeof ACCENTS)[number]) ? property.accent : 'purple')
  const [visual, setVisual] = useState<string>(VISUALS.includes(property.visual as (typeof VISUALS)[number]) ? property.visual : 'moon')
  const [location, setLocation] = useState(property.location ?? '')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [details, setDetails] = useState<Array<{ field: string; message: string }> | undefined>(undefined)

  function validate(): string[] {
    const errors: string[] = []
    if (!name.trim()) errors.push('Name is required.')
    if (!shortLabel.trim()) errors.push('Short label is required.')
    if (!shortDescription.trim()) errors.push('A short description is required.')
    if (numberOr(capacity, -1) < 1) errors.push('Capacity must be at least 1.')
    if (numberOr(bedrooms) < 0) errors.push('Bedrooms cannot be negative.')
    if (beds.trim() !== '' && numberOr(beds, -1) < 0) errors.push('Beds cannot be negative.')
    if (numberOr(bathrooms) < 0) errors.push('Bathrooms cannot be negative.')
    if (numberOr(sqft, -1) <= 0) errors.push('Interior size must be greater than 0.')
    return errors
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setDetails(undefined)
    const validationErrors = validate()
    if (validationErrors.length > 0) {
      setError(validationErrors.join(' '))
      return
    }
    setSubmitting(true)
    try {
      await updateAdminProperty(property.id, {
        name: name.trim(),
        shortLabel: shortLabel.trim(),
        shortDescription: shortDescription.trim(),
        description: description.trim(),
        capacity: numberOr(capacity, 1),
        bedrooms: numberOr(bedrooms),
        beds: beds.trim() === '' ? null : numberOr(beds),
        bathrooms: numberOr(bathrooms),
        sqft: numberOr(sqft),
        amenities: amenities.split('\n').map((line) => line.trim()).filter(Boolean),
        accent: (ACCENTS as readonly string[]).includes(accent) ? accent : 'purple',
        visual: (VISUALS as readonly string[]).includes(visual) ? visual : 'moon',
        location: location.trim() || null,
      })
      onSaved()
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message)
        setDetails(err.details)
      } else {
        setError('Failed to save the property. Please try again.')
      }
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-magenta-bright">Properties · {property.slug}</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            EDIT HOME
          </h1>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft size={14} />
          Back to list
        </Button>
      </div>

      {error && (
        <div>
          <ErrorBanner message={error} />
          <DetailList details={details} />
        </div>
      )}

      <form onSubmit={handleSubmit} className="card-surface flex flex-col gap-7 rounded-panel p-6 sm:p-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Name">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} disabled={submitting} />
          </Field>
          <Field label="Short label" hint="Shown above the name, e.g. “AURA · PENTHOUSE I”">
            <TextInput value={shortLabel} onChange={(event) => setShortLabel(event.target.value)} disabled={submitting} />
          </Field>
          <Field label="Short description" className="sm:col-span-2">
            <TextInput value={shortDescription} onChange={(event) => setShortDescription(event.target.value)} disabled={submitting} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <TextArea value={description} onChange={(event) => setDescription(event.target.value)} disabled={submitting} />
          </Field>

          <Field label="Capacity (guests)">
            <TextInput type="number" min={1} value={capacity} onChange={(event) => setCapacity(event.target.value.replace(/\D/g, ''))} disabled={submitting} />
          </Field>
          <Field label="Bedrooms">
            <TextInput type="number" min={0} value={bedrooms} onChange={(event) => setBedrooms(event.target.value.replace(/\D/g, ''))} disabled={submitting} />
          </Field>
          <Field label="Beds" hint="Optional physical bed count (shown when provided).">
            <TextInput type="number" min={0} value={beds} onChange={(event) => setBeds(event.target.value.replace(/\D/g, ''))} disabled={submitting} />
          </Field>
          <Field label="Bathrooms">
            <TextInput type="number" min={0} value={bathrooms} onChange={(event) => setBathrooms(event.target.value.replace(/\D/g, ''))} disabled={submitting} />
          </Field>
          <Field label="Interior size (sqft)">
            <TextInput type="number" min={1} value={sqft} onChange={(event) => setSqft(event.target.value.replace(/\D/g, ''))} disabled={submitting} />
          </Field>
          <Field label="Accent">
            <Select value={accent} onChange={(event) => setAccent(event.target.value)} disabled={submitting}>
              {ACCENTS.map((value) => <option key={value} value={value}>{ACCENT_LABELS[value]}</option>)}
            </Select>
          </Field>
          <Field label="Visual artwork variant">
            <Select value={visual} onChange={(event) => setVisual(event.target.value)} disabled={submitting}>
              {VISUALS.map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
          </Field>
          <Field label="Location" hint="Leave empty to show “coming soon”.">
            <TextInput value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City, area" disabled={submitting} />
          </Field>
          <Field label="Amenities" hint="One per line. Order is preserved on the site." className="sm:col-span-2">
            <TextArea
              value={amenities}
              onChange={(event) => setAmenities(event.target.value)}
              placeholder={'Skyline view\nHigh-speed Wi-Fi\nSmart TV\nChef’s kitchen'}
              disabled={submitting}
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" size="md" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" size="md" disabled={submitting}>
            <Save size={15} />
            {submitting ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </div>
  )
}