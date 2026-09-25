import { useEffect, useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import type { AdminHomepageSettings } from '@/types/admin'
import {
  AdminApiError,
  fetchAdminHomepageSettings,
  resetAdminHomepageVisual,
  updateAdminHomepageSettings,
  uploadAdminHomepageVisual,
} from '@/services/admin'
import { HomepageVisualForm } from '@/components/admin/HomepageVisualForm'
import Button from '@/components/ui/Button'

type LoadState = 'loading' | 'error' | 'ready'

export function HomepageSettingsTab() {
  const [state, setState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [settings, setSettings] = useState<AdminHomepageSettings | null>(null)
  const [visualImageAlt, setVisualImageAlt] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveDetails, setSaveDetails] = useState<Array<{ field: string; message: string }>>()
  const [uploading, setUploading] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)

  const dirty = settings !== null && visualImageAlt.trim() !== settings.visualImageAlt

  function applySettings(next: AdminHomepageSettings) {
    setSettings(next)
    setVisualImageAlt(next.visualImageAlt)
    setState('ready')
  }

  async function load() {
    setState('loading')
    setLoadError(null)
    try {
      applySettings(await fetchAdminHomepageSettings())
    } catch (error) {
      setState('error')
      setLoadError(
        error instanceof AdminApiError ? error.message : 'Failed to load homepage settings.'
      )
    }
  }

  useEffect(() => {
    let active = true
    fetchAdminHomepageSettings()
      .then((next) => {
        if (active) applySettings(next)
      })
      .catch((error) => {
        if (!active) return
        setState('error')
        setLoadError(
          error instanceof AdminApiError ? error.message : 'Failed to load homepage settings.'
        )
      })
    return () => {
      active = false
    }
  }, [])

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    if (!dirty || saving) return
    setSaving(true)
    setSaved(false)
    setSaveError(null)
    setSaveDetails(undefined)
    setSuccessMessage(null)
    setOperationError(null)
    try {
      const next = await updateAdminHomepageSettings(visualImageAlt.trim())
      applySettings(next)
      setSaved(true)
      setSuccessMessage('Homepage visual alt text saved.')
    } catch (error) {
      if (error instanceof AdminApiError) {
        setSaveError(error.message)
        setSaveDetails(error.details)
      } else {
        setSaveError('The homepage visual alt text could not be saved.')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleUpload(file: File) {
    if (uploading || resetting) return
    setUploading(true)
    setSuccessMessage(null)
    setOperationError(null)
    setSaveError(null)
    setSaveDetails(undefined)
    setSaved(false)
    try {
      const next = await uploadAdminHomepageVisual(file)
      setSettings(next)
      setSuccessMessage('Homepage visual uploaded successfully.')
    } catch (error) {
      setOperationError(
        error instanceof AdminApiError
          ? error.message
          : 'The homepage visual could not be uploaded. Please try again.'
      )
    } finally {
      setUploading(false)
    }
  }

  async function handleReset() {
    if (resetting || uploading) return
    setResetting(true)
    setSuccessMessage(null)
    setOperationError(null)
    setSaveError(null)
    setSaveDetails(undefined)
    setSaved(false)
    try {
      const next = await resetAdminHomepageVisual()
      setSettings(next)
      setSuccessMessage('Homepage visual reset to the built-in artwork.')
    } catch (error) {
      setOperationError(
        error instanceof AdminApiError
          ? error.message
          : 'The homepage visual could not be reset.'
      )
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-purple-bright">
          Homepage Settings
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-text-primary">
          Homepage Visual
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">
          Manage the image shown in the homepage hero. Changes apply to the website immediately.
        </p>
      </div>

      {state === 'loading' && (
        <div className="flex items-center justify-center gap-3 py-20 text-text-muted">
          <Loader2 size={20} className="animate-spin" />
          Loading homepage settings…
        </div>
      )}

      {state === 'error' && (
        <div className="card-surface flex flex-col items-center gap-3 rounded-panel px-6 py-16 text-center">
          <p className="font-display text-lg font-semibold text-text-primary">
            Could not load homepage settings
          </p>
          <p className="max-w-md text-sm text-text-muted">{loadError}</p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      )}

      {state === 'ready' && settings && (
        <HomepageVisualForm
          visualImageUrl={settings.visualImageUrl}
          visualImageAlt={visualImageAlt}
          visualSource={settings.visualSource}
          onVisualImageAltChange={(value) => {
            setVisualImageAlt(value)
            setSaved(false)
            setSuccessMessage(null)
            setSaveError(null)
            setSaveDetails(undefined)
          }}
          dirty={dirty}
          saving={saving}
          saved={saved}
          saveError={saveError}
          saveDetails={saveDetails}
          onSave={handleSave}
          uploading={uploading}
          resetting={resetting}
          successMessage={successMessage}
          operationError={operationError}
          onUpload={(file) => void handleUpload(file)}
          onReset={() => void handleReset()}
        />
      )}
    </div>
  )
}
