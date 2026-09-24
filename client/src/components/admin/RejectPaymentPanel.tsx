import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { Field, TextArea } from '@/components/admin/AdminFormControls'

const MAX_REASON_LENGTH = 500

export function RejectPaymentPanel({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean
  onCancel: () => void
  onConfirm: (rejectionMessage?: string) => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleConfirm() {
    const trimmed = reason.trim()
    if (trimmed.length > MAX_REASON_LENGTH) {
      setError(`Keep the reason under ${MAX_REASON_LENGTH} characters.`)
      return
    }
    onConfirm(trimmed || undefined)
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Field
        label="Rejection reason (optional)"
        hint="Shown to the customer on their confirmation page and booking tracker."
        error={error ?? undefined}
      >
        <TextArea
          value={reason}
          maxLength={MAX_REASON_LENGTH}
          disabled={busy}
          placeholder="e.g. We could not find a transfer matching this UTR."
          onChange={(event) => {
            setReason(event.target.value)
            setError(null)
          }}
        />
      </Field>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 px-4 py-2 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-400/10 disabled:opacity-50"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
          Confirm rejection
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full border border-surface-300/70 px-4 py-2 text-xs font-semibold text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}