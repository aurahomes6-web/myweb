import { useState, type FormEvent } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import type { AdminBooking } from '@/types/admin'
import { useAdminProperties } from '@/hooks/useAdminProperties'
import { AdminApiError, updateAdminBooking } from '@/services/admin'
import { DetailList, ErrorBanner, Field, Select, TextArea, TextInput } from '@/components/admin/AdminFormControls'
import Button from '@/components/ui/Button'
import { GuestRowsEditor } from '@/components/admin/GuestRowsEditor'
import { fromAdminGuest, validateGuestsRows, type GuestEditorValue } from '@/components/admin/guestEditorUtils'
import { isValidRange } from '@/lib/date'
import { maskPhoneHint } from '@/components/admin/phoneHint'

interface AdminBookingFormProps {
  booking: AdminBooking
  onSaved: () => void
  onCancel: () => void
}

export function AdminBookingForm({ booking, onSaved, onCancel }: AdminBookingFormProps) {
  const { properties, status: propertyStatus } = useAdminProperties()

  const [propertyId, setPropertyId] = useState(booking.propertyId)
  const [checkIn, setCheckIn] = useState(booking.checkIn)
  const [checkOut, setCheckOut] = useState(booking.checkOut)
  const [primaryPhone, setPrimaryPhone] = useState(booking.primaryPhone)
  const [notes, setNotes] = useState(booking.notes ?? '')
  const [guests, setGuests] = useState<GuestEditorValue[]>(() => booking.guests.map(fromAdminGuest))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [details, setDetails] = useState<Array<{ field: string; message: string }> | undefined>(undefined)

  const selectedProperty = properties.find((p) => p.id === propertyId)

  function validate(): string[] {
    const errors = validateGuestsRows(guests)
    if (!propertyId) errors.push('Choose a property.')
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
    setSubmitting(true)
    try {
      await updateAdminBooking(booking.id, {
        propertyId,
        checkIn,
        checkOut,
        guestCount: guests.length,
        primaryPhone: primaryPhone.trim(),
        notes: notes.trim() || undefined,
        guests: guests.map((guest) => ({
          fullName: guest.fullName.trim(),
          aadhaarNumber: guest.aadhaarNumber.trim(),
          gender: guest.gender,
          age: Number(guest.age),
          phone: guest.phone?.trim() || undefined,
        })),
      })
      onSaved()
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message)
        setDetails(err.details)
      } else {
        setError('Failed to save the booking. Please try again.')
      }
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-purple-bright">
            Bookings · {booking.code}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            UPDATE BOOKING
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
          <Field label="Guest count">
            <TextInput value={`${guests.length}`} readOnly className="bg-surface-200/40" />
          </Field>
          <Field label="Check-in">
            <TextInput type="date" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} disabled={submitting} />
          </Field>
          <Field label="Check-out">
            <TextInput type="date" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} disabled={submitting} />
          </Field>
          <Field label="Primary contact phone" hint={maskPhoneHint(primaryPhone)}>
            <TextInput
              type="tel"
              value={primaryPhone}
              onChange={(event) => setPrimaryPhone(event.target.value)}
              placeholder="+91 …"
              disabled={submitting}
            />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <TextArea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Internal or guest notes (optional)" disabled={submitting} />
          </Field>
        </div>

        <div className="h-px w-full bg-gradient-to-r from-transparent via-surface-300/60 to-transparent" />

        <GuestRowsEditor rows={guests} onChange={setGuests} withPhone disabled={submitting} />

        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" size="md" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" size="md" disabled={submitting}>
            <Save size={15} />
            {submitting ? 'Saving…' : 'Save booking'}
          </Button>
        </div>
      </form>
    </div>
  )
}