import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Category, Transaction, TransactionSplit } from '../types'
import { useSettings } from '../context/SettingsContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SplitLine {
  key: string
  amount: string
  category_id: string
}

interface SplitModalProps {
  transaction: Transaction
  existingSplits: TransactionSplit[]
  categories: Category[]
  onSave: () => void
  onClose: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let _key = 0
function nextKey() { return String(++_key) }

function formatAmount(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y}`
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    padding: '28px',
    width: '500px',
    maxWidth: '95vw',
    maxHeight: '90vh',
    overflowY: 'auto' as const,
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
  },
  input: {
    fontFamily: 'inherit',
    fontSize: '14px',
    padding: '7px 10px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  select: {
    fontFamily: 'inherit',
    fontSize: '14px',
    padding: '7px 10px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    width: '100%',
    cursor: 'pointer',
  } as React.CSSProperties,
  btn: (variant: 'primary' | 'ghost' | 'remove') => ({
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 500,
    padding: '6px 16px',
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
    ...(variant === 'remove' && {
      background: 'transparent',
      border: 'none',
      color: 'var(--color-text-muted)',
      fontSize: '18px',
      padding: '0 6px',
      lineHeight: 1,
      cursor: 'pointer',
    }),
  }) as React.CSSProperties,
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SplitModal({ transaction, existingSplits, categories, onSave, onClose }: SplitModalProps) {
  const { currencySymbol } = useSettings()
  const initialLines: SplitLine[] = existingSplits.length >= 2
    ? existingSplits.map(sp => ({ key: nextKey(), amount: String(sp.amount), category_id: sp.category_id }))
    : [
        { key: nextKey(), amount: String(transaction.amount), category_id: '' },
        { key: nextKey(), amount: '', category_id: '' },
      ]

  const [lines, setLines] = useState<SplitLine[]>(initialLines)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const parents = categories.filter(c => c.parent_id === null)
  const categoryOptions = parents.flatMap(p => [
    { id: p.id, label: p.name, indent: false },
    ...categories.filter(c => c.parent_id === p.id).map(c => ({ id: c.id, label: c.name, indent: true })),
  ])

  const total = transaction.amount
  const allocated = lines.reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0)
  const remaining = Math.round((total - allocated) * 100) / 100

  function updateLine(key: string, field: 'amount' | 'category_id', value: string) {
    setLines(prev => prev.map(l => l.key === key ? { ...l, [field]: value } : l))
    setError('')
  }

  function addLine() {
    setLines(prev => [...prev, { key: nextKey(), amount: '', category_id: '' }])
  }

  function removeLine(key: string) {
    if (lines.length <= 2) return
    setLines(prev => prev.filter(l => l.key !== key))
    setError('')
  }

  async function handleSave() {
    if (lines.some(l => !l.category_id)) {
      setError('All split lines must have a category assigned.')
      return
    }
    if (lines.some(l => !l.amount || parseFloat(l.amount) <= 0)) {
      setError('All split lines must have a valid amount greater than zero.')
      return
    }
    if (remaining !== 0) {
      setError(
        remaining > 0
          ? `${currencySymbol}${formatAmount(remaining)} still unallocated — split lines must total $${formatAmount(total)}.`
          : `Split lines exceed the original amount by $${formatAmount(Math.abs(remaining))}.`
      )
      return
    }

    setSaving(true)
    await supabase.from('transaction_splits').delete().eq('transaction_id', transaction.id)
    const { error: err } = await supabase.from('transaction_splits').insert(
      lines.map(l => ({
        transaction_id: transaction.id,
        amount: parseFloat(l.amount),
        category_id: l.category_id,
      }))
    )
    if (err) { setError(err.message); setSaving(false); return }
    await supabase.from('transactions').update({ is_split: true, category_id: null }).eq('id', transaction.id)
    setSaving(false)
    onSave()
  }

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={s.modal}>
        {/* Header */}
        <p style={{ fontSize: '17px', fontWeight: 600, color: 'var(--color-text)', margin: '0 0 4px 0' }}>
          {existingSplits.length >= 2 ? 'Edit Split' : 'Split Transaction'}
        </p>
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: '0 0 20px 0' }}>
          {transaction.vendor} · {formatDate(transaction.date)} · Original total:{' '}
          <strong style={{ color: 'var(--color-text)' }}>{currencySymbol}{formatAmount(total)}</strong>
        </p>

        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 28px', gap: '8px', marginBottom: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Amount</span>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Category</span>
        </div>

        {/* Split lines */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
          {lines.map(line => (
            <div key={line.key} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 28px', gap: '8px', alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: '14px', pointerEvents: 'none' }}>{currencySymbol}</span>
                <input
                  style={{ ...s.input, paddingLeft: '22px' }}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={line.amount}
                  onChange={e => updateLine(line.key, 'amount', e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <select
                style={s.select}
                value={line.category_id}
                onChange={e => updateLine(line.key, 'category_id', e.target.value)}
              >
                <option value="">Select category…</option>
                {categoryOptions.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.indent ? `  ${opt.label}` : opt.label}</option>
                ))}
              </select>
              <button
                style={s.btn('remove')}
                onClick={() => removeLine(line.key)}
                disabled={lines.length <= 2}
                title="Remove line"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button style={{ ...s.btn('ghost'), marginBottom: '16px' }} onClick={addLine}>
          + Add line
        </button>

        {/* Remaining balance indicator */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px',
          borderRadius: '8px',
          marginBottom: '16px',
          background: remaining === 0 ? 'rgba(59,167,118,0.08)' : 'rgba(224,107,107,0.08)',
          border: `1px solid ${remaining === 0 ? 'var(--color-income)' : 'var(--color-expense)'}`,
        }}>
          <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
            {remaining === 0 ? 'Fully allocated' : remaining > 0 ? 'Remaining to allocate' : 'Over by'}
          </span>
          <span style={{
            fontSize: '13px',
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: remaining === 0 ? 'var(--color-income)' : 'var(--color-expense)',
          }}>
            {remaining === 0 ? '✓' : `${currencySymbol}${formatAmount(Math.abs(remaining))}`}
          </span>
        </div>

        {error && (
          <div style={{ marginBottom: '16px', fontSize: '13px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(224,107,107,0.1)', color: 'var(--color-expense)', border: '1px solid var(--color-expense)' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button style={s.btn('ghost')} onClick={onClose}>Cancel</button>
          <button style={s.btn('primary')} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save splits'}
          </button>
        </div>
      </div>
    </div>
  )
}
