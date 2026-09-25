import { useState, type FormEvent } from 'react'
import { Loader2, LogIn } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Field, TextInput } from '@/components/admin/AdminFormControls'
import { ManagerApiError, managerLogin } from '@/services/manager'

/**
 * Manager sign-in.
 *
 * The credentials are NOT compiled into this bundle: the form just posts them to
 * `POST /api/manager/login`, which verifies them against the `ManagerUser` table
 * (scrypt hash) and issues the `aura_manager_session` cookie.
 */
export function ManagerLogin({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    // Same guard as the admin sign-in: never send a half-filled form. A
    // whitespace-only password is treated as empty; a real password that merely
    // starts or ends with a space is sent unchanged.
    if (!username.trim() || !password.trim()) {
      setError('Enter both your username and password.')
      return
    }

    setSubmitting(true)
    try {
      await managerLogin(username.trim(), password)
      onLoggedIn()
    } catch (cause) {
      setError(loginError(cause))
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl">
            <img src="/logo.jpeg" alt="AURA HOMES" className="h-11 w-11 object-cover" />
          </div>
          <div>
            <p className="font-display text-base font-bold leading-none text-text-primary">
              AURA HOMES
            </p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.24em] text-text-muted">
              Manager
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="glass rounded-3xl p-6 shadow-card sm:p-7">
          <h1 className="font-display text-xl font-semibold text-text-primary">Sign in</h1>
          <p className="mt-1.5 text-sm text-text-muted">
            Sign in to open today&apos;s cleaning checklist.
          </p>

          <div className="mt-6 flex flex-col gap-4">
            <Field label="Username">
              <TextInput
                aria-label="Manager username"
                value={username}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(event) => setUsername(event.target.value)}
              />
            </Field>
            <Field label="Password">
              <TextInput
                aria-label="Manager password"
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
          </div>

          {error ? (
            <p role="alert" className="mt-4 rounded-xl border border-magenta/40 bg-magenta/10 px-4 py-3 text-sm text-magenta-bright">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="sm" className="mt-6 w-full justify-center py-3" disabled={submitting}>
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  )
}

function loginError(error: unknown): string {
  if (error instanceof ManagerApiError) {
    if (error.status === 401) return 'Invalid username or password.'
    if (error.status === 503) return 'Manager access is not set up yet. Please contact the admin.'
    if (error.status >= 500) return 'Could not sign in right now. Please try again.'
    return error.message
  }
  if (error instanceof TypeError) return 'Could not reach the server. Check your connection.'
  return 'Something went wrong. Please try again.'
}
