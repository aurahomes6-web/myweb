import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import type { AdminPaymentSettings } from '@/types/admin'
import {
  AdminApiError,
  fetchAdminPaymentSettings,
  updateAdminPaymentSettings,
  uploadAdminPaymentQr,
} from '@/services/admin'
import { PaymentSettingsForm } from '@/components/admin/PaymentSettingsForm'
import Button from '@/components/ui/Button'

type LoadState = 'loading' | 'error' | 'ready'

export function PaymentSettingsTab() {
  const [state, setState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<AdminPaymentSettings | null>(null)

  const [upiName, setUpiName] = useState('')
  const [upiId, setUpiId] = useState('')
  const [upiPhone, setUpiPhone] = useState('')

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveDetails, setSaveDetails] = useState<Array<{ field: string; message: string }>>()

  const [qrUploading, setQrUploading] = useState(false)
  const [qrError, setQrError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null)
  const pendingPreviewRef = useRef<string | null>(null)

  const dirty =
    loaded !== null &&
    (upiName.trim() !== loaded.upiName ||
      upiId.trim() !== loaded.upiId ||
      upiPhone.trim() !== loaded.upiPhone)

  function applySettings(settings: AdminPaymentSettings) {
    setLoaded(settings)
    setUpiName(settings.upiName)
    setUpiId(settings.upiId)
    setUpiPhone(settings.upiPhone)
    setSaved(false)
    setState('ready')
  }

  function revokePreview() {
    if (pendingPreviewRef.current) {
      URL.revokeObjectURL(pendingPreviewRef.current)
      pendingPreviewRef.current = null
    }
  }

  function handleSelectQrFile(file: File | null) {
    revokePreview()
    setQrError(null)
    if (!file) {
      setSelectedFile(null)
      setQrPreviewUrl(null)
      return
    }
    setSelectedFile(file)
    const objectUrl = URL.createObjectURL(file)
    pendingPreviewRef.current = objectUrl
    setQrPreviewUrl(objectUrl)
  }

  async function handleUploadQr() {
    if (!selectedFile || qrUploading) return
    setQrUploading(true)
    setQrError(null)
    try {
      const settings = await uploadAdminPaymentQr(selectedFile)
      // The stored settings now point at the new Blob QR — make it the current one.
      applySettings(settings)
      revokePreview()
      pendingPreviewRef.current = null
      setSelectedFile(null)
      setQrPreviewUrl(null)
    } catch (err) {
      setQrError(
        err instanceof AdminApiError ? err.message : 'The QR image could not be uploaded. Please try again.'
      )
    } finally {
      setQrUploading(false)
    }
  }

  async function load() {
    setState('loading')
    setLoadError(null)
    try {
      applySettings(await fetchAdminPaymentSettings())
    } catch (err) {
      setState('error')
      setLoadError(err instanceof AdminApiError ? err.message : 'Failed to load payment settings.')
    }
  }

  useEffect(() => {
    let cancelled = false
    fetchAdminPaymentSettings()
      .then((settings) => {
        if (!cancelled) applySettings(settings)
      })
      .catch((err) => {
        if (cancelled) return
        setState('error')
        setLoadError(err instanceof AdminApiError ? err.message : 'Failed to load payment settings.')
      })
    return () => {
      cancelled = true
      revokePreview()
    }
  }, [])

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaveDetails(undefined)
    setSaved(false)
    try {
      const settings = await updateAdminPaymentSettings({
        upiName: upiName.trim(),
        upiId: upiId.trim(),
        upiPhone: upiPhone.trim(),
      })
      applySettings(settings)
      setSaved(true)
    } catch (err) {
      if (err instanceof AdminApiError) {
        setSaveError(err.message)
        setSaveDetails(err.details)
      } else {
        setSaveError('The payment settings could not be saved.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-purple-bright">
          Payment Settings
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-text-primary">
          UPI payment details
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          The payee name, UPI ID, phone and QR code shown on the customer payment page.
          Changes apply to the website immediately.
        </p>
      </div>

      {state === 'loading' && (
        <div className="flex items-center justify-center gap-3 py-20 text-text-muted">
          <Loader2 size={20} className="animate-spin" />
          Loading payment settings…
        </div>
      )}

      {state === 'error' && (
        <div className="card-surface flex flex-col items-center gap-3 rounded-panel px-6 py-16 text-center">
          <p className="font-display text-lg font-semibold text-text-primary">
            Could not load payment settings
          </p>
          <p className="max-w-md text-sm text-text-muted">{loadError}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void load()
            }}
          >
            Try again
          </Button>
        </div>
      )}

      {state === 'ready' && loaded && (
        <PaymentSettingsForm
          upiName={upiName}
          upiId={upiId}
          upiPhone={upiPhone}
          onUpiNameChange={setUpiName}
          onUpiIdChange={setUpiId}
          onUpiPhoneChange={setUpiPhone}
          dirty={dirty}
          saving={saving}
          saved={saved}
          saveError={saveError}
          saveDetails={saveDetails}
          onSave={handleSave}
          currentQrUrl={loaded.qrCodeUrl}
          qrSource={loaded.qrSource}
          qrPreviewUrl={qrPreviewUrl}
          qrUploading={qrUploading}
          qrError={qrError}
          onSelectQrFile={handleSelectQrFile}
          onUploadQr={() => void handleUploadQr()}
        />
      )}
    </div>
  )
}