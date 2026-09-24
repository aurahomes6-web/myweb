import { useEffect, useState, type FormEvent } from 'react'
import { Loader2, Save } from 'lucide-react'
import type { AdminContactSettings } from '@/types/admin'
import { AdminApiError, fetchAdminContactSettings, updateAdminContactSettings } from '@/services/admin'
import { DetailList, ErrorBanner, Field, TextArea, TextInput } from '@/components/admin/AdminFormControls'
import Button from '@/components/ui/Button'

type ContactLoad = 'loading' | 'error' | 'ready'

export function ContactTab() {
  const [state, setState] = useState<ContactLoad>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)

  const [loaded, setLoaded] = useState<AdminContactSettings | null>(null)
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [description, setDescription] = useState('')

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveDetails, setSaveDetails] = useState<Array<{ field: string; message: string }>>()

  const dirty =
    loaded !== null &&
    (email.trim() !== loaded.email ||
      phone.trim() !== loaded.phone ||
      description.trim() !== loaded.description)

  function applyContact(contact: AdminContactSettings) {
    setLoaded(contact)
    setEmail(contact.email)
    setPhone(contact.phone)
    setDescription(contact.description)
    setSaved(false)
    setState('ready')
  }

  async function load() {
    setState('loading')
    setLoadError(null)
    try {
      applyContact(await fetchAdminContactSettings())
    } catch (err) {
      setState('error')
      setLoadError(err instanceof AdminApiError ? err.message : 'Failed to load contact settings.')
    }
  }

  useEffect(() => {
    let cancelled = false
    fetchAdminContactSettings()
      .then((contact) => {
        if (!cancelled) applyContact(contact)
      })
      .catch((err) => {
        if (cancelled) return
        setState('error')
        setLoadError(err instanceof AdminApiError ? err.message : 'Failed to load contact settings.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaveDetails(undefined)
    setSaved(false)
    try {
      const contact = await updateAdminContactSettings({
        email: email.trim(),
        phone: phone.trim(),
        description: description.trim(),
      })
      setLoaded(contact)
      setEmail(contact.email)
      setPhone(contact.phone)
      setDescription(contact.description)
      setSaved(true)
    } catch (err) {
      if (err instanceof AdminApiError) {
        setSaveError(err.message)
        setSaveDetails(err.details)
      } else {
        setSaveError('The contact settings could not be saved.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-purple-bright">
          Contact
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-text-primary">
          Contact information
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          These details power the CONTACT section of the public footer. Changes appear on the
          website immediately.
        </p>
      </div>

      {state === 'loading' && (
        <div className="flex items-center justify-center gap-3 py-20 text-text-muted">
          <Loader2 size={20} className="animate-spin" />
          Loading contact settings…
        </div>
      )}

      {state === 'error' && (
        <div className="card-surface flex flex-col items-center gap-3 rounded-panel px-6 py-16 text-center">
          <p className="font-display text-lg font-semibold text-text-primary">
            Could not load contact settings
          </p>
          <p className="max-w-md text-sm text-text-muted">{loadError}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setState('loading')
              setLoadError(null)
              void load()
            }}
          >
            Try again
          </Button>
        </div>
      )}

      {state === 'ready' && (
        <form onSubmit={handleSave} className="card-surface flex flex-col gap-6 rounded-panel p-6">
          <div className="flex flex-col gap-5">
            <Field label="Email">
              <TextInput
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  setSaved(false)
                }}
                placeholder="stay@aurahomes.com"
                type="email"
                autoComplete="off"
              />
            </Field>

            <Field label="Phone">
              <TextInput
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value)
                  setSaved(false)
                }}
                placeholder="+91 00000 00000"
                autoComplete="off"
              />
            </Field>

            <Field label="Description">
              <TextArea
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value)
                  setSaved(false)
                }}
                placeholder="Premium penthouse locations"
              />
            </Field>
          </div>

          {saved && (
            <div
              role="status"
              className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300"
            >
              Contact settings saved.
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
      )}
    </div>
  )
}