import { useMemo, useState } from 'react'
import { Download, FileSpreadsheet, Loader2, X } from 'lucide-react'
import { Field, TextInput, ErrorBanner } from '@/components/admin/AdminFormControls'
import { AdminApiError, downloadBookingReport } from '@/services/admin'
import { addDays, fromISODate, startOfMonth, toISODate, today } from '@/lib/date'

const DAY_MS = 86_400_000
const MAX_REPORT_DAYS = 366

type QuickRange = 'This Week' | 'This Month' | 'This Year'

function quickRange(label: QuickRange): { from: string; to: string } {
  const now = today()
  if (label === 'This Week') {
    const start = addDays(now, -now.getDay())
    return { from: toISODate(start), to: toISODate(addDays(start, 6)) }
  }
  if (label === 'This Month') {
    const start = startOfMonth(now)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { from: toISODate(start), to: toISODate(end) }
  }
  return { from: toISODate(new Date(now.getFullYear(), 0, 1)), to: toISODate(new Date(now.getFullYear(), 11, 31)) }
}

function rangeIssue(from: string, to: string): string | null {
  if (!from && !to) return 'Choose a start and end date.'
  if (!from) return 'Choose a start date.'
  if (!to) return 'Choose an end date.'
  const fromDate = fromISODate(from)
  const toDate = fromISODate(to)
  if (toDate.getTime() < fromDate.getTime()) return 'The start date must be on or before the end date.'
  const days = Math.round((toDate.getTime() - fromDate.getTime()) / DAY_MS) + 1
  if (days > MAX_REPORT_DAYS) return 'The selected period is too large. Choose 366 days or fewer.'
  return null
}

function triggerDownload(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

type Feedback = { kind: 'error' | 'empty' | 'success'; text: string }

export function BookingReportDialog({ onClose }: { onClose: () => void }) {
  const [preset, setPreset] = useState<QuickRange | null>('This Week')
  const [fromInput, setFromInput] = useState(quickRange('This Week').from)
  const [toInput, setToInput] = useState(quickRange('This Week').to)
  const [generating, setGenerating] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const invalidMessage = useMemo(() => rangeIssue(fromInput, toInput), [fromInput, toInput])
  const downloadDisabled = generating

  function selectPreset(label: QuickRange) {
    setPreset(label)
    const range = quickRange(label)
    setFromInput(range.from)
    setToInput(range.to)
    setFeedback(null)
  }

  function editFrom(value: string) {
    setPreset(null)
    setFromInput(value)
    setFeedback(null)
  }

  function editTo(value: string) {
    setPreset(null)
    setToInput(value)
    setFeedback(null)
  }

  async function handleDownload() {
    if (invalidMessage) {
      setFeedback({ kind: 'error', text: invalidMessage })
      return
    }
    setGenerating(true)
    setFeedback(null)
    try {
      const result = await downloadBookingReport({ from: fromInput, to: toInput })
      if (result.status === 'empty') {
        setFeedback({ kind: 'empty', text: result.message })
        return
      }
      triggerDownload(result.fileName, result.blob)
      setFeedback({ kind: 'success', text: `Saved ${result.fileName}` })
    } catch (err) {
      setFeedback({
        kind: 'error',
        text: err instanceof AdminApiError ? err.message : 'Could not generate the report. Please try again.',
      })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={generating ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Download booking report"
        className="card-surface w-full max-w-xl rounded-panel p-6 shadow-2xl sm:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-purple-bright">Report</p>
            <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-text-primary sm:text-2xl">
              DOWNLOAD BOOKING REPORT
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            aria-label="Close report dialog"
            className="rounded-full p-2 text-text-muted transition-colors hover:bg-surface-300/30 hover:text-text-primary disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-text-muted">
          Exports every normal booking created in the period — one row per booking plus a guests sheet with Aadhaar.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {(['This Week', 'This Month', 'This Year'] as const).map((label) => (
            <button
              key={label}
              type="button"
              disabled={generating}
              onClick={() => selectPreset(label)}
              className={
                'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors disabled:opacity-50 ' +
                (preset === label
                  ? 'bg-gradient-to-r from-purple/25 to-cyan/25 text-text-primary ring-1 ring-purple/30'
                  : 'border border-surface-300/50 text-text-secondary hover:border-purple/40 hover:text-text-primary')
              }
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="From">
            <TextInput
              type="date"
              value={fromInput}
              disabled={generating}
              onChange={(event) => editFrom(event.target.value)}
            />
          </Field>
          <Field label="To">
            <TextInput
              type="date"
              value={toInput}
              disabled={generating}
              onChange={(event) => editTo(event.target.value)}
            />
          </Field>
        </div>

        {feedback && (
          <div className="mt-5">
            {feedback.kind === 'error' ? (
              <ErrorBanner message={feedback.text} />
            ) : (
              <div
                role="status"
                className={
                  'rounded-xl border px-4 py-3 text-sm ' +
                  (feedback.kind === 'success'
                    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                    : 'border-surface-300/50 bg-surface-100/50 text-text-muted')
                }
              >
                {feedback.text}
              </div>
            )}
          </div>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={downloadDisabled}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-purple to-cyan px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-white shadow-lg shadow-purple/20 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {generating ? 'Generating report…' : 'Download Excel'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            className="inline-flex items-center gap-1.5 rounded-full border border-surface-300/70 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
          >
            <FileSpreadsheet size={14} />
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}