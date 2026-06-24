import * as XLSX from 'xlsx'
import type { ParsedRow } from '../types'

const REQUIRED_COLUMNS = ['date', 'amount', 'type', 'vendor']

export interface ParseResult {
  rows: ParsedRow[]
  skipped: number
  error?: string
}

function toISODate(value: unknown): string | null {
  if (!value) return null

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null
    return value.toISOString().slice(0, 10)
  }

  const str = String(value).trim()
  if (!str) return null

  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) {
    const parts = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (parts) {
      const [, m, d, y] = parts
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
    return parsed.toISOString().slice(0, 10)
  }

  return null
}

function toRawNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  // Strip currency symbols, commas, spaces; convert accounting parens to negative
  const str = String(value).replace(/[$,\s]/g, '').replace(/\((.+)\)/, '-$1')
  const n = parseFloat(str)
  return isNaN(n) ? null : n  // preserve sign — caller decides how to use it
}

export async function parseFile(file: File): Promise<ParseResult> {
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]

  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    raw: false,
    defval: null,
    dateNF: 'yyyy-mm-dd',
  })

  if (raw.length === 0) {
    return { rows: [], skipped: 0, error: 'The file appears to be empty.' }
  }

  const normalised = raw.map(row => {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(row)) {
      out[key.trim().toLowerCase()] = row[key]
    }
    return out
  })

  const headers = Object.keys(normalised[0])
  const missing = REQUIRED_COLUMNS.filter(col => !headers.includes(col))
  if (missing.length > 0) {
    return {
      rows: [],
      skipped: 0,
      error:
        `Hmm, that file's missing some columns. Here's the format Minance expects:\n` +
        `Required: ${REQUIRED_COLUMNS.join(', ')}\n` +
        `Optional: description, category\n` +
        `Missing: ${missing.join(', ')}`,
    }
  }

  const rows: ParsedRow[] = []
  let skipped = 0

  for (const row of normalised) {
    const date   = toISODate(row['date'])
    const rawN   = toRawNumber(row['amount'])
    const type   = String(row['type'] ?? '').trim().toLowerCase().replace(/\s+/g, '_')
    const vendor = String(row['vendor'] ?? '').trim()

    if (!date || rawN === null || !['expense', 'income', 'card_payment'].includes(type) || !vendor) {
      skipped++
      continue
    }

    // Sign convention (bank statement style):
    //   expense:      negative file value = purchase (stored positive)
    //                 positive file value = refund/return (stored negative, reduces expense total)
    //   income:       positive file value = regular income (stored positive)
    //                 negative file value = income reduction/clawback (stored negative)
    //   card_payment: sign preserved — positive = money in (credit card receiving payment),
    //                 negative = money out (bank account sending payment)
    const amount = type === 'expense' ? -rawN : rawN

    rows.push({
      date,
      amount,
      type: type as 'expense' | 'income' | 'card_payment',
      description: row['description'] ? String(row['description']).trim() : null,
      vendor,
      account: row['account'] ? String(row['account']).trim() : null,
      account_id: null,
      accountName: null,
      rawCategory: row['category'] ? String(row['category']).trim() : null,
      category_id: null,
      categoryName: null,
      categorySource: null,
    })
  }

  return { rows, skipped }
}
