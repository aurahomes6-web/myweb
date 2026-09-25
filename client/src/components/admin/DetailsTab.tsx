import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import { ErrorBanner, Select, TextInput } from '@/components/admin/AdminFormControls'
import { StatusPill, type PillStatus } from '@/components/admin/StatusPill'
import {
  DetailsApiError,
  downloadDetailsExcel,
  downloadDetailsPdf,
  fetchDetails,
  saveBlob,
} from '@/services/details'
import { formatINR } from '@/lib/money'
import { GENDER_LABEL } from '@/lib/gender'
import { cn } from '@/lib/cn'
import {
  DEFAULT_DETAILS_FILTERS,
  DETAILS_DATE_BASIS_OPTIONS,
  DETAILS_DATE_PRESET_OPTIONS,
  DETAILS_PAGE_SIZE_OPTIONS,
  DETAILS_PAYMENT_STATUS_OPTIONS,
  DETAILS_SORT_OPTIONS,
  DETAILS_SOURCE_OPTIONS,
  DETAILS_STATUS_OPTIONS,
  type DetailsDateBasis,
  type DetailsFilters,
  type DetailsPageSize,
  type DetailsRecord,
  type DetailsResponse,
  type DetailsSortField,
  type DetailsSortOrder,
} from '@/types/details'

/**
 * Admin → Details: a read-only reporting view over NORMAL bookings and AIRBNB
 * reservations. It reports what the database already holds — it does not change
 * how either booking system behaves.
 *
 * Design decisions worth keeping:
 *  - filtering, searching, sorting and pagination all happen SERVER-SIDE, so a
 *    large ledger never lands in React;
 *  - the date basis is always labelled, because "This Month" means different
 *    things for check-in vs booking date;
 *  - the FULL Aadhaar number is shown here on purpose (admin-only section), in
 *    the table, in the detail drawer and in both exports.
 */

const SORT_FIELD_LABEL: Record<DetailsSortField, string> = {
  checkIn: 'Check-in',
  checkOut: 'Check-out',
  bookingDate: 'Booking date',
  guestName: 'Guest name',
  property: 'Property',
  source: 'Source',
  status: 'Status',
  amount: 'Amount',
}

/**
 * One grid template shared by the column legend and every record row, so the
 * two can never drift apart. On phones it is a single column and each cell
 * shows its own label; from `lg` up the cells become aligned columns.
 */
const RECORD_GRID =
  'grid grid-cols-1 gap-x-4 gap-y-1.5 lg:min-w-[66rem] lg:grid-cols-[minmax(0,0.9fr)_5.5rem_minmax(0,1.3fr)_7rem_7rem_minmax(0,1.1fr)_8.5rem_3.5rem_6.5rem_8rem_6rem]'

/** The columns shown, in order. `null` means the column is not sortable. */
const SORTABLE_COLUMNS: Array<[DetailsSortField | null, string]> = [
  [null, 'Reference'],
  ['source', 'Source'],
  ['property', 'Property'],
  ['checkIn', 'Check-in'],
  ['checkOut', 'Check-out'],
  ['guestName', 'Guest'],
  [null, 'Aadhaar'],
  [null, 'Guests'],
  ['amount', 'Amount'],
  ['bookingDate', 'Booked on'],
  ['status', 'Status'],
]

/** A labelled value: the label only shows where there are no column headers. */
function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex items-baseline justify-between gap-3 lg:block">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted lg:hidden">
        {label}
      </span>
      <span className="min-w-0 text-sm">{children}</span>
    </span>
  )
}

