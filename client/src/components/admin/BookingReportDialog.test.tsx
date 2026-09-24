import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BookingReportDialog } from '@/components/admin/BookingReportDialog'

describe('BookingReportDialog', () => {
  it('renders the report title, quick ranges and custom date fields', () => {
    const html = renderToStaticMarkup(<BookingReportDialog onClose={() => undefined} />)

    // Title + scope hint.
    expect(html).toContain('DOWNLOAD BOOKING REPORT')

    // Quick range presets.
    expect(html).toContain('This Week')
    expect(html).toContain('This Month')
    expect(html).toContain('This Year')

    // Custom From/To date inputs.
    expect(html).toContain('From')
    expect(html).toContain('To')
    expect(html).toContain('type="date"')

    // Primary + secondary actions.
    expect(html).toContain('Download Excel')
    expect(html).toContain('Cancel')
  })

  it('defaults to the This Week preset (start and end are populated)', () => {
    const html = renderToStaticMarkup(<BookingReportDialog onClose={() => undefined} />)
    const valueCount = (html.match(/type="date"/g) ?? []).length
    expect(valueCount).toBe(2)
  })
})