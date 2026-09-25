import { useState, type FormEvent } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Save, Trash2 } from 'lucide-react'
import type { AdminProperty, AdminSpaceAttributeInput } from '@/types/admin'
import {
  AdminApiError,
  updateAdminProperty,
  updateAdminPropertySpace,
} from '@/services/admin'
import { DetailList, ErrorBanner, Field, Select, TextArea, TextInput } from '@/components/admin/AdminFormControls'
import Button from '@/components/ui/Button'
import { PropertyImageManager } from '@/components/admin/PropertyImageManager'
import { formatINRWithoutSymbol, parseINRToPaise } from '@/lib/money'
import { SPACE_ICON_OPTIONS } from '@/config/spaceIcons'
import { formatGuestCapacity } from '@/lib/space'

interface AdminPropertyFormProps {
  property: AdminProperty
  onSaved: () => void
  onCancel: () => void
}

const ACCENTS = ['purple', 'cyan', 'magenta'] as const
const ACCENT_LABELS: Record<(typeof ACCENTS)[number], string> = {
  purple: 'Champagne',
  cyan: 'Sage',
  magenta: 'Bronze',
}
const VISUALS = ['moon', 'dawn', 'evening'] as const

interface LocalSpaceAttribute {
  key: string
  label: string
  value: string
  icon: string
}

function newAttributeKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `a-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function numberOr(name: string, fallback = 0): number {
  const parsed = Number(name)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function AdminPropertyForm({ property, onSaved, onCancel }: AdminPropertyFormProps) {
  const [name, setName] = useState(property.name)
  const [shortLabel, setShortLabel] = useState(property.shortLabel)
  const [shortDescription, setShortDescription] = useState(property.shortDescription)
  const [description, setDescription] = useState(property.description)
  const [isActive, setIsActive] = useState(property.isActive !== false)
  const [amenities, setAmenities] = useState(property.amenities.join('\n'))
  const [accent, setAccent] = useState<string>(ACCENTS.includes(property.accent as (typeof ACCENTS)[number]) ? property.accent : 'purple')
  const [visual, setVisual] = useState<string>(VISUALS.includes(property.visual as (typeof VISUALS)[number]) ? property.visual : 'moon')
  const [location, setLocation] = useState(property.location ?? '')
  const [priceInput, setPriceInput] = useState(formatINRWithoutSymbol(property.pricePerNightPaise))
  const [discountedPriceInput, setDiscountedPriceInput] = useState(
    property.discountedPricePerNightPaise === null
      ? ''
      : formatINRWithoutSymbol(property.discountedPricePerNightPaise)
  )

  // THE SPACE
  const [minGuests, setMinGuests] = useState(String(property.minGuests))
  const [maxGuests, setMaxGuests] = useState(String(property.maxGuests))
  const [spaceAttributes, setSpaceAttributes] = useState<LocalSpaceAttribute[]>(
    property.spaceAttributes.map((attribute) => ({
      key: attribute.id,
      label: attribute.label,
      value: attribute.value,
      icon: attribute.icon ?? '',
    }))
  )
  const [newLabel, setNewLabel] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newIcon, setNewIcon] = useState('')
  const [spaceError, setSpaceError] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [details, setDetails] = useState<Array<{ field: string; message: string }> | undefined>(undefined)

  const minGuestCount = numberOr(minGuests, -1)
  const maxGuestCount = numberOr(maxGuests, -1)

  function validate(): string[] {
    const errors: string[] = []
    if (!name.trim()) errors.push('Name is required.')
    if (!shortLabel.trim()) errors.push('Short label is required.')
    if (!shortDescription.trim()) errors.push('A short description is required.')
    const pricePaise = parseINRToPaise(priceInput)
    if (pricePaise === null || pricePaise <= 0) errors.push('Nightly price must be a positive amount in ₹.')
    const hasDiscountedPrice = discountedPriceInput.trim() !== ''
    const discountedPricePaise = hasDiscountedPrice
      ? parseINRToPaise(discountedPriceInput)
      : null
    if (hasDiscountedPrice && (discountedPricePaise === null || discountedPricePaise <= 0)) {
      errors.push('Discounted nightly price must be a positive amount in ₹.')
    } else if (
      discountedPricePaise !== null &&
      pricePaise !== null &&
      pricePaise > 0 &&
      discountedPricePaise >= pricePaise
    ) {
      errors.push('Discounted nightly price must be lower than the original nightly price.')
    }

    if (minGuestCount < 1) errors.push('Minimum guests must be at least 1.')
    if (maxGuestCount < 1) errors.push('Maximum guests must be at least 1.')
    if (minGuestCount >= 1 && maxGuestCount >= 1 && minGuestCount > maxGuestCount) {
      errors.push('Minimum guests cannot be greater than maximum guests.')
    }
    for (const attribute of spaceAttributes) {
      if (!attribute.label.trim()) errors.push('Every space attribute needs a label.')
      if (!attribute.value.trim()) errors.push(`Space attribute “${attribute.label.trim() || '…'}” needs a value.`)
    }
    return errors
  }

  function handleAddAttribute() {
    const label = newLabel.trim()
    const value = newValue.trim()
    if (!label || !value) {
      setSpaceError('Enter a label and a value before adding an attribute.')
      return
    }
    setSpaceError(null)
    setSpaceAttributes((attributes) => [
      ...attributes,
      { key: newAttributeKey(), label, value, icon: newIcon },
    ])
    setNewLabel('')
    setNewValue('')
    setNewIcon('')
  }

  function moveAttribute(index: number, delta: number) {
    setSpaceAttributes((attributes) => {
      const target = index + delta
      if (target < 0 || target >= attributes.length) return attributes
      const next = [...attributes]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
  }

  function removeAttribute(index: number) {
    setSpaceAttributes((attributes) => attributes.filter((_, idx) => idx !== index))
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
        capacity: maxGuestCount,
        isActive,
        amenities: amenities.split('\n').map((line) => line.trim()).filter(Boolean),
        accent: (ACCENTS as readonly string[]).includes(accent) ? accent : 'purple',
        visual: (VISUALS as readonly string[]).includes(visual) ? visual : 'moon',
        location: location.trim() || null,
        pricePerNightPaise: parseINRToPaise(priceInput) as number,
        discountedPricePerNightPaise: discountedPriceInput.trim() === ''
          ? null
          : parseINRToPaise(discountedPriceInput),
      })
      const attributes: AdminSpaceAttributeInput[] = spaceAttributes.map((attribute) => ({
        label: attribute.label.trim(),
        value: attribute.value.trim(),
        icon: attribute.icon || null,
      }))
      await updateAdminPropertySpace(property.id, {
        minGuests: minGuestCount,
        maxGuests: maxGuestCount,
        attributes,
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

          <Field label="Original price per night (₹)" hint="Regular rate in rupees, saved as paise.">
            <TextInput
              type="text"
              inputMode="decimal"
              value={priceInput}
              onChange={(event) => setPriceInput(event.target.value.replace(/[^\d,.\s]/g, ''))}
              placeholder="3,000"
              disabled={submitting}
            />
          </Field>
          <Field label="Availability" hint="Inactive homes remain visible as Coming Soon and cannot accept bookings.">
            <Select value={isActive ? 'active' : 'inactive'} onChange={(event) => setIsActive(event.target.value === 'active')} disabled={submitting}>
              <option value="active">Active</option>
              <option value="inactive">Deactive</option>
            </Select>
          </Field>
          <Field label="Discounted price per night (₹)" hint="Optional. Must be lower than the original price. Leave blank for no discount.">
            <TextInput
              type="text"
              inputMode="decimal"
              value={discountedPriceInput}
              onChange={(event) => setDiscountedPriceInput(event.target.value.replace(/[^\d,.\s]/g, ''))}
              placeholder="2,400"
              disabled={submitting}
            />
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

        <div className="border-t border-surface-300/30 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-display text-lg font-bold tracking-tight text-text-primary">THE SPACE</p>
              <p className="mt-1 max-w-xl text-xs leading-relaxed text-text-muted">
                The capacity range and attribute cards shown under “THE SPACE” on the public property page.
                Each home keeps its own configuration — changes here never affect other properties.
              </p>
            </div>
            <p className="rounded-full border border-surface-300/50 bg-surface-100/60 px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
              Preview: {minGuestCount >= 1 && maxGuestCount >= 1 ? formatGuestCapacity(minGuestCount, maxGuestCount) : '…'}
            </p>
          </div>

          <div className="mt-5 grid max-w-xl gap-4 sm:grid-cols-2">
            <Field label="Minimum guests">
              <TextInput type="number" min={1} value={minGuests} onChange={(event) => setMinGuests(event.target.value.replace(/\D/g, ''))} disabled={submitting} />
            </Field>
            <Field label="Maximum guests">
              <TextInput type="number" min={1} value={maxGuests} onChange={(event) => setMaxGuests(event.target.value.replace(/\D/g, ''))} disabled={submitting} />
            </Field>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            {spaceAttributes.map((attribute, index) => (
              <div
                key={attribute.key}
                className="grid gap-2 rounded-xl border border-surface-300/40 bg-surface-100/40 p-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center"
              >
                <TextInput
                  value={attribute.label}
                  onChange={(event) => {
                    setSpaceError(null)
                    setSpaceAttributes((attributes) =>
                      attributes.map((attr, idx) => (idx === index ? { ...attr, label: event.target.value } : attr))
                    )
                  }}
                  placeholder="Label (e.g. Kitchen)"
                  aria-label={`Space attribute label ${index + 1}`}
                  disabled={submitting}
                />
                <TextInput
                  value={attribute.value}
                  onChange={(event) => {
                    setSpaceError(null)
                    setSpaceAttributes((attributes) =>
                      attributes.map((attr, idx) => (idx === index ? { ...attr, value: event.target.value } : attr))
                    )
                  }}
                  placeholder="Value (e.g. Fully equipped)"
                  aria-label={`Space attribute value ${index + 1}`}
                  disabled={submitting}
                />
                <Select
                  value={attribute.icon}
                  onChange={(event) => {
                    setSpaceAttributes((attributes) =>
                      attributes.map((attr, idx) => (idx === index ? { ...attr, icon: event.target.value } : attr))
                    )
                  }}
                  aria-label={`Space attribute icon ${index + 1}`}
                  disabled={submitting}
                >
                  <option value="">No icon</option>
                  {SPACE_ICON_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </Select>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => moveAttribute(index, -1)}
                    disabled={submitting || index === 0}
                    title="Move up"
                    aria-label={`Move ${attribute.label || 'attribute'} up`}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-surface-300/50 text-text-muted transition-colors hover:border-purple/50 hover:text-text-primary disabled:opacity-40"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveAttribute(index, 1)}
                    disabled={submitting || index === spaceAttributes.length - 1}
                    title="Move down"
                    aria-label={`Move ${attribute.label || 'attribute'} down`}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-surface-300/50 text-text-muted transition-colors hover:border-purple/50 hover:text-text-primary disabled:opacity-40"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAttribute(index)}
                    disabled={submitting}
                    title="Remove"
                    aria-label={`Remove ${attribute.label || 'attribute'}`}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-surface-300/50 text-text-muted transition-colors hover:border-rose-400/50 hover:text-rose-300 disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}

            {spaceAttributes.length === 0 && (
              <p className="rounded-xl border border-dashed border-surface-300/50 bg-surface-100/30 px-4 py-5 text-center text-xs leading-relaxed text-text-muted">
                No space attributes yet. Add kitchen, terrace, views, or anything else below.
                Until you add some, customers only see the capacity card.
              </p>
            )}

            {spaceError && <p className="text-xs text-magenta-bright" role="alert">{spaceError}</p>}
          </div>

          <div className="mt-5 rounded-xl border border-surface-300/40 bg-surface-100/40 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Add space attribute</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center">
              <TextInput
                value={newLabel}
                onChange={(event) => {
                  setNewLabel(event.target.value)
                  setSpaceError(null)
                }}
                placeholder="Label (e.g. Kitchen)"
                aria-label="New space attribute label"
                disabled={submitting}
              />
              <TextInput
                value={newValue}
                onChange={(event) => {
                  setNewValue(event.target.value)
                  setSpaceError(null)
                }}
                placeholder="Value (e.g. Fully equipped)"
                aria-label="New space attribute value"
                disabled={submitting}
              />
              <Select
                value={newIcon}
                onChange={(event) => setNewIcon(event.target.value)}
                aria-label="New space attribute icon"
                disabled={submitting}
              >
                <option value="">No icon</option>
                {SPACE_ICON_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </Select>
              <Button type="button" size="sm" onClick={handleAddAttribute} disabled={submitting}>
                <Plus size={13} />
                Add
              </Button>
            </div>
          </div>
        </div>

        <div className="border-t border-surface-300/30 pt-6">
          <PropertyImageManager propertyId={property.id} images={property.images} />
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