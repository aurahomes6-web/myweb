import type { FormEvent } from 'react'
import { ImagePlus, Loader2, RotateCcw, Save } from 'lucide-react'
import PropertyVisual from '@/components/visuals/PropertyVisual'
import Button from '@/components/ui/Button'
import {
  DetailList,
  ErrorBanner,
  Field,
  TextInput,
} from '@/components/admin/AdminFormControls'

export interface HomepageVisualFormProps {
  visualImageUrl: string | null
  visualImageAlt: string
  visualSource: 'custom' | 'fallback'
  onVisualImageAltChange: (value: string) => void
  dirty: boolean
  saving: boolean
  saved: boolean
  saveError: string | null
  saveDetails?: Array<{ field: string; message: string }>
  onSave: (event: FormEvent<HTMLFormElement>) => void
  uploading: boolean
  resetting: boolean
  successMessage: string | null
  operationError: string | null
  onUpload: (file: File) => void
  onReset: () => void
}

export function HomepageVisualForm({
  visualImageUrl,
  visualImageAlt,
  visualSource,
  onVisualImageAltChange,
  dirty,
  saving,
  saved,
  saveError,
  saveDetails,
  onSave,
  uploading,
  resetting,
  successMessage,
  operationError,
  onUpload,
  onReset,
}: HomepageVisualFormProps) {
  const busy = uploading || resetting || saving

  return (
    <form onSubmit={onSave} className="card-surface flex flex-col gap-7 rounded-panel p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple/20 text-purple-bright">
          <ImagePlus size={17} />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold text-text-primary">Homepage Visual</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-muted">
            This image is displayed on the homepage and is independent of individual property images.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="w-full max-w-xs shrink-0">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Current Image Preview
          </p>
          <div className="aspect-[4/5] overflow-hidden rounded-2xl border border-surface-300/60 bg-surface-100/30">
            <PropertyVisual
              image={visualImageUrl}
              accent="purple"
              variant="moon"
              label={visualImageAlt}
            />
          </div>
          <p className="mt-2 text-xs text-text-muted">
            {visualSource === 'custom'
              ? 'Your uploaded image is live on the homepage.'
              : 'Using the built-in homepage artwork.'}
          </p>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="rounded-2xl border border-surface-300/40 bg-surface-100/20 p-4">
            <p className="text-sm font-semibold text-text-primary">Homepage image</p>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">
              Upload a JPEG, PNG, WebP, GIF or AVIF image up to 10 MB. The previous image stays
              active until the replacement is ready.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <label
                className={`inline-flex cursor-pointer items-center gap-2 rounded-full border border-surface-300/80 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-text-primary transition-colors hover:border-purple/50 hover:text-purple-bright ${
                  busy ? 'pointer-events-none opacity-50' : ''
                }`}
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                {uploading
                  ? 'Uploading…'
                  : visualSource === 'custom'
                    ? 'Replace Image'
                    : 'Upload Image'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                  className="hidden"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0] ?? null
                    event.currentTarget.value = ''
                    if (file) onUpload(file)
                  }}
                />
              </label>
              {visualSource === 'custom' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onReset}
                  disabled={busy}
                  className="text-rose-300 hover:bg-rose-400/10 hover:text-rose-200"
                >
                  {resetting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  {resetting ? 'Resetting…' : 'Reset Image'}
                </Button>
              )}
            </div>
          </div>

          <Field
            label="Image Alt Text"
            hint="Describe the homepage image for people using screen readers. Maximum 160 characters."
          >
            <TextInput
              value={visualImageAlt}
              maxLength={160}
              required
              autoComplete="off"
              placeholder="Rooftop terrace suite"
              disabled={busy}
              onChange={(event) => onVisualImageAltChange(event.target.value)}
            />
          </Field>

          {successMessage && (
            <div
              role="status"
              className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300"
            >
              {successMessage}
            </div>
          )}
          {operationError && <ErrorBanner message={operationError} />}
          {saveError && (
            <div>
              <ErrorBanner message={saveError} />
              <DetailList details={saveDetails} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy || !dirty}>
              <Save size={14} />
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
            {saved && !dirty && <span className="text-xs text-text-muted">Your changes are live.</span>}
            {!dirty && !saved && !successMessage && (
              <span className="text-xs text-text-muted">No changes yet.</span>
            )}
          </div>
        </div>
      </div>
    </form>
  )
}
