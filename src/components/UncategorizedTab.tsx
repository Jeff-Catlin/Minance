import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import type { Category, Transaction, TransactionSplit } from '../types'
import SplitModal from './SplitModal'
import RowMenu from './RowMenu'
import EditTransactionModal from './EditTransactionModal'
import { useSettings } from '../context/SettingsContext'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y}`
}

function formatAmount(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    overflow: 'hidden',
  } as React.CSSProperties,

  th: {
    textAlign: 'left' as const,
    padding: '10px 14px',
    borderBottom: '2px solid var(--color-border)',
    color: 'var(--color-text-muted)',
    fontWeight: 600,
    fontSize: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    background: 'var(--color-surface)',
    position: 'sticky' as const,
    top: 0,
  } as React.CSSProperties,

  td: {
    padding: '10px 14px',
    borderBottom: '1px solid var(--color-border)',
    color: 'var(--color-text)',
    verticalAlign: 'middle' as const,
  } as React.CSSProperties,

  select: {
    fontFamily: 'inherit',
    fontSize: '13px',
    padding: '4px 8px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    cursor: 'pointer',
    maxWidth: '180px',
  } as React.CSSProperties,

  btn: (variant: 'primary' | 'ghost' | 'split') => ({
    fontFamily: 'inherit',
    fontSize: '12px',
    fontWeight: 500,
    padding: '4px 10px',
    borderRadius: '6px',
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
    ...(variant === 'split' && {
      background: 'transparent',
      borderColor: 'var(--color-border)',
      color: 'var(--color-primary-text)',
    }),
  }) as React.CSSProperties,

  bulkBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    background: 'rgba(34,195,166,0.06)',
    border: '1px solid rgba(34,195,166,0.25)',
    borderRadius: '10px',
    marginBottom: '12px',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,

  empty: {
    padding: '48px 24px',
    textAlign: 'center' as const,
    color: 'var(--color-text-muted)',
  } as React.CSSProperties,
}

// ── Component ─────────────────────────────────────────────────────────────────

interface UncategorizedTabProps {
  onCountChange: (count: number) => void
}

export default function UncategorizedTab({ onCountChange }: UncategorizedTabProps) {
  const { currencySymbol } = useSettings()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkCategoryId, setBulkCategoryId] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [splitModal, setSplitModal] = useState<{ tx: Transaction; splits: TransactionSplit[] } | null>(null)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  async function load() {
    const [{ data: txns }, { data: cats }] = await Promise.all([
      supabase
        .from('transactions')
        .select('*')
        .is('category_id', null)
        .eq('is_split', false)
        .neq('type', 'card_payment')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('categories').select('*').eq('is_archived', false).order('name'),
    ])
    const rows = txns ?? []
    setTransactions(rows)
    setCategories(cats ?? [])
    onCountChange(rows.length)
    setSelected(new Set())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ── Category options ──────────────────────────────────────────────────────

  const parents = useMemo(() => categories.filter(c => c.parent_id === null), [categories])
  const categoryOptions = useMemo(() => parents.flatMap(p => [
    { id: p.id, label: p.name, indent: false },
    ...categories.filter(c => c.parent_id === p.id).map(c => ({ id: c.id, label: c.name, indent: true })),
  ]), [parents, categories])

  // ── Selection helpers ─────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAllByVendor(vendor: string) {
    setSelected(prev => {
      const next = new Set(prev)
      transactions.filter(t => t.vendor === vendor).forEach(t => next.add(t.id))
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === transactions.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(transactions.map(t => t.id)))
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleCategoryChange(txId: string, categoryId: string) {
    if (!categoryId) return
    setSaving(txId)
    await supabase.from('transactions').update({ category_id: categoryId }).eq('id', txId)
    setSaving(null)
    const updated = transactions.filter(t => t.id !== txId)
    setTransactions(updated)
    onCountChange(updated.length)
    setSelected(prev => { const n = new Set(prev); n.delete(txId); return n })
  }

  async function handleBulkAssign() {
    if (!bulkCategoryId || selected.size === 0) return
    setBulkSaving(true)
    const ids = [...selected]
    await supabase.from('transactions').update({ category_id: bulkCategoryId }).in('id', ids)
    setBulkSaving(false)
    setBulkCategoryId('')
    const updated = transactions.filter(t => !selected.has(t.id))
    setTransactions(updated)
    onCountChange(updated.length)
    setSelected(new Set())
  }

  async function handleDelete(txId: string) {
    await supabase.from('transaction_splits').delete().eq('transaction_id', txId)
    await supabase.from('transactions').delete().eq('id', txId)
    const updated = transactions.filter(t => t.id !== txId)
    setTransactions(updated)
    onCountChange(updated.length)
    setConfirmDeleteId(null)
  }

  async function openSplitModal(tx: Transaction) {
    const { data: splits } = await supabase
      .from('transaction_splits')
      .select('*')
      .eq('transaction_id', tx.id)
    setSplitModal({ tx, splits: splits ?? [] })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>

  const allSelected = selected.size === transactions.length && transactions.length > 0

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
          Uncategorized
        </h2>
        <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
          {transactions.length} {transactions.length === 1 ? 'transaction' : 'transactions'} remaining
        </span>
      </div>

      {/* Bulk assign bar */}
      {selected.size > 0 && (
        <div style={s.bulkBar}>
          <span style={{ fontSize: '13px', color: 'var(--color-text)', fontWeight: 500 }}>
            {selected.size} selected
          </span>
          <select
            style={{ ...s.select, maxWidth: '200px' }}
            value={bulkCategoryId}
            onChange={e => setBulkCategoryId(e.target.value)}
          >
            <option value="">Assign category…</option>
            {categoryOptions.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.indent ? `  ${opt.label}` : opt.label}</option>
            ))}
          </select>
          <button
            style={s.btn('primary')}
            onClick={handleBulkAssign}
            disabled={!bulkCategoryId || bulkSaving}
          >
            {bulkSaving ? 'Saving…' : 'Assign to all selected'}
          </button>
          <button style={s.btn('ghost')} onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div style={s.card}>
        {transactions.length === 0 ? (
          <div style={s.empty}>
            All caught up — no uncategorized transactions.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: '600px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr>
                  <th style={{ ...s.th, width: '36px' }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  <th style={s.th}>Date</th>
                  <th style={s.th}>Vendor</th>
                  <th style={s.th}>Description</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Amount</th>
                  <th style={s.th}>Category</th>
                  <th style={{ ...s.th, width: '64px' }}></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => (
                  <tr key={t.id} style={{ background: selected.has(t.id) ? 'rgba(34,195,166,0.04)' : undefined }}>
                    <td style={{ ...s.td, width: '36px' }}>
                      <input
                        type="checkbox"
                        checked={selected.has(t.id)}
                        onChange={() => toggleSelect(t.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ ...s.td, whiteSpace: 'nowrap', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                      {formatDate(t.date)}
                    </td>
                    <td style={{ ...s.td, fontWeight: 500 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {t.vendor}
                        <button
                          style={{
                            fontFamily: 'inherit',
                            fontSize: '10px',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            border: '1px solid var(--color-border)',
                            background: 'transparent',
                            color: 'var(--color-text-muted)',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                          onClick={() => selectAllByVendor(t.vendor)}
                          title={`Select all ${t.vendor} transactions`}
                        >
                          select all
                        </button>
                      </div>
                    </td>
                    <td style={{ ...s.td, color: 'var(--color-text-muted)', fontSize: '13px' }}>
                      {t.description ?? '—'}
                    </td>
                    <td style={{
                      ...s.td,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      whiteSpace: 'nowrap',
                      fontWeight: 500,
                      color: t.type === 'income' ? 'var(--color-income)' : 'var(--color-expense)',
                    }}>
                      {t.type === 'income' ? '+' : '−'}{currencySymbol}{formatAmount(t.amount)}
                    </td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <select
                          style={{ ...s.select, opacity: saving === t.id ? 0.5 : 1 }}
                          value=""
                          disabled={saving === t.id}
                          onChange={e => handleCategoryChange(t.id, e.target.value)}
                        >
                          <option value="">Assign…</option>
                          {categoryOptions.map(opt => (
                            <option key={opt.id} value={opt.id}>
                              {opt.indent ? `  ${opt.label}` : opt.label}
                            </option>
                          ))}
                        </select>
                        <button style={s.btn('split')} onClick={() => openSplitModal(t)}>
                          Split
                        </button>
                      </div>
                    </td>
                    <td style={{ ...s.td, width: '64px', padding: '10px 4px' }}>
                      {confirmDeleteId === t.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <button onClick={() => handleDelete(t.id)} style={{ fontFamily: 'inherit', fontSize: '10px', padding: '2px 5px', borderRadius: '4px', border: '1px solid var(--color-expense)', background: 'var(--color-expense)', color: '#fff', cursor: 'pointer' }}>✓ Delete</button>
                          <button onClick={() => setConfirmDeleteId(null)} style={{ fontFamily: 'inherit', fontSize: '10px', padding: '2px 5px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}>✕ Cancel</button>
                        </div>
                      ) : (
                        <RowMenu items={[
                          { label: 'Edit transaction', onClick: () => setEditingTx(t) },
                          ...(t.source !== 'sync' ? [{ label: 'Delete transaction', danger: true, onClick: () => setConfirmDeleteId(t.id) }] : []),
                        ]} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {splitModal && (
        <SplitModal
          transaction={splitModal.tx}
          existingSplits={splitModal.splits}
          categories={categories}
          onSave={() => { setSplitModal(null); load() }}
          onClose={() => setSplitModal(null)}
        />
      )}

      {editingTx && (
        <EditTransactionModal
          transaction={editingTx}
          onSave={() => { setEditingTx(null); load() }}
          onClose={() => setEditingTx(null)}
        />
      )}
    </div>
  )
}
