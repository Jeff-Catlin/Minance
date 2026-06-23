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

  // JS Date object (from SheetJS cellDates:true)
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null
    return value.toISOString().slice(0, 10)
  }

  const str = String(value).trim()
  if (!str) return null

  // Try common formats: MM/DD/YYYY, YYYY-MM-DD, M/D/YYYY, etc.
  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) {
    // new Date() can misparse "1/2/2024" as UTC; re-interpret as local
    const parts = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (parts) {
      const [, m, d, y] = parts
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
    return parsed.toISOString().slice(0, 10)
  }

  return null
}

function toAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  // Strip currency symbols, commas, spaces, parentheses (accounting negatives)
  const str = String(value).replace(/[$,\s]/g, '').replace(/\((.+)\)/, '-$1')
  const n = parseFloat(str)
  return isNaN(n) ? null : Math.abs(n) // always store positive; type field carries direction
}

export async function parseFile(file: File): Promise<ParseResult> {
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]

  // Get raw rows with header row
  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    raw: false,
    defval: null,
    dateNF: 'yyyy-mm-dd',
  })

  if (raw.length === 0) {
    return { rows: [], skipped: 0, error: 'The file appears to be empty.' }
  }

  // Normalise header keys to lowercase, trimmed
  const normalised = raw.map(row => {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(row)) {
      out[key.trim().toLowerCase()] = row[key]
    }
    return out
  })

  // Check required columns exist
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
    const date = toISODate(row['date'])
    const amount = toAmount(row['amount'])
    const type = String(row['type'] ?? '').trim().toLowerCase()
    const vendor = String(row['vendor'] ?? '').trim()

    if (!date || amount === null || !['expense', 'income', 'card_payment'].includes(type) || !vendor) {
      skipped++
      continue
    }

    rows.push({
      date,
      amount,
      type: type as 'expense' | 'income' | 'card_payment',
      description: row['description'] ? String(row['description']).trim() : null,
      vendor,
      rawCategory: row['category'] ? String(row['category']).trim() : null,
      category_id: null,
      categoryName: null,
    })
  }

  return { rows, skipped }
}
