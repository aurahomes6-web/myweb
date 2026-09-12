import { useState, type FormEvent } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import type { AdminAirbnb } from '@/types/admin'
import { useAdminProperties } from '@/hooks/useAdminProperties'
import { AdminApiError, createAdminAirbnb, updateAdminAirbnb } from '@/services/admin'
import { DetailList, ErrorBanner, Field, Select, TextArea, TextInput } from '@/components/admin/AdminFormControls'
import Button from '@/components/ui/Button'
import { GuestRowsEditor } from '@/components/admin/GuestRowsEditor'
import { emptyGuest, fromAdminGuest, validateGuestsRows, type GuestEditorValue } from '@/components/admin/guestEditorUtils'
import { maskPhoneHint } from '@/components/admin/phoneHint'
import { isValidRange } from '@/lib/date'

interface AdminAirbnbFormProps {
  editing: AdminAirbnb | null
  onSaved: () => void
  onCancel: () => void
}

export function AdminAirbnbForm({ editing, onSaved, onCancel }: AdminAirbnbFormProps) {
  const { properties, status: propertyStatus } = useAdminProperties()
  const isNew = editing === null

  const [propertyId, setPropertyId] = useState(editing?.propertyId ?? '')
  const [reservationNumber, setReservationNumber] = useState(editing?.reservationNumber ?? '')
  const [guestName, setGuestName] = useState(editing?.guestName ?? '')
  const [primaryPhone, setPrimaryPhone] = useState(editing?.primaryPhone ?? '')
  const [checkIn, setCheckIn] = useState(editing?.checkIn ?? '')
  const [checkOut, setCheckOut] = useState(editing?.checkOut ?? '')
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [guests, setGuests] = useState<GuestEditorValue[]>(() =>
    editing ? editing.guests.map(fromAdminGuest) : [emptyGuest(), emptyGuest()]
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [details, setDetails] = useState<Array<{ field: string; message: string }> | undefined>(undefined)

  const selectedProperty = properties.find((p) => p.id === propertyId)

  function validate(): string[] {
    const errors = validateGuestsRows(guests)
    if (!propertyId) errors.push('Choose a property.')
    if (!reservationNumber.trim()) errors.push('Reservation number is required.')
    if (!guestName.trim()) errors.push('Guest name is required.')
    if (!isValidRange(checkIn, checkOut)) errors.push('Check-out must be after check-in.')
    if (selectedProperty && guests.length > selectedProperty.capacity) {
      errors.push(`${selectedProperty.name} sleeps up to ${selectedProperty.capacity} guests.`)
    }
    if (!/^[\d+\-(). ]{7,15}$/.test(primaryPhone.trim())) errors.push('Enter a valid contact phone.')
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
    const payload = {
      propertyId,
      reservationNumber: reservationNumber.trim().toUpperCase(),
      guestName: guestName.trim(),
      primaryPhone: primaryPhone.trim(),
      checkIn,
      checkOut,
      guestCount: guests.length,
      notes: notes.trim() || undefined,
      guests: guests.map((guest) => ({
        fullName: guest.fullName.trim(),
        aadhaarNumber: guest.aadhaarNumber.trim(),
        gender: guest.gender,
        age: Number(guest.age),
      })),
    }
    setSubmitting(true)
    try {
      if (editing) {
        await updateAdminAirbnb(editing.id, payload)
      } else {
        await createAdminAirbnb(payload)
      }
      onSaved()
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message)
        setDetails(err.details)
      } else {
        setError('Failed to save the reservation. Please try again.')
      }
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-bright">
            Airbnb {isNew ? '· New reservation' : `· ${editing?.reservationNumber}`}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            {isNew ? 'NEW AIRBNB RESERVATION' : 'UPDATE RESERVATION'}
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
          <Field label="Property">
            <Select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} disabled={propertyStatus !== 'ready' || submitting}>
              <option value="">Select a property…</option>
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name} (up to {property.capacity} guests)
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reservation number">
            <TextInput
              value={reservationNumber}
              onChange={(event) => setReservationNumber(event.target.value.toUpperCase())}
              placeholder="e.g. HML23ABC123"
              disabled={submitting}
            />
          </Field>
          <Field label="Guest name">
            <TextInput value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="Name on the reservation" disabled={submitting} />
          </Field>
          <Field label="Primary phone" hint={maskPhoneHint(primaryPhone)}>
            <TextInput type="tel" value={primaryPhone} onChange={(event) => setPrimaryPhone(event.target.value)} placeholder="+91 …" disabled={submitting} />
          </Field>
          <Field label="Check-in">
            <TextInput type="date" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} disabled={submitting} />
          </Field>
          <Field label="Check-out">
            <TextInput type="date" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} disabled={submitting} />
          </Field>
          <Field label="Guest count">
            <TextInput value={`${guests.length}`} readOnly className="bg-surface-200/40" />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <TextArea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Internal notes (optional)" disabled={submitting} />
          </Field>
        </div>

        <div className="h-px w-full bg-gradient-to-r from-transparent via-surface-300/60 to-transparent" />

        <GuestRowsEditor rows={guests} onChange={setGuests} disabled={submitting} />

        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" size="md" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" size="md" disabled={submitting}>
            <Save size={15} />
            {submitting ? 'Saving…' : isNew ? 'Create reservation' : 'Save changes'}
          </Button>
        </div>
      </form>
    </div>
  )
}