import { useState, type FormEvent } from 'react'
import { Lock, ShieldCheck } from 'lucide-react'
import Button from '@/components/ui/Button'
import { ErrorBanner, Field, TextInput } from '@/components/admin/AdminFormControls'
import { AdminApiError, adminLogin } from '@/services/admin'

interface AdminLoginProps {
  onLoggedIn: () => void
}

export function AdminLogin({ onLoggedIn }: AdminLoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!username.trim() || !password) {
      setError('Enter both your username and password.')
      return
    }
    setSubmitting(true)
    try {
      await adminLogin(username.trim(), password)
      onLoggedIn()
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : 'Unable to sign in right now. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-5">
      <div className="w-full max-w-md">
        <div className="card-surface flex flex-col rounded-panel p-8 sm:p-10">
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-purple/25 to-cyan/25">
              <ShieldCheck size={26} className="text-purple-bright" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-purple-bright">AURA HOMES</p>
              <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-text-primary">Admin Sign In</h1>
            </div>
          </div>

          {error && <div className="mb-6"><ErrorBanner message={error} /></div>}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <Field label="Username">
              <TextInput
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoFocus
                disabled={submitting}
              />
            </Field>
            <Field label="Password">
              <TextInput
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                disabled={submitting}
              />
            </Field>
            <Button type="submit" size="lg" disabled={submitting} className="mt-2">
              <Lock size={15} />
              {submitting ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs leading-relaxed text-text-muted">
            Admin credentials are configured by the site owner. This page is never linked from the public site.
          </p>
        </div>
      </div>
    </div>
  )
}