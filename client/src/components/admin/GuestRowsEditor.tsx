import { Plus, Trash2, Users } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Field, Select, TextInput } from '@/components/admin/AdminFormControls'
import { GENDERS, emptyGuest, type GuestEditorValue } from '@/components/admin/guestEditorUtils'

interface GuestRowsEditorProps {
  rows: GuestEditorValue[]
  onChange: (rows: GuestEditorValue[]) => void
  withPhone?: boolean
  disabled?: boolean
}

export function GuestRowsEditor({ rows, onChange, withPhone = false, disabled = false }: GuestRowsEditorProps) {
  function updateRow(index: number, patch: Partial<GuestEditorValue>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Guests</p>
        <button
          type="button"
          onClick={() => onChange([...rows, emptyGuest(withPhone)])}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-full border border-surface-300/70 px-3.5 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-purple/50 hover:text-text-primary disabled:opacity-50"
        >
          <Plus size={13} />
          Add guest
        </button>
      </div>

      {rows.map((row, index) => (
        <div key={index} className="rounded-2xl border border-surface-300/40 bg-surface-100/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Guest {index + 1}</p>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
                disabled={disabled}
                aria-label={`Remove guest ${index + 1}`}
                className="inline-flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-magenta-bright disabled:opacity-50"
              >
                <Trash2 size={13} />
                Remove
              </button>
            )}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Full name" className="sm:col-span-2">
              <TextInput
                value={row.fullName}
                onChange={(event) => updateRow(index, { fullName: event.target.value })}
                placeholder="Full name as on Aadhaar"
                disabled={disabled}
              />
            </Field>
            <Field label="Aadhaar number" hint="12 digits — stored encrypted server-side.">
              <TextInput
                value={row.aadhaarNumber}
                onChange={(event) => updateRow(index, { aadhaarNumber: event.target.value.replace(/\D/g, '').slice(0, 12) })}
                inputMode="numeric"
                maxLength={12}
                placeholder="XXXXXXXXXXXX"
                disabled={disabled}
              />
            </Field>
            <Field label="Gender">
              <Select
                value={row.gender}
                onChange={(event) => updateRow(index, { gender: event.target.value as GuestEditorValue['gender'] })}
                disabled={disabled}
              >
                {GENDERS.map((gender) => (
                  <option key={gender} value={gender}>
                    {gender.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Age">
              <TextInput
                type="number"
                min={1}
                max={150}
                value={row.age}
                onChange={(event) => updateRow(index, { age: event.target.value.replace(/\D/g, '') })}
                placeholder="Years"
                disabled={disabled}
              />
            </Field>
            {withPhone && (
              <Field label="Guest phone" hint="Optional; used for verification during the stay." className={cn('sm:col-span-2')}>
                <TextInput
                  value={row.phone ?? ''}
                  onChange={(event) => updateRow(index, { phone: event.target.value })}
                  placeholder="+91 …"
                  disabled={disabled}
                />
              </Field>
            )}
          </div>
        </div>
      ))}

      {rows.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-surface-300/60 p-6 text-center">
          <Users size={18} className="text-text-muted" />
          <p className="text-sm text-text-muted">No guests yet — add at least one.</p>
        </div>
      )}
    </div>
  )
}