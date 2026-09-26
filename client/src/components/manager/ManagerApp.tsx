import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import {
  CalendarDays,
  CheckCircle2,
  Loader2,
  LogOut,
  MessageCircle,
  Send,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import { Field, TextArea, TextInput } from '@/components/admin/AdminFormControls'
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
import { formatDayMonthYear, isISODate, toISODate, today } from '@/lib/date'
import type { ManagerChecklist, ManagerProperty } from '@/types/manager'

/**
 * The manager panel — a phone-first operational screen, DATE-FIRST.
 *
 * Order of the screen: date → property → checklist → progress → tasks → report
 * to admin → log out. The checklist is gated on BOTH selections, so nothing
 * about "today" or a home is ever assumed, and every tick is written against the
 * exact (date, property, item, manager) the manager is looking at.
 *
 * No admin-style tables, large touch targets, and the only data it can reach
 * comes from the manager-only API.
 */

/** Keeps the selected day + home across a refresh; completion state lives on the server. */
const SELECTION_KEY = 'aura:manager-selection'

interface StoredSelection {
  date: string
  propertyId: string
}

function readStoredSelection(): StoredSelection {
  try {
    const raw = sessionStorage.getItem(SELECTION_KEY)
    if (!raw) return { date: '', propertyId: '' }
    const parsed = JSON.parse(raw) as Partial<StoredSelection>
    const date = typeof parsed.date === 'string' && isISODate(parsed.date) ? parsed.date : ''
    const propertyId = typeof parsed.propertyId === 'string' ? parsed.propertyId : ''
    return { date, propertyId }
  } catch {
    return { date: '', propertyId: '' }
  }
}

export function ManagerApp({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [properties, setProperties] = useState<ManagerProperty[]>([])
  // '' means "not chosen yet" — deliberately NOT pre-filled with today, because
  // the flow is date-first and the checklist must stay hidden until the manager commits.
  const [selectedDate, setSelectedDate] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [checklist, setChecklist] = useState<ManagerChecklist | null>(null)
  const [whatsappConfigured, setWhatsappConfigured] = useState(true)
  const [loading, setLoading] = useState(false)
  const [booted, setBooted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingItemId, setPendingItemId] = useState<string | null>(null)
  const [report, setReport] = useState('')
  const [reportError, setReportError] = useState<string | null>(null)
  const [sendingReport, setSendingReport] = useState(false)

  // Guards against a slow response for an old selection overwriting a newer one.
  const requestId = useRef(0)

  const hasDate = selectedDate !== ''
  const hasProperty = propertyId !== ''
  const ready = hasDate && hasProperty

  const loadChecklist = useCallback(async (date: string, id: string) => {
    const token = (requestId.current += 1)
    if (!date || !id) {
      setChecklist(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const next = await fetchManagerChecklist(id, date)
      if (token !== requestId.current) return
      setChecklist(next)
    } catch (cause) {
      if (token !== requestId.current) return
      setChecklist(null)
      setError(message(cause))
    } finally {
      if (token === requestId.current) setLoading(false)
    }
  }, [])

  // Properties + WhatsApp availability, then restore the last day/home.
  useEffect(() => {
    let active = true
    Promise.all([fetchManagerProperties(), fetchManagerConfig()])
      .then(([list, config]) => {
        if (!active) return
        setProperties(list)
        setWhatsappConfigured(config.whatsappConfigured)
        const stored = readStoredSelection()
        // Functional updates: never discard a day/home the manager already picked
        // while this request was in flight.
        setSelectedDate((current) => current || stored.date)
        setPropertyId((current) => current || (list.some((property) => property.id === stored.propertyId) ? stored.propertyId : ''))
        setBooted(true)
      })
      .catch((cause: unknown) => {
        if (!active) return
        setError(message(cause))
        setBooted(true)
      })
    return () => {
      active = false
    }
  }, [])

  // A refresh keeps the day + home, so the state comes back from the server.
  useEffect(() => {
    if (!booted) return
    try {
      if (selectedDate) {
        sessionStorage.setItem(SELECTION_KEY, JSON.stringify({ date: selectedDate, propertyId }))
      } else {
        sessionStorage.removeItem(SELECTION_KEY)
      }
    } catch {
      // A blocked/absent sessionStorage must never break the checklist.
    }
  }, [selectedDate, propertyId, booted])

  useEffect(() => {
    void loadChecklist(selectedDate, propertyId)
  }, [selectedDate, propertyId, loadChecklist])

  function chooseDate(next: string) {
    setSelectedDate(next)
    // Dropping the day hides the checklist; the home choice is kept so
    // re-picking a day is one tap instead of two.
    if (!next) {
      requestId.current += 1
      setChecklist(null)
      setLoading(false)
    }
  }

  async function toggleItem(itemId: string, nextValue: boolean) {
    if (!checklist) return
    const previous = checklist
    // Pin the write to the day/property actually on screen, in case the manager
    // changes the selection while the request is in flight.
    const date = checklist.dateKey
    const property = checklist.propertyId
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
      await setManagerChecklistCompletion(property, itemId, nextValue, date)
    } catch (cause) {
      // Only roll back if this exact day/property is still displayed.
      setChecklist((current) =>
        current && current.dateKey === date && current.propertyId === property ? previous : current
      )
      setError(message(cause))
    } finally {
      setPendingItemId((current) => (current === itemId ? null : current))
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
    if (!selectedDate) {
      setReportError('Choose a date first.')
      return
    }

    setSendingReport(true)
    setReportError(null)
    try {
      const prepared = await prepareManagerReport(propertyId, text, selectedDate)
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
        {/* The form only appears once the saved selection has been applied, so a
            choice made mid-boot can never be silently overwritten. */}
        {!booted ? (
          <p className="glass p-5 text-sm text-text-muted" role="status">
            Loading your homes…
          </p>
        ) : (
          <>
        {/* 1 — date comes first; nothing else is offered until it is chosen. */}
        <section className="glass flex flex-col gap-3 p-5 shadow-card">
          <h1 className="flex items-center gap-2 font-display text-lg font-semibold text-text-primary">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-purple/20 text-xs font-bold text-purple-bright">
              1
            </span>
            Select Date
          </h1>
          <Field label="Select Date" hint="Past and future dates are both allowed.">
            <TextInput
              type="date"
              value={selectedDate}
              aria-label="Select Date"
              onChange={(event) => chooseDate(event.target.value)}
              className="min-h-14 text-base"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => chooseDate(toISODate(today()))}
            >
              <CalendarDays size={15} />
              Today
            </Button>
            {selectedDate ? (
              <p className="text-sm text-text-secondary">Checklist day: {formatDayMonthYear(selectedDate)}</p>
            ) : null}
          </div>
        </section>

        {/* 2 — the homes only appear once a day is chosen, in the canonical order. */}
        {hasDate ? (
          <section className="glass flex flex-col gap-3 p-5 shadow-card">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-text-primary">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-purple/20 text-xs font-bold text-purple-bright">
                2
              </span>
              Select Property
            </h2>
            <div className="grid grid-cols-1 gap-3">
              {properties.map((property) => {
                const active = property.id === propertyId
                const hint = propertyHint(property.slug)
                return (
                  <button
                    key={property.id}
                    type="button"
                    onClick={() => setPropertyId(property.id)}
                    aria-pressed={active}
                    // The seed data gives every home the same display name, so the
                    // label carries the home's own identity instead of reading as
                    // "Aura Cozy Terrace Rooftop suitePenthouse 2".
                    aria-label={`${property.name} (${hint})`}
                    className={cn(
                      'flex min-h-16 items-center justify-between gap-3 rounded-2xl border px-5 py-4 text-left transition-colors',
                      active
                        ? 'border-purple/50 bg-purple/15'
                        : 'border-surface-300/45 bg-surface-100/35'
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block font-display text-base font-semibold break-words text-text-primary">
                        {property.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-text-muted">{hint}</span>
                    </span>
                    {active ? <CheckCircle2 size={20} className="shrink-0 text-purple-bright" /> : null}
                  </button>
                )
              })}
            </div>
          </section>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-xl border border-magenta/40 bg-magenta/10 px-4 py-3 text-sm text-magenta-bright">
            {error}
          </p>
        ) : null}

        {/* 3 — the checklist itself, only for a chosen day + home. */}
        {ready ? (
          loading && !checklist ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass flex items-center justify-center gap-3 rounded-3xl p-10 text-sm text-text-muted"
            >
              <Loader2 size={18} className="animate-spin" />
              Loading checklist…
            </motion.div>
          ) : checklist ? (
            <motion.section
              key={`${checklist.dateKey}:${checklist.propertyId}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="glass rounded-3xl p-5 shadow-card"
            >
              <h2 className="font-display text-lg font-semibold text-text-primary">
                Checklist for:
              </h2>
              <p className="mt-1 text-sm text-text-secondary">{formatDayMonthYear(checklist.dateKey)}</p>
              <p className="text-sm font-semibold break-words text-text-primary">
                {checklist.propertyName}
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
                    All tasks completed for {formatDayMonthYear(checklist.dateKey)}.
                  </p>
                ) : null}
              </div>

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
            ) : null
          ) : (
            <motion.p
              key="prompt"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-3xl p-6 text-center text-sm text-text-muted shadow-card"
            >
              Select a date and property to view the checklist.
            </motion.p>
          )}

        {/* 4 — report to admin, filed under the same day + home. */}
        <section className="glass rounded-3xl p-5 shadow-card">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-text-primary">
            <MessageCircle size={18} className="text-cyan-bright" />
            Report to admin
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            {hasDate && hasProperty
              ? `Filed under ${formatDayMonthYear(selectedDate)} · ${
                  properties.find((property) => property.id === propertyId)?.name ?? ''
                }`
              : 'Choose a date and property first.'}
          </p>
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
              disabled={sendingReport || !whatsappConfigured || !ready}
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

        {/* 5 — logout */}
        <Button variant="secondary" size="sm" className="w-full justify-center py-3" onClick={() => void handleLogout()}>
          <LogOut size={16} />
          Log out
        </Button>
          </>
        )}
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

/**
 * The seed data gives every home the same display name, so the slug's tail is
 * shown as the disambiguator. This is presentation only — the database is not
 * renamed and the canonical Penthouse 1 → 2 → 3 order is untouched.
 */
function propertyHint(slug: string): string {
  const tail = slug.split('-').slice(-2).join(' ')
  return tail.charAt(0).toUpperCase() + tail.slice(1)
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
