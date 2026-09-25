import { test } from 'node:test'
import assert from 'node:assert/strict'
import { A4_LANDSCAPE, A4_PORTRAIT, PdfDocument, drawPdfTable, measureText, truncateText } from '../src/lib/pdf.js'

/**
 * The Details PDF is written by hand, so these tests pin the parts a viewer
 * depends on: the header, the page tree, the xref offsets and the text runs.
 */

test('a generated document is a valid, self-describing PDF', () => {
  const doc = new PdfDocument({ title: 'AURA HOMES — Booking Details Report' })
  doc.addPage()
  doc.text('AURA HOMES', 28, 30, { size: 18, font: 'bold' })
  const bytes = doc.build()
  const text = bytes.toString('latin1')

  assert.equal(text.slice(0, 8), '%PDF-1.4')
  assert.ok(text.trimEnd().endsWith('%%EOF'))
  assert.ok(text.includes('/Type /Catalog'))
  assert.ok(text.includes('/Type /Pages'))
  assert.ok(text.includes('/Type /Page'))
  assert.ok(text.includes('AURA HOMES'))
  assert.ok(text.includes('/BaseFont /Helvetica'))
  assert.ok(text.includes('/BaseFont /Helvetica-Bold'))
  assert.ok(text.includes('/Encoding /WinAnsiEncoding'))
})

test('the xref table points at the real object offsets', () => {
  const doc = new PdfDocument()
  doc.addPage()
  doc.text('offset check', 40, 60)
  const text = doc.build().toString('latin1')

  const startxref = Number(text.slice(text.lastIndexOf('startxref')).split(/\s+/)[1])
  assert.equal(text.slice(startxref, startxref + 4), 'xref')

  // Every entry must address the byte position where its object header lives.
  const entries = text
    .slice(startxref)
    .split('\n')
    .slice(2)
    .filter((line) => line.endsWith(' n '))
  assert.ok(entries.length > 0)
  for (const [index, entry] of entries.entries()) {
    const offset = Number(entry.slice(0, 10))
    assert.equal(
      text.slice(offset, offset + `${index + 1} 0 obj`.length),
      `${index + 1} 0 obj`,
      `object ${index + 1} is not at its recorded xref offset`
    )
  }
})

test('page count and the /Count entry stay in step', () => {
  const doc = new PdfDocument()
  assert.equal(doc.pageCount, 0)
  doc.addPage()
  doc.text('one', 20, 20)
  doc.addPage()
  doc.text('two', 20, 20)
  assert.equal(doc.pageCount, 2)
  assert.equal((doc.build().toString('latin1').match(/\/Type \/Page[^s]/g) ?? []).length, 2)
  assert.ok(doc.build().toString('latin1').includes('/Count 2'))
})

test('landscape A4 is used for the wide report table', () => {
  const doc = new PdfDocument({ pageSize: A4_LANDSCAPE })
  doc.addPage()
  const text = doc.build().toString('latin1')
  assert.ok(text.includes('/MediaBox [0 0 841.89 595.28]'))
  assert.ok(A4_LANDSCAPE.width > A4_LANDSCAPE.height)
  assert.ok(A4_PORTRAIT.height > A4_PORTRAIT.width)
})

test('text is escaped so a parenthesis cannot corrupt the content stream', () => {
  const doc = new PdfDocument()
  doc.addPage()
  doc.text('Aadhaar (123456789012) \\ raw', 20, 20)
  const text = doc.build().toString('latin1')
  assert.ok(text.includes('\\(123456789012\\)'))
  assert.ok(text.includes('\\\\'))
  assert.ok(text.includes('Aadhaar (123456789012)'.replace(/[()]/g, '')) === false)
})

test('non-Latin1 characters degrade to "?" rather than breaking the byte stream', () => {
  const doc = new PdfDocument()
  doc.addPage()
  doc.text('Ravi ₹ 500 — Sharma', 20, 20)
  const text = doc.build().toString('latin1')
  assert.ok(text.includes('Ravi ? 500 ? Sharma'))
  assert.ok(!doc.build().toString('latin1').includes('₹'))
})

test('text measurement and truncation respect the available width', () => {
  assert.ok(measureText('ABC', 10) > measureText('ABC', 5))
  assert.ok(measureText('mm', 10, 'bold') > measureText('mm', 10))

  const truncated = truncateText('Aura Cozy Penthouse One', 40, 8)
  assert.ok(truncated.endsWith('...'))
  assert.ok(measureText(truncated, 8) <= 40)
  assert.equal(truncateText('short', 500, 8), 'short')
})

test('a table repeats its header on every page', () => {
  const doc = new PdfDocument({ pageSize: A4_LANDSCAPE })
  doc.addPage()
  const columns = [
    { header: 'ID', width: 100 },
    { header: 'Guest', width: 200 },
  ]
  // Enough rows to overflow a single landscape page.
  const rows = Array.from({ length: 200 }, (_, index) => [`ID-${index}`, `Guest ${index}`])
  const result = drawPdfTable(doc, { columns, rows, x: 20, y: 40 })

  assert.equal(result.drawn, 200)
  assert.equal(result.truncated, false)
  assert.ok(doc.pageCount > 1, 'the table should have flowed onto a second page')
  // Two header rows (one per page) plus the data rows.
  const text = doc.build().toString('latin1')
  assert.equal((text.match(/\(ID\) Tj/g) ?? []).length, doc.pageCount)
  assert.ok(text.includes('(Guest 199) Tj'))
})

test('drawPdfTable reports truncation instead of silently dropping rows', () => {
  const doc = new PdfDocument({ pageSize: A4_LANDSCAPE })
  doc.addPage()
  const result = drawPdfTable(doc, {
    columns: [{ header: 'ID', width: 100 }],
    rows: Array.from({ length: 50 }, (_, index) => [`ID-${index}`]),
    x: 20,
    y: 40,
    maxRows: 10,
  })
  assert.equal(result.drawn, 10)
  assert.equal(result.truncated, true)
})
