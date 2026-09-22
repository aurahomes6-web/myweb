import { useRef, useState } from 'react'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import type { AdminImageSlot, AdminPropertyImage } from '@/types/admin'
import {
  AdminApiError,
  deleteAdminPropertyImage,
  uploadAdminPropertyImage,
} from '@/services/admin'
import { ErrorBanner } from '@/components/admin/AdminFormControls'

/**
 * Admin photo management for one home (Phase 5).
 *
 * Uploads go to the EXISTING endpoint as multipart/form-data:
 *   POST   /api/admin/properties/:id/images   { image, slot, alt? }
 *   DELETE /api/admin/properties/:id/images/:imageId
 *
 * `main` / `sub1`–`sub3` are single-owned slots (a new upload replaces the old
 * one); `extra` keeps an ordered list. All changes persist through the backend
 * object-storage provider. Deleting/uploading never changes the Prisma schema
 * or the property row itself.
 */

const SLOT_KIND: Record<Exclude<AdminImageSlot, 'extra'>, string> = {
  main: 'MAIN',
  sub1: 'SUB1',
  sub2: 'SUB2',
  sub3: 'SUB3',
}

const SINGLE_SLOTS: Exclude<AdminImageSlot, 'extra'>[] = ['main', 'sub1', 'sub2', 'sub3']
const EXTRA_KIND = 'EXTRA'

const SLOT_LABELS: Record<AdminImageSlot, string> = {
  main: 'Main image',
  sub1: 'Sub image 1',
  sub2: 'Sub image 2',
  sub3: 'Sub image 3',
  extra: 'Extra images (optional)',
}

interface PropertyImageManagerProps {
  propertyId: string
  images: AdminPropertyImage[]
}

export function PropertyImageManager({ propertyId, images: initialImages }: PropertyImageManagerProps) {
  const [images, setImages] = useState<AdminPropertyImage[]>(initialImages)
  const [busySlot, setBusySlot] = useState<AdminImageSlot | null>(null)
  const [busyDeleteId, setBusyDeleteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [nextSlot, setNextSlot] = useState<AdminImageSlot>('main')

  function imageForKind(kind: string): AdminPropertyImage | undefined {
    return images.find((img) => img.kind === kind)
  }

  const extraImages = images
    .filter((img) => img.kind === EXTRA_KIND)
    .sort((a, b) => a.sort - b.sort)

  async function handleUpload(slot: AdminImageSlot, file: File, alt = '') {
    setBusySlot(slot)
    setError(null)
    try {
      const uploaded = await uploadAdminPropertyImage(propertyId, slot, file, alt)
      if (slot === 'extra') {
        setImages((prev) => [...prev, uploaded])
      } else {
        const kind = SLOT_KIND[slot]
        setImages((prev) => [...prev.filter((img) => img.kind !== kind), uploaded])
      }
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message)
      } else {
        setError('The image could not be uploaded. Try a JPEG, PNG, WebP, GIF or AVIF file under 10 MB.')
      }
    } finally {
      setBusySlot(null)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function handleDelete(image: AdminPropertyImage) {
    setBusyDeleteId(image.id)
    setError(null)
    try {
      await deleteAdminPropertyImage(propertyId, image.id)
      setImages((prev) => prev.filter((img) => img.id !== image.id))
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message)
      } else {
        setError('The image could not be removed.')
      }
    } finally {
      setBusyDeleteId(null)
    }
  }

  function requestFor(slot: AdminImageSlot) {
    setNextSlot(slot)
    fileInput.current?.click()
  }

  const slotThumb = (slot: Exclude<AdminImageSlot, 'extra'>) => {
    const kind = SLOT_KIND[slot]
    const label = SLOT_LABELS[slot]
    const image = imageForKind(kind)
    return (
      <div className="flex items-center gap-3">
        {image ? (
          <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-xl border border-surface-300/40">
            <img src={image.url} alt={image.alt || label} className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-xl border border-dashed border-surface-300/40 bg-surface-100/30 text-[10px] uppercase tracking-[0.12em] text-text-muted/60">
            No photo
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold text-text-primary">{label}</p>
          <p className="mt-0.5 text-[11px] text-text-muted">
            {image ? 'Click Replace to upload a new photo.' : 'Upload a photo to show live.'}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={busySlot !== null}
              onClick={() => requestFor(slot)}
              className="inline-flex items-center gap-1.5 rounded-full border border-surface-300/70 px-3 py-1 text-[11px] font-semibold text-text-secondary transition-colors hover:border-purple/50 hover:text-text-primary disabled:opacity-50"
            >
              {busySlot === slot ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
              {image ? 'Replace' : 'Upload'}
            </button>
            {image && (
              <button
                type="button"
                disabled={busyDeleteId !== null}
                onClick={() => void handleDelete(image)}
                className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 px-3 py-1 text-[11px] font-semibold text-rose-300 transition-colors hover:border-rose-400/60 hover:bg-rose-400/10 disabled:opacity-50"
              >
                {busyDeleteId === image.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-magenta-bright">Photos</p>
        <p className="mt-1 text-sm text-text-muted">
          Uploaded photos replace the static artwork on the public gallery. Main and sub slots hold one
          image each; uploads to “Extra images” are appended in order.
        </p>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void handleUpload(nextSlot, file)
        }}
      />

      {error && <ErrorBanner message={error} />}

      <div className="grid gap-4">
        {SINGLE_SLOTS.map((slot) => (
          <div key={slot} className="rounded-2xl border border-surface-300/40 bg-surface-100/20 p-4">
            {slotThumb(slot)}
          </div>
        ))}

        <div className="rounded-2xl border border-surface-300/40 bg-surface-100/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {extraImages.length === 0 && (
                <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-xl border border-dashed border-surface-300/40 bg-surface-100/30 text-[10px] uppercase tracking-[0.12em] text-text-muted/60">
                  No photos
                </div>
              )}
              {extraImages.map((image) => (
                <div key={image.id} className="group relative h-16 w-24 shrink-0 overflow-hidden rounded-xl border border-surface-300/40">
                  <img src={image.url} alt={image.alt || 'Extra property photo'} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label={`Remove ${image.alt || 'extra photo'}`}
                    disabled={busyDeleteId !== null}
                    onClick={() => void handleDelete(image)}
                    className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-rose-500/80 text-ink opacity-0 transition-opacity hover:bg-rose-500 group-hover:opacity-100 disabled:opacity-40"
                  >
                    {busyDeleteId === image.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={busySlot !== null}
              onClick={() => requestFor('extra')}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-surface-300/70 px-3 py-1 text-[11px] font-semibold text-text-secondary transition-colors hover:border-purple/50 hover:text-text-primary disabled:opacity-50"
            >
              {busySlot === 'extra' ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
              Add extra photo
            </button>
          </div>
          <p className="mt-3 text-xs text-text-muted">Optional. Extra photos are appended after the main/sub images.</p>
        </div>
      </div>
    </div>
  )
}