function errorMessage(error: unknown): string {
  if (error instanceof DetailsApiError) {
    if (error.status === 401) return 'Your admin session is missing or has expired. Sign in again.'
    if (error.status === 403) {
      return 'The download was blocked by security checks. Reload the page and try again.'
    }
    if (error.status >= 500) {
      return 'The server could not build the report. Check the server logs and try again.'
    }
    return error.details?.[0]?.message ?? error.message
  }
  if (error instanceof TypeError) {
    return 'Could not reach the server. Check your connection and try again.'
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function formatDate(value: string): string {
  const [year, month, day] = value.split('-')
  if (!year || !month || !day) return value
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return `${date.getUTCDate()} ${date.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' })} ${date.getUTCFullYear()}`
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function amountText(paise: number | null): string {
  return paise === null ? '—' : formatINR(paise)
}

interface SummaryCard {
  label: string
  value: string
  hint?: string
}

export function DetailsTab() {
  const [filters, setFilters] = useState<DetailsFilters>(DEFAULT_DETAILS_FILTERS)
  const [searchDraft, setSearchDraft] = useState('')
  const [data, setData] = useState<DetailsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<'excel' | 'pdf' | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<DetailsRecord | null>(null)

  const load = useCallback(async (next: DetailsFilters) => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchDetails(next)
      setData(result)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(filters)
    // Reloading is driven purely by the filter object.
  }, [filters, load])

  // A new filter combination always starts from the first page.
  function update(patch: Partial<DetailsFilters>) {
    setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }))
  }

  function toggleSort(field: DetailsSortField) {
    setFilters((current) => ({
      ...current,
      page: 1,
      sortBy: field,
      sortOrder: current.sortBy === field && current.sortOrder === 'asc' ? 'desc' : 'asc',
    }))
  }

  async function handleDownload(format: 'excel' | 'pdf') {
    setDownloading(format)
    setDownloadError(null)
    try {
      const range = data?.appliedQuery.range ?? { from: '', to: '' }
      const result =
        format === 'excel'
          ? await downloadDetailsExcel(filters, range)
          : await downloadDetailsPdf(filters, range)
      saveBlob(result.fileName, result.blob)
    } catch (cause) {
      setDownloadError(errorMessage(cause))
    } finally {
      setDownloading(null)
    }
  }

  // The label follows the query the server actually applied, not the one we
  // asked for — otherwise the range shown would silently disagree with the
  // numbers printed next to it.
  const appliedBasis = data?.appliedQuery.dateBasis ?? filters.dateBasis
  const basis = DETAILS_DATE_BASIS_OPTIONS.find((option) => option.value === appliedBasis)
  const summary = data?.summary
  const cards: SummaryCard[] = useMemo(() => {
    if (!summary) return []
    return [
      { label: 'Total bookings', value: String(summary.totalBookings) },
      { label: 'Normal bookings', value: String(summary.normalBookings) },
      { label: 'Airbnb bookings', value: String(summary.airbnbBookings) },
      { label: 'Total guests', value: String(summary.totalGuests) },
      {
        label: 'Occupied nights',
        value: String(summary.occupiedNights),
        hint: 'Excludes cancelled',
      },
      {
        label: 'Total booking value',
        value: formatINR(summary.totalAmountPaise),
        hint: 'Normal bookings, excludes cancelled',
      },
    ]
  }, [summary])

  const records = data?.records ?? []
  const page = data?.page ?? filters.page
  const pageCount = data?.pageCount ?? 1
  const total = data?.total ?? 0

  return (
    <section className="flex flex-col gap-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-purple-bright">
            Reporting
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-text-primary">Details</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">
            Every normal booking and Airbnb reservation in one read-only view. Aadhaar numbers are
            shown in full for this admin-only section.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleDownload('excel')}
            disabled={downloading !== null || loading}
          >
            {downloading === 'excel' ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <FileSpreadsheet size={15} />
            )}
            {downloading === 'excel' ? 'Preparing…' : 'Download Excel'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleDownload('pdf')}
            disabled={downloading !== null || loading}
          >
            {downloading === 'pdf' ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <FileText size={15} />
            )}
            {downloading === 'pdf' ? 'Preparing…' : 'Download PDF'}
          </Button>
        </div>
      </div>

      {/* Summary cards reflect the CURRENT filters. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => (
          <div key={card.label} className="glass rounded-2xl p-4 shadow-card">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              {card.label}
            </p>
            <p className="mt-1.5 font-display text-xl font-semibold break-words text-text-primary">
              {loading && !summary ? '—' : card.value}
            </p>
            {card.hint ? <p className="mt-1 text-[10px] text-text-muted">{card.hint}</p> : null}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="glass rounded-3xl p-5 shadow-card sm:p-6">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            update({ search: searchDraft })
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                Search
              </span>
              <div className="flex gap-2">
                <TextInput
                  aria-label="Search booking details"
                  placeholder="Guest, booking ID, phone, property…"
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  className="min-w-0"
                />
                <Button type="submit" size="sm" aria-label="Run search" className="shrink-0 px-3">
                  <Search size={15} />
                </Button>
              </div>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                Source
              </span>
              <Select
                aria-label="Filter by source"
                value={filters.source}
                onChange={(event) =>
                  update({ source: event.target.value as DetailsFilters['source'] })
                }
              >
                {DETAILS_SOURCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                Property
              </span>
              <Select
                aria-label="Filter by property"
                value={filters.propertyId}
                onChange={(event) => update({ propertyId: event.target.value })}
              >
                <option value="">All properties</option>
                {(data?.properties ?? []).map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </Select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                Booking status
              </span>
              <Select
                aria-label="Filter by booking status"
                value={filters.status}
                onChange={(event) => update({ status: event.target.value })}
              >
                <option value="">All statuses</option>
                {DETAILS_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                Payment status
              </span>
              <Select
                aria-label="Filter by payment status"
                value={filters.paymentStatus}
                onChange={(event) => update({ paymentStatus: event.target.value })}
              >
                <option value="">All payment statuses</option>
                {DETAILS_PAYMENT_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                Date range
              </span>
              <Select
                aria-label="Date range preset"
                value={filters.preset}
                onChange={(event) =>
                  update({ preset: event.target.value as DetailsFilters['preset'] })
                }
              >
                {DETAILS_DATE_PRESET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                Date basis
              </span>
              <Select
                aria-label="Date basis"
                value={filters.dateBasis}
                onChange={(event) =>
                  update({ dateBasis: event.target.value as DetailsDateBasis })
                }
              >
                {DETAILS_DATE_BASIS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>

            {filters.preset === 'custom' ? (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Custom range
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <TextInput
                    aria-label="From date"
                    type="date"
                    value={filters.dateFrom}
                    onChange={(event) => update({ dateFrom: event.target.value })}
                    className="min-w-0 flex-1"
                  />
                  <span className="text-xs text-text-muted">to</span>
                  <TextInput
                    aria-label="To date"
                    type="date"
                    value={filters.dateTo}
                    onChange={(event) => update({ dateTo: event.target.value })}
                    className="min-w-0 flex-1"
                  />
                </div>
              </div>
            ) : null}
          </div>

          <p className="text-xs text-text-muted" data-testid="details-range-summary">
            <span className="font-semibold text-text-secondary">{basis?.summaryLabel}:</span>{' '}
            {basis?.hint}{' '}
            {data ? (
              <>
                Showing {formatDate(data.appliedQuery.range.from)} —{' '}
                {formatDate(data.appliedQuery.range.to)}.
              </>
            ) : null}
          </p>

          {/* On phones the table headers are not reachable, so sorting is also
              offered as an explicit control. */}
          <div className="flex flex-wrap items-center gap-2 border-t border-surface-300/30 pt-4 lg:hidden">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              Sort
            </span>
            <Select
              aria-label="Sort by"
              value={filters.sortBy}
              onChange={(event) =>
                update({ sortBy: event.target.value as DetailsSortField, sortOrder: 'asc' })
              }
              className="w-auto"
            >
              {DETAILS_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                update({
                  sortOrder: (filters.sortOrder === 'asc' ? 'desc' : 'asc') as DetailsSortOrder,
                })
              }
              aria-label={filters.sortOrder === 'asc' ? 'Sort descending' : 'Sort ascending'}
            >
              {filters.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            </Button>
          </div>
        </form>
      </div>

      {error ? (
        <div className="flex flex-col items-start gap-3">
          <ErrorBanner message={error} />
          <Button variant="secondary" size="sm" onClick={() => void load(filters)}>
            <RefreshCw size={14} />
            Retry
          </Button>
        </div>
      ) : null}
      {downloadError ? <ErrorBanner message={downloadError} /> : null}

      {/* Breakdowns */}
      {summary && (summary.byProperty.length > 0 || summary.byMonth.length > 0) ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Breakdown
            title="Bookings by property"
            rows={summary.byProperty.map((entry) => ({
              key: entry.key,
              label: entry.label,
              count: entry.count,
              detail: `${entry.nights} nights · ${entry.guests} guests · ${amountText(entry.amountPaise)}`,
            }))}
          />
          <Breakdown
            title="Bookings by month"
            rows={summary.byMonth.map((entry) => ({
              key: entry.key,
              label: entry.key,
              count: entry.count,
              detail: `${entry.nights} nights · ${entry.guests} guests · ${amountText(entry.amountPaise)}`,
            }))}
          />
        </div>
      ) : null}

      {/* Records — ONE list of records for every screen size. Each row is a real
          button (keyboard reachable, tap-anywhere on a phone) whose cells stack
          with visible labels on narrow screens and line up as columns on wide
          ones. Rendering a table and a card copy of the same booking would put
          every record in the DOM twice. */}
      <div className="glass overflow-x-auto rounded-3xl p-4 shadow-card">
        {/* Column legend, wide screens only. Below lg each cell carries its own
            label and the Sort control above takes over. */}
        <div
          className={cn(
            RECORD_GRID,
            'sticky top-0 z-10 rounded-2xl bg-surface-100/95 px-2 py-2.5 backdrop-blur',
            'hidden lg:grid'
          )}
        >
          {SORTABLE_COLUMNS.map(([field, label]) =>
            field ? (
              <button
                key={field}
                type="button"
                onClick={() => toggleSort(field)}
                className="text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted hover:text-text-primary"
                aria-label={`Sort by ${SORT_FIELD_LABEL[field]}`}
              >
                <span className="inline-flex items-center gap-1">
                  {label}
                  {filters.sortBy === field ? (
                    filters.sortOrder === 'asc' ? (
                      <ArrowUp size={11} />
                    ) : (
                      <ArrowDown size={11} />
                    )
                  ) : null}
                </span>
              </button>
            ) : (
              <span
                key={label}
                className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted"
              >
                {label}
              </span>
            )
          )}
        </div>

        {loading && records.length === 0 ? (
          <div className="flex items-center justify-center gap-3 py-12 text-sm text-text-muted">
            <Loader2 size={18} className="animate-spin" />
            Loading details…
          </div>
        ) : null}

        {!loading && records.length === 0 ? (
          <p className="py-10 text-center text-sm text-text-muted">
            No bookings match the selected filters.
          </p>
        ) : null}

        <ul className="flex flex-col">
          {records.map((record) => (
            <li key={record.key} className="border-t border-surface-300/30 first:border-t-0">
              <button
                type="button"
                onClick={() => setSelected(record)}
                className={cn(
                  RECORD_GRID,
                  'w-full px-2 py-3 text-left transition-colors hover:bg-surface-100/40'
                )}
              >
                <Cell label="Reference">
                  <span className="font-semibold text-text-primary">{record.reference}</span>
                </Cell>
                <Cell label="Source">
                  <span
                    className={cn(
                      'inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em]',
                      record.source === 'AIRBNB'
                        ? 'border-cyan/40 bg-cyan/10 text-cyan-bright'
                        : 'border-purple/40 bg-purple/10 text-purple-bright'
                    )}
                  >
                    {record.source}
                  </span>
                </Cell>
                <Cell label="Property">
                  <span className="text-text-secondary">{record.propertyName}</span>
                </Cell>
                <Cell label="Check-in">
                  <span className="text-text-secondary">{record.checkIn}</span>
                </Cell>
                <Cell label="Check-out">
                  <span className="text-text-secondary">{record.checkOut}</span>
                </Cell>
                <Cell label="Guest">
                  <span className="text-text-primary">{record.guestName}</span>
                </Cell>
                <Cell label="Aadhaar">
                  {/* Full number: this section is admin-only and the report is
                      meant to be usable for ID checks. */}
                  <span className="font-mono text-text-primary break-all">
                    {record.aadhaarNumber || '—'}
                  </span>
                </Cell>
                <Cell label="Guests">
                  <span className="text-text-secondary">{record.guestCount}</span>
                </Cell>
                <Cell label="Amount">
                  <span className="text-text-primary">{amountText(record.amountPaise)}</span>
                </Cell>
                <Cell label="Booked on">
                  <span className="text-text-secondary">
                    {formatTimestamp(record.bookingDate)}
                  </span>
                </Cell>
                <Cell label="Status">
                  <StatusPill status={record.status as PillStatus} />
                </Cell>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Pagination */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-text-muted">
          {loading ? 'Loading…' : `${total} record${total === 1 ? '' : 's'} · page ${page} of ${pageCount}`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-text-muted">
            Rows
            <Select
              aria-label="Rows per page"
              value={String(filters.pageSize)}
              onChange={(event) =>
                update({ pageSize: Number(event.target.value) as DetailsPageSize })
              }
              className="w-auto py-1.5"
            >
              {DETAILS_PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          </label>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => update({ page: Math.max(page - 1, 1) })}
            disabled={loading || page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft size={15} />
            Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => update({ page: Math.min(page + 1, pageCount) })}
            disabled={loading || page >= pageCount}
            aria-label="Next page"
          >
            Next
            <ChevronRight size={15} />
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {selected ? (
          <RecordDrawer record={selected} onClose={() => setSelected(null)} />
        ) : null}
      </AnimatePresence>
    </section>
  )
}

function Breakdown({
  title,
  rows,
}: {
  title: string
  rows: Array<{ key: string; label: string; count: number; detail: string }>
}) {
  return (
    <div className="glass rounded-3xl p-5 shadow-card">
      <h2 className="font-display text-base font-semibold text-text-primary">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">Nothing in this period.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-surface-300/25 pb-2 last:border-b-0"
            >
              <span className="text-sm text-text-primary">{row.label}</span>
              <span className="text-xs text-text-muted">{row.detail}</span>
              <span className="text-sm font-semibold text-text-primary">{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RecordDrawer({ record, onClose }: { record: DetailsRecord; onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`Booking details for ${record.reference}`}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-surface-300/50 bg-surface p-5 shadow-card sm:rounded-3xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-purple-bright">
              Source: {record.source}
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold break-words text-text-primary">
              {record.reference}
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              {record.propertyName} · {record.checkIn} → {record.checkOut} · {record.nights} nights
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close details">
            <X size={16} />
          </Button>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Detail label="Guest name" value={record.guestName} />
          {/* Full Aadhaar, deliberately unmasked. */}
          <Detail label="Aadhaar" value={record.aadhaarNumber || '—'} mono />
          <Detail
            label="Gender / Age"
            value={`${record.gender ? GENDER_LABEL[record.gender] : '—'}${record.age ? ` · ${record.age}` : ''}`}
          />
          <Detail label="Primary phone" value={record.primaryPhone} />
          <Detail label="Number of guests" value={String(record.guestCount)} />
          <Detail label="Booking status" value={record.status} />
          <Detail label="Payment status" value={record.paymentStatus ?? '—'} />
          <Detail label="Amount" value={amountText(record.amountPaise)} />
          <Detail
            label="Original / Discount"
            value={`${amountText(record.originalPricePaise)} / ${amountText(record.discountPaise)}`}
          />
          <Detail label="Coupon" value={record.couponCode ?? '—'} />
          <Detail label="Booking date" value={formatTimestamp(record.bookingDate)} />
          {record.utr ? <Detail label="UTR" value={record.utr} mono /> : null}
          {record.paymentSubmittedAt ? (
            <Detail label="Payment submitted" value={formatTimestamp(record.paymentSubmittedAt)} />
          ) : null}
          {record.paymentAcceptedAt ? (
            <Detail label="Payment accepted" value={formatTimestamp(record.paymentAcceptedAt)} />
          ) : null}
          {record.paymentRejectedAt ? (
            <Detail label="Payment rejected" value={formatTimestamp(record.paymentRejectedAt)} />
          ) : null}
          {record.rejectionMessage ? (
            <Detail label="Rejection message" value={record.rejectionMessage} />
          ) : null}
          {record.notes ? <Detail label="Notes" value={record.notes} /> : null}
        </dl>

        <h3 className="mt-7 font-display text-base font-semibold text-text-primary">
          Guests ({record.guests.length})
        </h3>
        <ul className="mt-3 flex flex-col gap-2">
          {record.guests.map((guest) => (
            <li
              key={guest.id}
              className="rounded-2xl border border-surface-300/40 bg-surface-100/30 p-3 text-sm"
            >
              <p className="font-semibold break-words text-text-primary">
                {guest.fullName}
                {guest.isPrimary ? (
                  <span className="ml-2 rounded-full bg-purple/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-purple-bright">
                    Primary
                  </span>
                ) : null}
              </p>
              <p className="mt-1 font-mono break-all text-text-secondary">{guest.aadhaarNumber}</p>
              <p className="mt-0.5 text-xs text-text-muted">
                {GENDER_LABEL[guest.gender]} · Age {guest.age}
                {guest.phone ? ` · ${guest.phone}` : ''}
              </p>
            </li>
          ))}
        </ul>
      </motion.div>
    </motion.div>
  )
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
        {label}
      </dt>
      <dd
        className={cn(
          'mt-1 break-words text-sm text-text-primary',
          mono ? 'font-mono' : undefined
        )}
      >
        {value}
      </dd>
    </div>
  )
}
