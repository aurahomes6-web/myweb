/**
 * Minimal, dependency-free PDF 1.4 writer.
 *
 * The Details PDF export needs landscape A4, a repeating table header across
 * multiple pages and full Aadhaar numbers. Rather than pull a heavyweight
 * layout library into the API for one report, this module writes the small
 * subset of PDF the report actually uses: the standard Helvetica faces, filled
 * rectangles, lines and single-line text runs.
 *
 * Notes
 *  - Coordinates are TOP-LEFT origin in points (x right, y down); the PDF's
 *    bottom-left origin is handled internally.
 *  - Text is limited to WinAnsi-representable characters. Anything outside
 *    Latin-1 is replaced with `?` instead of corrupting the byte stream.
 *  - Content streams are intentionally left UNCOMPRESSED so a report can be
 *    inspected (and tested) without a decompressor.
 */

/** Helvetica / Helvetica-Bold advance widths (1/1000 em) for ASCII 32–126. */
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]

const HELVETICA_BOLD_WIDTHS = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
]

export type PdfFont = 'regular' | 'bold'
export type PdfAlign = 'left' | 'right' | 'center'

export interface PdfTextOptions {
  size?: number
  font?: PdfFont
  align?: PdfAlign
  /** Truncate with an ellipsis when the run would exceed this width. */
  maxWidth?: number
}

export interface PdfPageSize {
  width: number
  height: number
}

/** A4 in points, portrait. */
export const A4_PORTRAIT: PdfPageSize = { width: 595.28, height: 841.89 }
/** A4 in points, landscape. */
export const A4_LANDSCAPE: PdfPageSize = { width: 841.89, height: 595.28 }

function sanitize(value: string): string {
  let out = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 63
    out += code >= 32 && code <= 255 ? char : '?'
  }
  return out
}

/** Escape the three characters that are special inside a PDF literal string. */
function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

export function measureText(value: string, size: number, font: PdfFont = 'regular'): number {
  const widths = font === 'bold' ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS
  const text = sanitize(value)
  let total = 0
  for (const char of text) {
    const code = char.charCodeAt(0)
    const index = code >= 32 && code <= 126 ? code - 32 : 0
    total += widths[index] ?? widths[0]
  }
  return (total * size) / 1000
}

/** Trim a run with a trailing "..." so it fits `maxWidth`. */
export function truncateText(value: string, maxWidth: number, size: number, font: PdfFont = 'regular'): string {
  const text = sanitize(value)
  if (measureText(text, size, font) <= maxWidth) return text

  const dotsWidth = measureText('...', size, font)
  let width = 0
  let out = ''
  for (const char of text) {
    const next = measureText(char, size, font)
    if (width + next + dotsWidth > maxWidth) break
    out += char
    width += next
  }
  return `${out}...`
}

export class PdfDocument {
  readonly pageSize: PdfPageSize
  private readonly title: string
  private readonly createdAt: Date
  private readonly streams: string[] = []

  constructor(options: { pageSize?: PdfPageSize; title?: string; createdAt?: Date } = {}) {
    this.pageSize = options.pageSize ?? A4_LANDSCAPE
    this.title = options.title ?? 'AURA HOMES'
    this.createdAt = options.createdAt ?? new Date()
  }

  /** Number of pages created so far. */
  get pageCount(): number {
    return this.streams.length
  }

  addPage(): void {
    this.streams.push('')
  }

  /** Ensure a page exists and return its content stream for appending. */
  private ops(): string {
    if (this.streams.length === 0) this.addPage()
    return this.streams[this.streams.length - 1]
  }

  private append(value: string): void {
    const stream = this.ops()
    this.streams[this.streams.length - 1] = stream + value
  }

  /** Convert a top-left y coordinate to PDF's bottom-left baseline origin. */
  private baseline(topY: number, fontSize: number): number {
    return this.pageSize.height - topY - fontSize
  }

  text(value: string, x: number, y: number, options: PdfTextOptions = {}): void {
    const size = options.size ?? 9
    const font = options.font ?? 'regular'
    const align = options.align ?? 'left'
    const fontRef = font === 'bold' ? '/F2' : '/F1'
    const text = options.maxWidth === undefined ? value : truncateText(value, options.maxWidth, size, font)
    const sanitized = sanitize(text)
    if (sanitized.length === 0) return

    const width = measureText(sanitized, size, font)
    let drawX = x
    if (align === 'right') drawX = x - width
    else if (align === 'center') drawX = x - width / 2

    this.append(
      `BT ${fontRef} ${size} Tf 1 0 0 1 ${drawX.toFixed(2)} ${this
        .baseline(y, size)
        .toFixed(2)} Tm (${escapeText(sanitized)}) Tj ET\n`
    )
  }

  /** Filled rectangle with an explicit 0–1 greyscale fill. */
  rect(x: number, y: number, width: number, height: number, grey: number): void {
    this.append(
      `${grey} g ${x.toFixed(2)} ${(this.pageSize.height - y - height).toFixed(2)} ${width.toFixed(
        2
      )} ${height.toFixed(2)} re f\n`
    )
  }

