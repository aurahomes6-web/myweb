import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, ChevronLeft, Loader2, LogOut, MessageCircle, Send } from 'lucide-react'
import Button from '@/components/ui/Button'
import { TextArea } from '@/components/admin/AdminFormControls'
import {
  ManagerApiError,
  fetchManagerChecklist,
  fetchManagerConfig,
  fetchManagerProperties,
  managerLogout,
  prepareManagerReport,
  setManagerChecklistCompletion,
} from '@/services/manager'
import { MAX_MANAGER_REPORT_LENGTH } from '@/components/admin/managerLimits'
import { cn } from '@/lib/cn'
import type { ManagerChecklist, ManagerProperty } from '@/types/manager'

/**
 * The manager panel — a phone-first operational screen.
 *
 * Order of the screen: property → today's checklist → progress → tasks → report
 * to admin → log out. No admin-style tables, large touch targets, and the only
 * data it can reach comes from the manager-only API.
 */
export function ManagerApp({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [properties, setProperties] = useState<ManagerProperty[]>([])
  const [propertyId, setPropertyId] = useState('')
  const [checklist, setChecklist] = useState<ManagerChecklist | null>(null)
  const [whatsappConfigured, setWhatsappConfigured] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingItemId, setPendingItemId] = useState<string | null>(null)
  const [report, setReport] = useState('')
  const [reportError, setReportError] = useState<string | null>(null)
  const [sendingReport, setSendingReport] = useState(false)

  const loadChecklist = useCallback(async (id: string) => {
    if (!id) {
      setChecklist(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setChecklist(await fetchManagerChecklist(id))
    } catch (cause) {
      setError(message(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([fetchManagerProperties(), fetchManagerConfig()])
      .then(([list, config]) => {
        if (!active) return
        setProperties(list)
        setWhatsappConfigured(config.whatsappConfigured)
        setPropertyId(list[0]?.id ?? '')
      })
      .catch((cause: unknown) => {
        if (!active) return
        setError(message(cause))
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    void loadChecklist(propertyId)
  }, [propertyId, loadChecklist])

  async function toggleItem(itemId: string, nextValue: boolean) {
    if (!checklist) return
    const previous = checklist
    // Optimistic tick: the box reacts instantly on a phone.
    setChecklist({
      ...checklist,
      items: checklist.items.map((item) =>
        item.id === itemId ? { ...item, isCompleted: nextValue } : item
      ),
      progress: withProgress(checklist, nextValue),
    })
    setPendingItemId(itemId)
    try {
      await setManagerChecklistCompletion(propertyId, itemId, nextValue, checklist.dateKey)
    } catch (cause) {
      setChecklist(previous)
      setError(message(cause))
    } finally {
      setPendingItemId(null)
    }
  }

  async function handleReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = report.trim()
    if (!text) {
      setReportError('Describe the issue before sending.')
      return
    }
    if (!propertyId) {
      setReportError('Choose a property first.')
      return
    }

    setSendingReport(true)
    setReportError(null)
    try {
      const prepared = await prepareManagerReport(propertyId, text)
      // Opens the AURA HOMES WhatsApp conversation with the report pre-filled.
      // The manager still taps send; nothing here claims it was delivered.
      window.open(prepared.url, '_blank', 'noopener,noreferrer')
      setReport('')
    } catch (cause) {
      setReportError(message(cause))
    } finally {
      setSendingReport(false)
    }
  }

  async function handleLogout() {
    try {
      await managerLogout()
    } catch {
      // Clearing local state below is enough even if the call fails.
    }
    onLoggedOut()
  }

  const progress = checklist?.progress ?? { total: 0, completed: 0, remaining: 0, percent: 0 }
  const allDone = progress.total > 0 && progress.completed === progress.total

  return (
    <div className="min-h-screen bg-surface pb-16">
      <header className="sticky top-0 z-20 border-b border-surface-300/40 bg-surface/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl">
              <img src="/logo.jpeg" alt="AURA HOMES" className="h-9 w-9 object-cover" />
            </div>
            <div>
              <p className="font-display text-sm font-bold leading-none text-text-primary">
                AURA HOMES
              </p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.24em] text-text-muted">
                Manager Checklist
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void handleLogout()} aria-label="Log out">
            <LogOut size={15} />
          </Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-5 py-6">
        {/* 1 — property selection */}
        <section className="flex flex-col gap-3">
          <h1 className="font-display text-lg font-semibold text-text-primary">Properties</h1>
          <div className="grid grid-cols-1 gap-3">
            {properties.map((property) => {
              const active = property.id === propertyId
              return (
                <button
                  key={property.id}
                  type="button"
                  onClick={() => setPropertyId(property.id)}
                  aria-pressed={active}
                  className={cn(
                    'flex min-h-16 items-center justify-between gap-3 rounded-2xl border px-5 py-4 text-left transition-colors',
                    active
                      ? 'border-purple/50 bg-purple/15'
                      : 'border-surface-300/45 bg-surface-100/35'
                  )}
                >
                  <span className="font-display text-base font-semibold text-text-primary">
                    {property.name}
                  </span>
                  {active ? <CheckCircle2 size={20} className="shrink-0 text-purple-bright" /> : null}
                </button>
              )
            })}
          </div>
        </section>

        {error ? (
          <p role="alert" className="rounded-xl border border-magenta/40 bg-magenta/10 px-4 py-3 text-sm text-magenta-bright">
            {error}
          </p>
        ) : null}

        {/* 2 + 3 — today's checklist and progress */}
        <AnimatePresence mode="wait">
          {checklist ? (
            <motion.section
              key={checklist.propertyId}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="glass rounded-3xl p-5 shadow-card"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-lg font-semibold break-words text-text-primary">
                  {checklist.propertyName}
                </h2>
                {propertyId !== properties[0]?.id ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPropertyId(properties[0]?.id ?? '')}
                    aria-label="Back to first property"
                  >
                    <ChevronLeft size={15} />
                  </Button>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-text-muted">
                Today's checklist · {checklist.dateKey}
              </p>

              <div className="mt-5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-display text-2xl font-semibold text-text-primary">
                    {progress.completed} / {progress.total}
                  </p>
                  <p className="text-sm text-text-muted">
                    {progress.remaining} left · {progress.percent}%
                  </p>
                </div>
                <div
                  className="mt-2 h-3 w-full overflow-hidden rounded-full bg-surface-300/40"
                  role="progressbar"
                  aria-valuenow={progress.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Checklist progress: ${progress.completed} of ${progress.total} completed`}
                >
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-purple to-cyan"
                    initial={false}
                    animate={{ width: `${progress.percent}%` }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
                {allDone ? (
                  <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-cyan-bright">
                    <CheckCircle2 size={16} />
                    All tasks completed for {checklist.propertyName}.
                  </p>
                ) : null}
              </div>

              {/* 4 — tasks */}
              {checklist.items.length === 0 ? (
                <p className="mt-5 rounded-2xl border border-surface-300/40 bg-surface-100/30 p-4 text-sm text-text-muted">
                  No tasks are configured for this property yet. Please contact the admin.
                </p>
              ) : (
                <ul className="mt-5 flex flex-col gap-2.5">
                  {checklist.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => void toggleItem(item.id, !item.isCompleted)}
                        disabled={pendingItemId === item.id}
                        aria-pressed={item.isCompleted}
                        className={cn(
                          'flex w-full min-h-16 items-center gap-4 rounded-2xl border px-4 py-4 text-left transition-colors',
                          item.isCompleted
                            ? 'border-cyan/45 bg-cyan/10'
                            : 'border-surface-300/45 bg-surface-100/35'
                        )}
                      >
                        <span
                          className={cn(
                            'grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2',
                            item.isCompleted
                              ? 'border-cyan bg-cyan/25 text-cyan-bright'
                              : 'border-surface-300'
                          )}
                        >
                          {pendingItemId === item.id ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : item.isCompleted ? (
                            <CheckCircle2 size={17} />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              'block break-words text-base font-semibold',
                              item.isCompleted ? 'text-text-muted line-through' : 'text-text-primary'
                            )}
                          >
                            {item.title}
                          </span>
                          {item.description ? (
                            <span className="mt-0.5 block break-words text-xs text-text-muted">
                              {item.description}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </motion.section>
          ) : loading ? (
            <div className="glass flex items-center justify-center gap-3 rounded-3xl p-10 text-sm text-text-muted">
              <Loader2 size={18} className="animate-spin" />
              Loading today&apos;s checklist…
            </div>
          ) : null}
        </AnimatePresence>

        {/* 5 — report to admin */}
        <section className="glass rounded-3xl p-5 shadow-card">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-text-primary">
            <MessageCircle size={18} className="text-cyan-bright" />
            Report to admin
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            {whatsappConfigured
              ? 'Opens WhatsApp with your message ready to send.'
              : 'WhatsApp is not set up yet, so reports cannot be sent right now.'}
          </p>

          <form onSubmit={handleReport} className="mt-4 flex flex-col gap-3">
            <TextArea
              aria-label="Report to admin"
              value={report}
              maxLength={MAX_MANAGER_REPORT_LENGTH}
              placeholder="Describe any issue, damage, missing item or maintenance problem…"
              onChange={(event) => {
                setReport(event.target.value)
                if (reportError) setReportError(null)
              }}
            />
            {reportError ? (
              <p role="alert" className="text-sm text-magenta-bright">
                {reportError}
              </p>
            ) : null}
            <Button
              type="submit"
              size="sm"
              className="w-full justify-center py-3"
              disabled={sendingReport || !whatsappConfigured || !propertyId}
            >
              {sendingReport ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
              {sendingReport ? 'Opening WhatsApp…' : 'Send report'}
            </Button>
          </form>
        </section>

        {/* 6 — logout */}
        <Button variant="secondary" size="sm" className="w-full justify-center py-3" onClick={() => void handleLogout()}>
          <LogOut size={16} />
          Log out
        </Button>
      </main>
    </div>
  )
}

/** Recompute progress after an optimistic tick without a server round trip. */
function withProgress(checklist: ManagerChecklist, nextValue: boolean): ManagerChecklist['progress'] {
  const completed = checklist.items.filter((item) => item.isCompleted).length
  const total = checklist.items.length
  const after = nextValue ? completed + 1 : completed - 1
  const safeCompleted = Math.min(Math.max(after, 0), total)
  return {
    total,
    completed: safeCompleted,
    remaining: Math.max(total - safeCompleted, 0),
    percent: total === 0 ? 0 : Math.round((safeCompleted / total) * 100),
  }
}

function message(error: unknown): string {
  if (error instanceof ManagerApiError) {
    if (error.status === 401) return 'Your session has expired. Please sign in again.'
    if (error.status === 403) return 'That action was blocked. Reload the page and try again.'
    if (error.status >= 500) return 'Something went wrong on the server. Please try again.'
    return error.details?.[0]?.message ?? error.message
  }
  if (error instanceof TypeError) return 'Could not reach the server. Check your connection.'
  return 'Something went wrong. Please try again.'
}
