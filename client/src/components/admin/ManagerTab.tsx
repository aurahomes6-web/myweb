import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, History, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import { ErrorBanner, Field, TextArea, TextInput } from '@/components/admin/AdminFormControls'
import {
  AdminApiError,
  createAdminManagerChecklistItem,
  deleteAdminManagerChecklistItem,
  fetchAdminManagerChecklist,
  reorderAdminManagerChecklist,
  updateAdminManagerChecklistItem,
} from '@/services/admin'
import { fetchAdminProperties } from '@/services/admin'
import { MAX_CHECKLIST_DESCRIPTION_LENGTH, MAX_CHECKLIST_TITLE_LENGTH } from './managerLimits'
import type { AdminManagerChecklistItem, AdminProperty } from '@/types/admin'

/**
 * Admin → Manager: checklist CONFIGURATION.
 *
 * This page decides WHAT the managers tick and in which order. It is linked from
 * the admin navigation on purpose — but it is NOT a door into the manager panel:
 * there is no "Open Manager" button here, and the manager panel stays unlinked
 * and is only reached by typing /manager.
 *
 * Deleting a task is a soft delete on the server, so historical daily completion
 * records survive; the retained count is shown next to each task.
 */
export function ManagerTab() {
  const [properties, setProperties] = useState<AdminProperty[]>([])
  const [propertyId, setPropertyId] = useState('')
  const [items, setItems] = useState<AdminManagerChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [reordering, setReordering] = useState(false)

  useEffect(() => {
    let active = true
    fetchAdminProperties()
      .then((result) => {
        if (!active) return
        setProperties(result)
        setPropertyId((current) => current || result[0]?.id || '')
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

  const loadItems = useCallback(async (id: string) => {
    if (!id) {
      setItems([])
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      setItems(await fetchAdminManagerChecklist(id))
    } catch (error) {
      setLoadError(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadItems(propertyId)
  }, [propertyId, loadItems])

  const selectedProperty = properties.find((property) => property.id === propertyId) ?? null
  const activeItems = items.filter((item) => item.deletedAt === null)
  const busy = creating || savingId !== null || busyId !== null || reordering

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = title.trim()
    if (!normalized) {
      setFormError('Enter the task name.')
      return
    }
    if (normalized.length > MAX_CHECKLIST_TITLE_LENGTH) {
      setFormError(`Task name must be ${MAX_CHECKLIST_TITLE_LENGTH} characters or fewer.`)
      return
    }

    setCreating(true)
    setFormError(null)
    setActionError(null)
    try {
      const created = await createAdminManagerChecklistItem(propertyId, {
        title: normalized,
        description: description.trim() || null,
        isActive: true,
      })
      setItems((current) => [...current, created])
      setTitle('')
      setDescription('')
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setCreating(false)
    }
  }

  function beginEdit(item: AdminManagerChecklistItem) {
    setEditingId(item.id)
    setEditTitle(item.title)
    setEditDescription(item.description ?? '')
    setActionError(null)
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingId) return
    const normalized = editTitle.trim()
    if (!normalized) {
      setActionError('Enter the task name.')
      return
    }

    const id = editingId
    setSavingId(id)
    setActionError(null)
    try {
      const updated = await updateAdminManagerChecklistItem(propertyId, id, {
        title: normalized,
        description: editDescription.trim() || null,
      })
      setItems((current) => current.map((item) => (item.id === id ? updated : item)))
      setEditingId(null)
    } catch (error) {
      setActionError(errorMessage(error))
    } finally {
      setSavingId(null)
    }
  }

  async function toggleActive(item: AdminManagerChecklistItem) {
    setBusyId(item.id)
    setActionError(null)
    try {
      const updated = await updateAdminManagerChecklistItem(propertyId, item.id, {
        isActive: !item.isActive,
      })
      setItems((current) => current.map((row) => (row.id === item.id ? updated : row)))
    } catch (error) {
      setActionError(errorMessage(error))
    } finally {
      setBusyId(null)
    }
  }

  async function moveItem(index: number, direction: -1 | 1) {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= activeItems.length) return

    const reordered = [...activeItems]
    const current = reordered[index]
    reordered[index] = reordered[targetIndex]
    reordered[targetIndex] = current

    setReordering(true)
    setActionError(null)
    try {
      setItems(await reorderAdminManagerChecklist(propertyId, reordered.map((item) => item.id)))
    } catch (error) {
      setActionError(errorMessage(error))
      await loadItems(propertyId)
    } finally {
      setReordering(false)
    }
  }

  async function removeItem(item: AdminManagerChecklistItem) {
    const retained = item.completionCount
    const message =
      retained > 0
        ? `Remove “${item.title}” from the manager checklist? ${retained} historical completion ${
            retained === 1 ? 'record' : 'records'
          } will be kept.`
        : `Remove “${item.title}” from the manager checklist?`
    if (!window.confirm(message)) return

    setBusyId(item.id)
    setActionError(null)
    try {
      await deleteAdminManagerChecklistItem(propertyId, item.id)
      // Re-fetch so the retained-count audit stays accurate.
      await loadItems(propertyId)
      if (editingId === item.id) setEditingId(null)
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
          Housekeeping
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-text-primary">Manager</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">
          Configure the daily checklist each property manager ticks off. Removing a task stops it
          appearing for future sessions but keeps its completion history intact.
        </p>
      </div>

      <div className="glass flex flex-col gap-2 rounded-3xl p-5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Property
          </span>
          <select
            aria-label="Select property checklist"
            value={propertyId}
            onChange={(event) => setPropertyId(event.target.value)}
            className="w-full cursor-pointer rounded-xl border border-surface-300/70 bg-surface-100/50 px-4 py-2.5 text-sm text-text-primary outline-none transition-colors focus:border-purple/50 focus:ring-2 focus:ring-purple/20 sm:w-auto"
          >
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-text-muted">
          The manager panel itself is deliberately unlinked — it is reached by entering /manager.
        </p>
      </div>

      <form onSubmit={handleCreate} className="glass rounded-3xl p-5 shadow-card sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-purple/15 text-purple-bright">
            <Plus size={19} />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold text-text-primary">Add task</h2>
            <p className="text-xs text-text-muted">
              New tasks are active and added to the end of the list.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Field
            label="Task name"
            hint={`${title.length}/${MAX_CHECKLIST_TITLE_LENGTH} characters`}
            error={formError ?? undefined}
          >
            <TextInput
              aria-label="Task name"
              value={title}
              maxLength={MAX_CHECKLIST_TITLE_LENGTH}
              placeholder="Check AC Remote"
              onChange={(event) => {
                setTitle(event.target.value)
                if (formError) setFormError(null)
              }}
            />
          </Field>
          <Field
            label="Description (optional)"
            hint={`${description.length}/${MAX_CHECKLIST_DESCRIPTION_LENGTH} characters`}
          >
            <TextInput
              aria-label="Task description"
              value={description}
              maxLength={MAX_CHECKLIST_DESCRIPTION_LENGTH}
              placeholder="Remote goes back in the drawer"
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
        </div>

        <div className="mt-5 flex justify-end">
          <Button type="submit" size="sm" disabled={creating || busy || !propertyId}>
            {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            {creating ? 'Adding…' : 'Add task'}
          </Button>
        </div>
      </form>

      {loadError ? (
        <div className="flex flex-col items-start gap-3">
          <ErrorBanner message={loadError} />
          <Button variant="secondary" size="sm" onClick={() => void loadItems(propertyId)}>
            Retry
          </Button>
        </div>
      ) : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}

      {loading ? (
        <div className="glass flex items-center justify-center gap-3 rounded-3xl p-12 text-sm text-text-muted">
          <Loader2 size={18} className="animate-spin" />
          Loading checklist…
        </div>
      ) : !loadError && activeItems.length === 0 ? (
        <div className="glass rounded-3xl p-10 text-center shadow-card">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            No tasks for {selectedProperty?.name ?? 'this property'} yet
          </h2>
          <p className="mt-2 text-sm text-text-muted">
            Add the first task above. The manager will see it on their next visit.
          </p>
        </div>
      ) : (
        <div className="glass rounded-3xl p-5 shadow-card sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-text-primary">Checklist order</h2>
            <span className="text-xs text-text-muted">
              {activeItems.filter((item) => item.isActive).length} active of {activeItems.length}
            </span>
          </div>

          <ol className="flex flex-col gap-3">
            {activeItems.map((item, index) => (
              <li
                key={item.id}
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
                          item.isActive
                            ? 'rounded-full bg-cyan/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-bright'
                            : 'rounded-full bg-surface-300/30 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted'
                        }
                      >
                        {item.isActive ? 'Active' : 'Disabled'}
                      </span>
                      {item.completionCount > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-surface-300/25 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                          <History size={11} />
                          {item.completionCount} logged
                        </span>
                      ) : null}
                    </div>

                    {editingId === item.id ? (
                      <form onSubmit={saveEdit} className="mt-3 flex flex-col gap-3">
                        <Field label="Task name">
                          <TextInput
                            aria-label="Edit task name"
                            value={editTitle}
                            maxLength={MAX_CHECKLIST_TITLE_LENGTH}
                            autoFocus
                            onChange={(event) => setEditTitle(event.target.value)}
                          />
                        </Field>
                        <Field label="Description (optional)">
                          <TextArea
                            aria-label="Edit task description"
                            value={editDescription}
                            maxLength={MAX_CHECKLIST_DESCRIPTION_LENGTH}
                            onChange={(event) => setEditDescription(event.target.value)}
                            className="min-h-20"
                          />
                        </Field>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingId(null)}
                            disabled={savingId === item.id}
                          >
                            Cancel
                          </Button>
                          <Button type="submit" size="sm" disabled={savingId === item.id}>
                            {savingId === item.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : null}
                            Save changes
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <p className="mt-3 break-words text-sm font-semibold text-text-primary">
                          {item.title}
                        </p>
                        {item.description ? (
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-text-muted">
                            {item.description}
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-3 py-1.5"
                      onClick={() => void moveItem(index, -1)}
                      disabled={busy || index === 0}
                      aria-label={`Move ${item.title} up`}
                    >
                      <ArrowUp size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-3 py-1.5"
                      onClick={() => void moveItem(index, 1)}
                      disabled={busy || index === activeItems.length - 1}
                      aria-label={`Move ${item.title} down`}
                    >
                      <ArrowDown size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-3 py-1.5"
                      onClick={() => beginEdit(item)}
                      disabled={busy}
                      aria-label={`Edit ${item.title}`}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-3 py-1.5"
                      onClick={() => void toggleActive(item)}
                      disabled={busy}
                      aria-label={`${item.isActive ? 'Disable' : 'Enable'} ${item.title}`}
                    >
                      {busyId === item.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">
                          {item.isActive ? 'Off' : 'On'}
                        </span>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-3 py-1.5 text-magenta-bright hover:text-magenta-bright"
                      onClick={() => void removeItem(item)}
                      disabled={busy}
                      aria-label={`Delete ${item.title}`}
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

      {items.some((item) => item.deletedAt !== null) ? (
        <div className="glass rounded-3xl p-5 shadow-card sm:p-6">
          <h2 className="font-display text-base font-semibold text-text-primary">
            Removed tasks (history kept)
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {items
              .filter((item) => item.deletedAt !== null)
              .map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-300/25 pb-2 text-sm last:border-b-0"
                >
                  <span className="break-words text-text-muted line-through">{item.title}</span>
                  <span className="text-xs text-text-muted">
                    {item.completionCount} completion record
                    {item.completionCount === 1 ? '' : 's'} retained
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function errorMessage(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.status === 401) {
      return 'Your admin session is missing or has expired. Sign in again.'
    }
    if (error.status === 403) {
      return 'The request was blocked by security checks. Reload the page and try again.'
    }
    if (error.status === 409) {
      return error.message
    }
    if (error.status >= 500) {
      return 'The server could not load the manager checklist. Check the server logs and confirm the manager checklist migration is applied, then retry.'
    }
    return error.details?.[0]?.message ?? error.message
  }
  if (error instanceof TypeError) {
    return 'Could not reach the server. Check your connection and try again.'
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
