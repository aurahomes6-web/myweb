import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ArrowDown,
  ArrowUp,
  BellRing,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import { ErrorBanner, Field, TextArea } from '@/components/admin/AdminFormControls'
import {
  AdminApiError,
  createAdminMarqueeNotification,
  deleteAdminMarqueeNotification,
  fetchAdminMarqueeNotifications,
  reorderAdminMarqueeNotifications,
  updateAdminMarqueeNotification,
} from '@/services/admin'
import type { AdminMarqueeNotification } from '@/types/admin'

const MAX_NOTIFICATION_LENGTH = 240

function errorMessage(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.status === 401) {
      return 'Your admin session is missing or has expired. Sign in again.'
    }
    if (error.status === 403) {
      return 'The admin request was blocked by security checks. Reload the page and try again.'
    }
    if (error.status === 503) {
      return 'Admin authentication is not configured on the server.'
    }
    if (error.status >= 500) {
      return 'The server could not load marquee notifications. Check the server logs and confirm the marquee notifications database migration is applied, then retry.'
    }
    return error.details?.[0]?.message ?? error.message
  }
  if (error instanceof TypeError) {
    return 'Could not reach the server. Check your connection and try again.'
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function sortNotifications(notifications: AdminMarqueeNotification[]) {
  return [...notifications].sort((left, right) => {
    if (left.sort !== right.sort) return left.sort - right.sort
    return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
  })
}

export function MarqueeNotificationsTab() {
  const [notifications, setNotifications] = useState<AdminMarqueeNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editMessage, setEditMessage] = useState('')
  const [savingEditId, setSavingEditId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [reordering, setReordering] = useState(false)

  const loadNotifications = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setNotifications(sortNotifications(await fetchAdminMarqueeNotifications()))
    } catch (error) {
      setLoadError(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    fetchAdminMarqueeNotifications()
      .then((result) => {
        if (!active) return
        setNotifications(sortNotifications(result))
        setLoading(false)
      })
      .catch((error: unknown) => {
        if (!active) return
        setLoadError(errorMessage(error))
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const busy = creating || savingEditId !== null || busyId !== null || reordering
  const activeCount = useMemo(
    () => notifications.filter((notification) => notification.isActive).length,
    [notifications]
  )

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedMessage = message.trim()
    if (!normalizedMessage) {
      setFormError('Enter the notification text.')
      return
    }
    if (normalizedMessage.length > MAX_NOTIFICATION_LENGTH) {
      setFormError(`Notification text must be ${MAX_NOTIFICATION_LENGTH} characters or fewer.`)
      return
    }

    setCreating(true)
    setFormError(null)
    setActionError(null)
    try {
      const created = await createAdminMarqueeNotification({
        message: normalizedMessage,
        isActive: true,
      })
      setNotifications((current) => sortNotifications([...current, created]))
      setMessage('')
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setCreating(false)
    }
  }

  function beginEdit(notification: AdminMarqueeNotification) {
    setEditingId(notification.id)
    setEditMessage(notification.message)
    setActionError(null)
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingId) return
    const normalizedMessage = editMessage.trim()
    if (!normalizedMessage) {
      setActionError('Notification text is required.')
      return
    }
    if (normalizedMessage.length > MAX_NOTIFICATION_LENGTH) {
      setActionError(
        `Notification text must be ${MAX_NOTIFICATION_LENGTH} characters or fewer.`
      )
      return
    }

    const id = editingId
    setSavingEditId(id)
    setActionError(null)
    try {
      const updated = await updateAdminMarqueeNotification(id, { message: normalizedMessage })
      setNotifications((current) =>
        current.map((notification) => (notification.id === id ? updated : notification))
      )
      setEditingId(null)
    } catch (error) {
      setActionError(errorMessage(error))
    } finally {
      setSavingEditId(null)
    }
  }

  async function toggleActive(notification: AdminMarqueeNotification) {
    setBusyId(notification.id)
    setActionError(null)
    try {
      const updated = await updateAdminMarqueeNotification(notification.id, {
        isActive: !notification.isActive,
      })
      setNotifications((current) =>
        current.map((item) => (item.id === notification.id ? updated : item))
      )
    } catch (error) {
      setActionError(errorMessage(error))
    } finally {
      setBusyId(null)
    }
  }

  async function moveNotification(index: number, direction: -1 | 1) {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= notifications.length) return

    const reordered = [...notifications]
    const current = reordered[index]
    reordered[index] = reordered[targetIndex]
    reordered[targetIndex] = current
    setReordering(true)
    setActionError(null)
    try {
      setNotifications(
        sortNotifications(
          await reorderAdminMarqueeNotifications(reordered.map((notification) => notification.id))
        )
      )
    } catch (error) {
      setActionError(errorMessage(error))
      await loadNotifications()
    } finally {
      setReordering(false)
    }
  }

  async function removeNotification(notification: AdminMarqueeNotification) {
    if (!window.confirm(`Delete “${notification.message}”?`)) return
    setBusyId(notification.id)
    setActionError(null)
    try {
      await deleteAdminMarqueeNotification(notification.id)
      setNotifications((current) => current.filter((item) => item.id !== notification.id))
      if (editingId === notification.id) setEditingId(null)
    } catch (error) {
      setActionError(errorMessage(error))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="flex flex-col gap-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-purple-bright">
          Homepage Communication
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-text-primary">
          Marquee Notifications
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">
          Manage the messages shown in the moving strip directly below the homepage hero.
        </p>
      </div>

      <form
        onSubmit={handleCreate}
        className="glass rounded-3xl p-5 shadow-card sm:p-6"
      >
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-purple/15 text-purple-bright">
            <BellRing size={19} />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold text-text-primary">Add notification</h2>
            <p className="text-xs text-text-muted">New notifications are active and added to the end.</p>
          </div>
        </div>
        <Field
          label="Notification text"
          hint={`${message.length}/${MAX_NOTIFICATION_LENGTH} characters`}
          error={formError ?? undefined}
        >
          <TextArea
            aria-label="Notification text"
            value={message}
            onChange={(event) => {
              setMessage(event.target.value)
              if (formError) setFormError(null)
            }}
            maxLength={MAX_NOTIFICATION_LENGTH}
            placeholder="Share a timely stay update or offer"
          />
        </Field>
        <div className="mt-5 flex justify-end">
          <Button type="submit" size="sm" disabled={creating || busy}>
            {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            {creating ? 'Adding…' : 'Add notification'}
          </Button>
        </div>
      </form>

      {loadError ? (
        <div className="flex flex-col items-start gap-3">
          <ErrorBanner message={loadError} />
          <Button variant="secondary" size="sm" onClick={() => void loadNotifications()}>
            Retry
          </Button>
        </div>
      ) : null}

      {actionError ? <ErrorBanner message={actionError} /> : null}

      {loading ? (
        <div className="glass flex items-center justify-center gap-3 rounded-3xl p-12 text-sm text-text-muted">
          <Loader2 size={18} className="animate-spin" />
          Loading notifications…
        </div>
      ) : !loadError && notifications.length === 0 ? (
        <div className="glass rounded-3xl p-10 text-center shadow-card">
          <BellRing size={28} className="mx-auto text-purple/70" />
          <h2 className="mt-4 font-display text-lg font-semibold text-text-primary">
            No notifications yet
          </h2>
          <p className="mt-2 text-sm text-text-muted">
            Add a message to display it on the homepage marquee.
          </p>
        </div>
      ) : (
        <div className="glass rounded-3xl p-5 shadow-card sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="font-display text-lg font-semibold text-text-primary">Display order</h2>
            <span className="text-xs text-text-muted">
              {activeCount} active of {notifications.length}
            </span>
          </div>
          <ol className="flex flex-col gap-3">
            {notifications.map((notification, index) => (
              <li
                key={notification.id}
                className="rounded-2xl border border-surface-300/45 bg-surface-100/35 p-4 sm:p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                        Position {index + 1}
                      </span>
                      <span
                        className={
                          notification.isActive
                            ? 'rounded-full bg-cyan/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-bright'
                            : 'rounded-full bg-surface-300/30 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted'
                        }
                      >
                        {notification.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </div>

                    {editingId === notification.id ? (
                      <form onSubmit={saveEdit} className="mt-3">
                        <Field label="Edit notification">
                          <TextArea
                            aria-label="Edit notification"
                            value={editMessage}
                            onChange={(event) => setEditMessage(event.target.value)}
                            maxLength={MAX_NOTIFICATION_LENGTH}
                            autoFocus
                          />
                        </Field>
                        <div className="mt-3 flex flex-wrap justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingId(null)}
                            disabled={savingEditId === notification.id}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            size="sm"
                            disabled={savingEditId === notification.id}
                          >
                            {savingEditId === notification.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : null}
                            Save changes
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-text-primary">
                        {notification.message}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-3 py-1.5"
                      onClick={() => void moveNotification(index, -1)}
                      disabled={busy || index === 0}
                      aria-label={`Move ${notification.message} up`}
                    >
                      <ArrowUp size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-3 py-1.5"
                      onClick={() => void moveNotification(index, 1)}
                      disabled={busy || index === notifications.length - 1}
                      aria-label={`Move ${notification.message} down`}
                    >
                      <ArrowDown size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-3 py-1.5"
                      onClick={() => beginEdit(notification)}
                      disabled={busy}
                      aria-label={`Edit ${notification.message}`}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-3 py-1.5"
                      onClick={() => void toggleActive(notification)}
                      disabled={busy}
                      aria-label={`${notification.isActive ? 'Disable' : 'Enable'} ${notification.message}`}
                    >
                      {busyId === notification.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <BellRing size={14} />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-3 py-1.5 text-magenta-bright hover:text-magenta-bright"
                      onClick={() => void removeNotification(notification)}
                      disabled={busy}
                      aria-label={`Delete ${notification.message}`}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}