  line(x1: number, y1: number, x2: number, y2: number, grey = 0.6, width = 0.5): void {
    this.append(
      `${grey} G ${width} w ${x1.toFixed(2)} ${(this.pageSize.height - y1).toFixed(2)} m ${x2.toFixed(
        2
      )} ${(this.pageSize.height - y2).toFixed(2)} l S\n`
    )
  }

  /** Serialise the document to PDF bytes. */
  build(): Buffer {
    if (this.streams.length === 0) this.addPage()

    // Object layout: 1 catalog, 2 pages, 3/4 fonts, then a page + content pair.
    const objects: string[] = []
    const pageObjectNumbers: number[] = []
    let next = 5
    for (let i = 0; i < this.streams.length; i += 1) {
      pageObjectNumbers.push(next)
      next += 2
    }
    const infoObjectNumber = next

    objects.push(`<< /Type /Catalog /Pages 2 0 R >>`)
    objects.push(
      `<< /Type /Pages /Kids [${pageObjectNumbers
        .map((n) => `${n} 0 R`)
        .join(' ')}] /Count ${this.streams.length} >>`
    )
    objects.push(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
    )
    objects.push(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
    )

    const resources =
      '<< /Font << /F1 3 0 R /F2 4 0 R >> >>'

    this.streams.forEach((stream, index) => {
      const pageNumber = pageObjectNumbers[index]
      const contentNumber = pageNumber + 1
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.pageSize.width.toFixed(2)} ${this.pageSize.height.toFixed(
          2
        )}] /Resources ${resources} /Contents ${contentNumber} 0 R >>`
      )
      const body = stream
      objects.push(`<< /Length ${Buffer.byteLength(body, 'latin1')} >>\nstream\n${body}\nendstream`)
    })

    const pad = (value: number, size: number) => String(value).padStart(size, '0')
    const stamp = `${this.createdAt.getUTCFullYear()}${pad(this.createdAt.getUTCMonth() + 1, 2)}${pad(
      this.createdAt.getUTCDate(),
      2
    )}${pad(this.createdAt.getUTCHours(), 2)}${pad(this.createdAt.getUTCMinutes(), 2)}${pad(
      this.createdAt.getUTCSeconds(),
      2
    )}`
    objects.push(
      `<< /Title (${escapeText(sanitize(this.title))}) /Producer (AURA HOMES) /Creator (AURA HOMES Admin) /CreationDate (D:${stamp}Z) >>`
    )

    const header = '%PDF-1.4\n'
    let pdf = header
    const offsets: number[] = []
    let offset = Buffer.byteLength(header, 'latin1')

    objects.forEach((body, index) => {
      const chunk = `${index + 1} 0 obj\n${body}\nendobj\n`
      offsets.push(offset)
      pdf += chunk
      offset += Buffer.byteLength(chunk, 'latin1')
    })

    const xrefOffset = offset
    const lines = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n']
    for (const value of offsets) lines.push(`${pad(value, 10)} 00000 n \n`)
    pdf += lines.join('')
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoObjectNumber} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

    return Buffer.from(pdf, 'latin1')
  }
}

export interface PdfTableColumn {
  header: string
  width: number
  align?: PdfAlign
}

/**
 * Draw a table that flows across pages, re-drawing the header row on every new
 * page. Returns the y coordinate just below the last drawn row.
 */
export function drawPdfTable(
  doc: PdfDocument,
  options: {
    columns: PdfTableColumn[]
    rows: string[][]
    x: number
    y: number
    rowHeight?: number
    headerHeight?: number
    fontSize?: number
    bottomMargin?: number
    maxRows?: number
  }
): { y: number; drawn: number; truncated: boolean } {
  const {
    columns,
    rows,
    x,
    y,
    rowHeight = 14,
    headerHeight = 18,
    fontSize = 8,
    bottomMargin = 40,
    maxRows,
  } = options

  const limit = maxRows === undefined ? rows.length : Math.min(rows.length, maxRows)
  const drawHeader = (top: number) => {
    doc.rect(x, top, columns.reduce((sum, col) => sum + col.width, 0), headerHeight, 0.88)
    let cursor = x
    columns.forEach((column) => {
      doc.text(column.header, cursor + 3, top + 5, {
        size: fontSize,
        font: 'bold',
        align: column.align ?? 'left',
        maxWidth: column.width - 6,
      })
      cursor += column.width
    })
    return top + headerHeight
  }

  let cursorY = drawHeader(y)
  let drawn = 0

  for (let index = 0; index < limit; index += 1) {
    if (cursorY + rowHeight > doc.pageSize.height - bottomMargin) {
      doc.addPage()
      cursorY = drawHeader(28)
    }
    const cells = rows[index]
    if (index % 2 === 1) {
      doc.rect(x, cursorY, columns.reduce((sum, col) => sum + col.width, 0), rowHeight, 0.96)
    }
    let cellX = x
    columns.forEach((column, columnIndex) => {
      doc.text(cells[columnIndex] ?? '', cellX + 3, cursorY + 4, {
        size: fontSize,
        align: column.align ?? 'left',
        maxWidth: column.width - 6,
      })
      cellX += column.width
    })
    cursorY += rowHeight
    drawn += 1
  }

  doc.line(x, cursorY, x + columns.reduce((sum, col) => sum + col.width, 0), cursorY)
  return { y: cursorY, drawn, truncated: drawn < rows.length }
}
