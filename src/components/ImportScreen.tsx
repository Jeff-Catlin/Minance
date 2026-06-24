import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseFile } from '../logic/importParser'
import { categorizeRows } from '../logic/categorize'
import type { Account, Category, ParsedRow, Transaction } from '../types'

function matchAccounts(rows: ParsedRow[], accounts: Account[]): ParsedRow[] {
  if (!accounts.length) return rows
  // Build lookup: various text representations → account_id
  const lookup = new Map<string, { id: string; name: string }>()
  for (const a of accounts) {
    const entry = { id: a.id, name: a.name }
    lookup.set(a.name.toLowerCase(), entry)
    if (a.last_four) {
      lookup.set(`${a.name.toLowerCase()} ••••${a.last_four}`, entry)
      lookup.set(`${a.name.toLowerCase()} ${a.last_four}`, entry)
      lookup.set(a.last_four, entry)
    }
  }
  return rows.map(row => {
    if (!row.account || row.account_id) return row
    const match = lookup.get(row.account.toLowerCase())
    return match ? { ...row, account_id: match.id, accountName: match.name } : row
  })
}

const BATCH_SIZE = 500

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '16px',
  } as React.CSSProperties,

  heading: {
    fontSize: '20px',
    fontWeight: 600,
    color: 'var(--color-text)',
    margin: '0 0 24px 0',
  } as React.CSSProperties,

  subheading: {
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--color-text)',
    margin: '0 0 8px 0',
  } as React.CSSProperties,

  muted: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    margin: '0 0 4px 0',
    lineHeight: 1.6,
  } as React.CSSProperties,

  btn: (variant: 'primary' | 'ghost' | 'danger') => ({
    fontFamily: 'inherit',
    fontSize: '14px',
    fontWeight: 500,
    padding: '8px 18px',
    borderRadius: '8px',
    cursor: 'pointer',
    border: '1px solid',
    ...(variant === 'primary' && {
      background: 'var(--color-primary-text)',
      borderColor: 'var(--color-primary-text)',
      color: '#fff',
    }),
    ...(variant === 'ghost' && {
      background: 'transparent',
      borderColor: 'var(--color-border)',
      color: 'var(--color-text-muted)',
    }),
    ...(variant === 'danger' && {
      background: 'transparent',
      borderColor: 'var(--color-expense)',
      color: 'var(--color-expense)',
    }),
  }) as React.CSSProperties,

  notice: (type: 'error' | 'success' | 'info') => ({
    fontSize: '13px',
    padding: '10px 14px',
    borderRadius: '8px',
    marginBottom: '16px',
    whiteSpace: 'pre-wrap' as const,
    ...(type === 'error' && {
      background: 'rgba(224,107,107,0.1)',
      color: 'var(--color-expense)',
      border: '1px solid var(--color-expense)',
    }),
    ...(type === 'success' && {
      background: 'rgba(59,167,118,0.1)',
      color: 'var(--color-income)',
      border: '1px solid var(--color-income)',
    }),
    ...(type === 'info' && {
      background: 'rgba(34,195,166,0.08)',
      color: 'var(--color-primary-text)',
      border: '1px solid var(--color-primary)',
    }),
  }) as React.CSSProperties,

  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13px',
  } as React.CSSProperties,

  th: {
    textAlign: 'left' as const,
    padding: '8px 10px',
    borderBottom: '2px solid var(--color-border)',
    color: 'var(--color-text-muted)',
    fontWeight: 600,
    fontSize: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  } as React.CSSProperties,

  td: {
    padding: '8px 10px',
    borderBottom: '1px solid var(--color-border)',
    color: 'var(--color-text)',
    verticalAlign: 'top' as const,
  } as React.CSSProperties,
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ImportScreen() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [rows, setRows] = useState<ParsedRow[] | null>(null)
  const [skipped, setSkipped] = useState(0)
  const [fileName, setFileName] = useState('')
  const [saveResult, setSaveResult] = useState<{ imported: number; skipped: number } | null>(null)

  async function handleFile(file: File) {
    setParsing(true)
    setParseError(null)
    setRows(null)
    setSaveResult(null)
    setFileName(file.name)

    const result = await parseFile(file)

    if (result.error) {
      setParseError(result.error)
      setParsing(false)
      return
    }

    // Fetch categories, existing transactions, and accounts for matching
    const [{ data: cats }, { data: txns }, { data: accts }] = await Promise.all([
      supabase.from('categories').select('*').eq('is_archived', false),
      supabase.from('transactions').select('id,vendor,category_id,created_at').not('category_id', 'is', null),
      supabase.from('accounts').select('*').eq('is_active', true),
    ])

    const categories: Category[] = cats ?? []
    const accounts: Account[] = (accts ?? []) as Account[]
    const transactions: Transaction[] = (txns ?? []).map(t => ({
      ...t,
      date: '',
      amount: 0,
      type: 'expense' as const,
      description: null,
      account: null,
      account_id: null,
      is_split: false,
      source: 'import',
    }))

    const categorized = categorizeRows(result.rows, categories, transactions)
    const withAccounts = matchAccounts(categorized, accounts)
    setRows(withAccounts)
    setSkipped(result.skipped)
    setParsing(false)
  }

  async function handleSave() {
    if (!rows) return
    setSaving(true)
    setSaveResult(null)

    const toInsert = rows.map(r => ({
      date: r.date,
      amount: r.amount,
      type: r.type,
      description: r.description,
      vendor: r.vendor,
      account: r.account,
      account_id: r.account_id,
      category_id: r.category_id,
      source: 'import',
    }))

    let imported = 0
    let failed = 0

    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE)
      const { error } = await supabase.from('transactions').insert(batch)
      if (error) {
        failed += batch.length
      } else {
        imported += batch.length
      }
    }

    setSaving(false)
    setRows(null)
    setSaveResult({ imported, skipped: failed })
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const uncategorizedCount = rows ? rows.filter(r => !r.category_id).length : 0

  return (
    <div>
      <h2 style={s.heading}>Import Transactions</h2>

      {/* Format guide */}
      <div style={s.card}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <p style={s.subheading}>Required file format</p>
            <p style={s.muted}>Your spreadsheet (.xlsx or .csv) must have these column headers in the first row:</p>
            <p style={{ ...s.muted, fontFamily: 'monospace', marginTop: '8px' }}>
              <strong>Required:</strong> date · amount · type · vendor<br />
              <strong>Optional:</strong> description · category · account
            </p>
            <p style={{ ...s.muted, marginTop: '8px' }}>
              <strong>type</strong> accepts <code style={{ fontFamily: 'monospace', background: 'var(--color-border)', padding: '1px 4px', borderRadius: '4px' }}>expense</code>, <code style={{ fontFamily: 'monospace', background: 'var(--color-border)', padding: '1px 4px', borderRadius: '4px' }}>income</code>, or <code style={{ fontFamily: 'monospace', background: 'var(--color-border)', padding: '1px 4px', borderRadius: '4px' }}>card payment</code>.
              For expenses, a <strong>negative amount</strong> = purchase; a <strong>positive amount</strong> = refund/return (reduces the expense total).
            </p>
          </div>
          <button
            onClick={() => {
              const csv = 'date,amount,type,vendor,description,category,account\n'
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'minance-import-template.csv'
              a.click()
              URL.revokeObjectURL(url)
            }}
            style={{
              fontFamily: 'inherit', fontSize: '13px', fontWeight: 500,
              padding: '7px 14px', borderRadius: '8px', cursor: 'pointer',
              border: '1px solid var(--color-border)', background: 'transparent',
              color: 'var(--color-primary-text)', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            ↓ Download template
          </button>
        </div>
      </div>

      {/* Upload area */}
      {!rows && !parsing && (
        <div
          style={{
            ...s.card,
            border: '2px dashed var(--color-border)',
            textAlign: 'center',
            padding: '48px 24px',
            cursor: 'pointer',
          }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
        >
          <p style={{ margin: '0 0 12px', fontSize: '32px' }}>📂</p>
          <p style={{ margin: '0 0 8px', fontWeight: 600, color: 'var(--color-text)' }}>
            Click to choose a file, or drag and drop here
          </p>
          <p style={s.muted}>.xlsx or .csv</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
        </div>
      )}

      {parsing && (
        <div style={{ ...s.card, color: 'var(--color-text-muted)', textAlign: 'center', padding: '32px' }}>
          Reading {fileName}…
        </div>
      )}

      {parseError && (
        <div style={s.notice('error')}>{parseError}</div>
      )}

      {saveResult && (
        <div style={s.notice('success')}>
          Done! {saveResult.imported.toLocaleString()} transaction{saveResult.imported !== 1 ? 's' : ''} imported successfully.
          {saveResult.skipped > 0 && ` ${saveResult.skipped} failed to save.`}
        </div>
      )}

      {/* Preview */}
      {rows && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div>
              <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text)' }}>
                {rows.length.toLocaleString()} transaction{rows.length !== 1 ? 's' : ''} ready to import
                {skipped > 0 && <span style={{ color: 'var(--color-expense)', fontWeight: 400, fontSize: '13px' }}> · {skipped} row{skipped !== 1 ? 's' : ''} skipped (invalid)</span>}
              </p>
              {uncategorizedCount > 0 && (
                <p style={{ ...s.muted, marginTop: '4px' }}>
                  {uncategorizedCount} transaction{uncategorizedCount !== 1 ? 's' : ''} could not be auto-categorized — you can assign them after import.
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={s.btn('ghost')} onClick={() => { setRows(null); setParseError(null) }}>
                Cancel
              </button>
              <button style={s.btn('primary')} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : `Save ${rows.length.toLocaleString()} transactions`}
              </button>
            </div>
          </div>

          <div style={{ ...s.card, padding: 0, overflow: 'auto', maxHeight: '480px' }}>
            <table style={s.table}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--color-surface)' }}>
                <tr>
                  <th style={s.th}>Date</th>
                  <th style={s.th}>Vendor</th>
                  <th style={s.th}>Description</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Amount</th>
                  <th style={s.th}>Type</th>
                  <th style={s.th}>Category</th>
                  <th style={s.th}>Account</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td style={s.td}>{row.date}</td>
                    <td style={s.td}>{row.vendor}</td>
                    <td style={{ ...s.td, color: 'var(--color-text-muted)' }}>{row.description ?? '—'}</td>
                    <td style={{
                      ...s.td,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      color: ((row.type === 'expense' && row.amount < 0) || (row.type === 'income' && row.amount >= 0)) ? 'var(--color-income)' : 'var(--color-expense)',
                    }}>
                      {((row.type === 'expense' && row.amount < 0) || (row.type === 'income' && row.amount >= 0)) ? '+' : '−'}${Math.abs(row.amount).toFixed(2)}
                    </td>
                    <td style={s.td}>{row.type}</td>
                    <td style={{
                      ...s.td,
                      color: row.categoryName ? 'var(--color-text)' : 'var(--color-text-muted)',
                      fontStyle: row.categoryName ? 'normal' : 'italic',
                    }}>
                      {row.categoryName ?? 'Uncategorized'}
                    </td>
                    <td style={{
                      ...s.td,
                      color: row.accountName ? 'var(--color-text)' : row.account ? 'var(--color-text-muted)' : 'var(--color-text-muted)',
                      fontStyle: row.accountName ? 'normal' : 'italic',
                    }}>
                      {row.accountName ?? (row.account ? `${row.account} (no match)` : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
