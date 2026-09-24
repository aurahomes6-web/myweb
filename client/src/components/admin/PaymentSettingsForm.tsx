import type { FormEvent } from 'react'
import { ImagePlus, Loader2, Save, Upload, Wallet } from 'lucide-react'
import Button from '@/components/ui/Button'
import { DetailList, ErrorBanner, Field, TextInput } from '@/components/admin/AdminFormControls'
import { UPI_QR_FALLBACK_PATH } from '@/lib/paymentSettingsFormat'

interface SaveDetails {
  field: string
  message: string
}

export interface PaymentSettingsFormProps {
  /** UPI payee details (edit state lives in the parent). */
  upiName: string
  upiId: string
  upiPhone: string
  onUpiNameChange: (value: string) => void
  onUpiIdChange: (value: string) => void
  onUpiPhoneChange: (value: string) => void
  dirty: boolean
  saving: boolean
  saved: boolean
  saveError: string | null
  saveDetails?: SaveDetails[]
  onSave: (event: FormEvent<HTMLFormElement>) => void

  /** Active QR asset. */
  currentQrUrl: string
  qrSource: 'blob' | 'fallback'
  /** Object URL of a newly selected (not yet uploaded) image, if any. */
  qrPreviewUrl: string | null
  qrUploading: boolean
  qrError: string | null
  onSelectQrFile: (file: File | null) => void
  onUploadQr: () => void
}

/**
 * Admin form for the Direct-UPI payment settings shown on the public payment
 * page: payee name/id/phone (JSON save) plus the active QR asset (image upload
 * persisted to Vercel Blob). Presentational — the tab owns loading/saving state
 * so this can be rendered directly in tests.
 */
export function PaymentSettingsForm({
  upiName,
  upiId,
  upiPhone,
  onUpiNameChange,
  onUpiIdChange,
  onUpiPhoneChange,
  dirty,
  saving,
  saved,
  saveError,
  saveDetails,
  onSave,
  currentQrUrl,
  qrSource,
  qrPreviewUrl,
  qrUploading,
  qrError,
  onSelectQrFile,
  onUploadQr,
}: PaymentSettingsFormProps) {
  const previewUrl = qrPreviewUrl ?? currentQrUrl

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={onSave} className="card-surface flex flex-col gap-6 rounded-panel p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple/20 text-purple-bright">
            <Wallet size={17} />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-text-primary">UPI details</h2>
            <p className="mt-1 text-sm leading-relaxed text-text-muted">
              These values are shown on the customer payment page the moment you save.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <Field label="UPI Name">
            <TextInput
              value={upiName}
              onChange={(event) => {
                onUpiNameChange(event.target.value)
              }}
              placeholder="R BALAKUMARAN"
              autoComplete="off"
            />
          </Field>

          <Field label="UPI ID" hint="The handle@provider address customers copy to pay you.">
            <TextInput
              value={upiId}
              onChange={(event) => {
                onUpiIdChange(event.target.value)
              }}
              placeholder="9900662111@jupiteraxis"
              autoComplete="off"
            />
          </Field>

          <Field label="UPI Phone">
            <TextInput
              value={upiPhone}
              onChange={(event) => {
                onUpiPhoneChange(event.target.value)
              }}
              placeholder="+91 9900662111"
              autoComplete="off"
            />
          </Field>
        </div>

        {saved && (
          <div
            role="status"
            className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300"
          >
            UPI details saved.
          </div>
        )}
        {saveError && (
          <div>
            <ErrorBanner message={saveError} />
            <DetailList details={saveDetails} />
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving || !dirty}>
            <Save size={14} />
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          {!dirty && !saved && !saveError && (
            <span className="text-xs text-text-muted">No changes yet.</span>
          )}
        </div>
      </form>

      <div className="card-surface flex flex-col gap-6 rounded-panel p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-magenta/20 text-magenta-bright">
            <ImagePlus size={17} />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-text-primary">QR code</h2>
            <p className="mt-1 text-sm leading-relaxed text-text-muted">
              The QR customers scan to pay. Uploading replaces the active QR with the
              new image — the previous QR keeps working until the upload succeeds.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <div className="shrink-0 rounded-2xl border border-surface-300/60 bg-white p-3">
            <img
              src={previewUrl}
              alt="Current UPI QR preview"
              width={180}
              height={180}
              className="h-40 w-40 rounded-xl object-contain"
            />
          </div>

          <div className="flex w-full max-w-md flex-col gap-3">
            {qrSource === 'fallback' && !qrPreviewUrl && (
              <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs leading-relaxed text-amber-200">
                Currently using the built-in fallback QR from the site files. Upload a
                new QR to switch customers to a persistent, stored image.
              </p>
            )}
            {qrPreviewUrl && (
              <p className="rounded-xl border border-cyan/30 bg-cyan/10 px-4 py-3 text-xs leading-relaxed text-cyan-bright">
                New QR selected — it becomes active only after you press Upload.
              </p>
            )}

            <div className="flex flex-col gap-2.5">
              <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-surface-300/80 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-text-primary transition-colors hover:border-cyan/45 hover:text-cyan-bright">
                Choose a QR image
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                  className="hidden"
                  onChange={(event) => onSelectQrFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <Button
                variant="secondary"
                onClick={onUploadQr}
                disabled={!qrPreviewUrl || qrUploading}
                className="w-full"
              >
                {qrUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {qrUploading ? 'Uploading…' : 'Upload QR'}
              </Button>
            </div>
          </div>
        </div>

        {qrError && <ErrorBanner message={qrError} />}
        {qrSource === 'blob' && !qrPreviewUrl && !qrError && (
          <p className="text-xs text-text-muted">
            The stored QR is live on the payment page now.
            {currentQrUrl !== UPI_QR_FALLBACK_PATH ? ` Blob ref: ${currentQrUrl}` : ''}
          </p>
        )}
      </div>
    </div>
  )
}