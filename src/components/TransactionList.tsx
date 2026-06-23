import { useState, useEffect, useMemo, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import type { Category, Transaction, TransactionSplit } from '../types'
import SplitModal from './SplitModal'
import { useSettings } from '../context/SettingsContext'

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  heading: {
    fontSize: '20px',
    fontWeight: 600,
    color: 'var(--color-text)',
    margin: 0,
  } as React.CSSProperties,

  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    overflow: 'hidden',
  } as React.CSSProperties,

  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '14px',
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

  filterInput: {
    fontFamily: 'inherit',
    fontSize: '13px',
    padding: '6px 10px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    outline: 'none',
  } as React.CSSProperties,

  filterSelect: {
    fontFamily: 'inherit',
    fontSize: '13px',
    padding: '6px 10px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    cursor: 'pointer',
  } as React.CSSProperties,

  clearBtn: {
    fontFamily: 'inherit',
    fontSize: '12px',
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid var(--color-border)',
    background: 'transparent',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
  } as React.CSSProperties,

  empty: {
    padding: '48px 24px',
    textAlign: 'center' as const,
    color: 'var(--color-text-muted)',
  } as React.CSSProperties,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y}`
}

function formatAmount(amount: number) {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Component ─────────────────────────────────────────────────────────────────

interface TransactionRow extends Transaction {
  categoryName: string | null
}

export default function TransactionList() {
  const { currencySymbol } = useSettings()
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [splitsMap, setSplitsMap] = useState<Map<string, TransactionSplit[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [expandedSplit, setExpandedSplit] = useState<string | null>(null)
  const [splitModal, setSplitModal] = useState<{ tx: Transaction; splits: TransactionSplit[] } | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  async function load() {
    const [{ data: txns }, { data: cats }, { data: splits }] = await Promise.all([
      supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('categories')
        .select('*')
        .eq('is_archived', false)
        .order('name'),
      supabase.from('transaction_splits').select('*'),
    ])

    const catMap = new Map((cats ?? []).map(c => [c.id, c.name]))
    setTransactions(
      (txns ?? []).map(t => ({
        ...t,
        categoryName: t.category_id ? (catMap.get(t.category_id) ?? null) : null,
      }))
    )
    setCategories(cats ?? [])

    const map = new Map<string, TransactionSplit[]>()
    for (const sp of splits ?? []) {
      if (!map.has(sp.transaction_id)) map.set(sp.transaction_id, [])
      map.get(sp.transaction_id)!.push(sp)
    }
    setSplitsMap(map)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleDelete(txId: string) {
    await supabase.from('transaction_splits').delete().eq('transaction_id', txId)
    await supabase.from('transactions').delete().eq('id', txId)
    setTransactions(prev => prev.filter(t => t.id !== txId))
    setConfirmDeleteId(null)
  }

  async function handleTypeChange(txId: string, newType: string) {
    setSaving(txId)
    await supabase.from('transactions').update({ type: newType, category_id: newType === 'card_payment' ? null : undefined }).eq('id', txId)
    setSaving(null)
    setTransactions(prev => prev.map(t => t.id === txId ? { ...t, type: newType as 'expense' | 'income' | 'card_payment', category_id: newType === 'card_payment' ? null : t.category_id, categoryName: newType === 'card_payment' ? null : t.categoryName } : t))
  }

  async function handleCategoryChange(txId: string, newCategoryId: string) {
    setSaving(txId)
    const category_id = newCategoryId === '' ? null : newCategoryId
    await supabase.from('transactions').update({ category_id }).eq('id', txId)
    setSaving(null)
    const catMap = new Map(categories.map(c => [c.id, c.name]))
    setTransactions(prev =>
      prev.map(t =>
        t.id === txId
          ? { ...t, category_id, categoryName: category_id ? (catMap.get(category_id) ?? null) : null }
          : t
      )
    )
  }

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return transactions.filter(t => {
      if (q && !t.vendor.toLowerCase().includes(q) && !(t.description ?? '').toLowerCase().includes(q)) return false
      if (filterCategory) {
        if (filterCategory === '__none__') { if (t.category_id) return false }
        else if (t.category_id !== filterCategory) return false
      }
      if (filterType && t.type !== filterType) return false
      if (filterFrom && t.date < filterFrom) return false
      if (filterTo && t.date > filterTo) return false
      return true
    })
  }, [transactions, search, filterCategory, filterType, filterFrom, filterTo])

  const hasFilters = search || filterCategory || filterType || filterFrom || filterTo

  function clearFilters() {
    setSearch('')
    setFilterCategory('')
    setFilterType('')
    setFilterFrom('')
    setFilterTo('')
  }

  // ── Category dropdown options ──────────────────────────────────────────────

  const parents = categories.filter(c => c.parent_id === null)
  const childrenOf = (id: string) => categories.filter(c => c.parent_id === id)
  const categoryOptions = parents.flatMap(p => [
    { id: p.id, label: p.name, indent: false },
    ...childrenOf(p.id).map(c => ({ id: c.id, label: c.name, indent: true })),
  ])

  if (loading) return (
    <p style={{ color: 'var(--color-text-muted)' }}>Loading transactions…</p>
  )

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2 style={s.heading}>Transactions</h2>
        <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
          {filtered.length !== transactions.length
            ? `${filtered.length.toLocaleString()} of ${transactions.length.toLocaleString()}`
            : `${transactions.length.toLocaleString()} total`}
        </span>
      </div>

      {/* Filter bar */}
      <div style={{
        display: 'flex',
        gap: '6px',
        alignItems: 'center',
        marginBottom: '12px',
        minWidth: 0,
      }}>
        <input
          style={{ ...s.filterInput, width: '150px', flexShrink: 0 }}
          placeholder="Search vendor…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <select style={{ ...s.filterSelect, flexShrink: 0 }} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="">All categories</option>
          <option value="__none__">Uncategorized</option>
          {categoryOptions.map(opt => (
            <option key={opt.id} value={opt.id}>
              {opt.indent ? `  ${opt.label}` : opt.label}
            </option>
          ))}
        </select>

        <select style={{ ...s.filterSelect, flexShrink: 0 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All types</option>
          <option value="expense">Expenses</option>
          <option value="income">Income</option>
          <option value="card_payment">Card Payments</option>
        </select>

        <input
          style={{ ...s.filterInput, width: '118px', flexShrink: 0 }}
          type="date"
          title="From date"
          value={filterFrom}
          onChange={e => setFilterFrom(e.target.value)}
        />
        <span style={{ color: 'var(--color-text-muted)', fontSize: '13px', flexShrink: 0 }}>–</span>
        <input
          style={{ ...s.filterInput, width: '118px', flexShrink: 0 }}
          type="date"
          title="To date"
          value={filterTo}
          onChange={e => setFilterTo(e.target.value)}
        />

        {hasFilters && (
          <button style={{ ...s.clearBtn, flexShrink: 0 }} onClick={clearFilters}>Clear</button>
        )}
      </div>

      {/* Table */}
      <div style={s.card}>
        {transactions.length === 0 ? (
          <div style={s.empty}>
            Nothing here yet — import some transactions to get started.
          </div>
        ) : filtered.length === 0 ? (
          <div style={s.empty}>
            No transactions match your filters.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: '600px', overflowY: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Date</th>
                  <th style={s.th}>Vendor</th>
                  <th style={s.th}>Description</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Amount</th>
                  <th style={s.th}>Category</th>
                  <th style={{ ...s.th, width: '32px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const txSplits = splitsMap.get(t.id) ?? []
                  const catMap = new Map(categories.map(c => [c.id, c.name]))
                  const isExpanded = expandedSplit === t.id
                  return (
                    <Fragment key={t.id}>
                      <tr>
                        <td style={{ ...s.td, whiteSpace: 'nowrap', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                          {formatDate(t.date)}
                        </td>
                        <td style={{ ...s.td, fontWeight: 500 }}>{t.vendor}</td>
                        <td style={{ ...s.td, color: 'var(--color-text-muted)', fontSize: '13px' }}>
                          {t.description ?? '—'}
                        </td>
                        <td style={{
                          ...s.td,
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          whiteSpace: 'nowrap',
                          fontWeight: 500,
                          color: t.type === 'income'
                            ? 'var(--color-income)'
                            : t.type === 'card_payment'
                              ? 'var(--color-text-muted)'
                              : 'var(--color-expense)',
                        }}>
                          {t.type === 'income' ? '+' : t.type === 'card_payment' ? '' : '−'}{currencySymbol}{formatAmount(t.amount)}
                          {t.type === 'card_payment' && (
                            <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 400 }}>Card Payment</div>
                          )}
                        </td>
                        <td style={s.td}>
                          {t.is_split ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <button
                                onClick={() => setExpandedSplit(isExpanded ? null : t.id)}
                                style={{
                                  fontFamily: 'inherit',
                                  fontSize: '12px',
                                  padding: '3px 8px',
                                  borderRadius: '20px',
                                  border: '1px solid var(--color-primary-text)',
                                  background: 'rgba(14,159,142,0.08)',
                                  color: 'var(--color-primary-text)',
                                  cursor: 'pointer',
                                  fontWeight: 500,
                                }}
                              >
                                Split {isExpanded ? '▲' : '▼'}
                              </button>
                              <button
                                style={{ ...s.select, maxWidth: '50px', padding: '3px 8px', fontSize: '12px', color: 'var(--color-text-muted)' }}
                                onClick={() => setSplitModal({ tx: t, splits: txSplits })}
                              >
                                Edit
                              </button>
                            </div>
                          ) : t.type === 'card_payment' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No category needed</span>
                              <select
                                style={{ ...s.select, maxWidth: '120px', fontSize: '11px', padding: '3px 6px', opacity: saving === t.id ? 0.5 : 1 }}
                                value={t.type}
                                disabled={saving === t.id}
                                onChange={e => handleTypeChange(t.id, e.target.value)}
                              >
                                <option value="expense">Expense</option>
                                <option value="income">Income</option>
                                <option value="card_payment">Card Payment</option>
                              </select>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <select
                                style={{
                                  ...s.select,
                                  opacity: saving === t.id ? 0.5 : 1,
                                  color: t.category_id ? 'var(--color-text)' : 'var(--color-text-muted)',
                                }}
                                value={t.category_id ?? ''}
                                disabled={saving === t.id}
                                onChange={e => handleCategoryChange(t.id, e.target.value)}
                              >
                                <option value="">Uncategorized</option>
                                {categoryOptions.map(opt => (
                                  <option key={opt.id} value={opt.id}>
                                    {opt.indent ? `  ${opt.label}` : opt.label}
                                  </option>
                                ))}
                              </select>
                              <select
                                style={{ ...s.select, maxWidth: '120px', fontSize: '11px', padding: '3px 6px', opacity: saving === t.id ? 0.5 : 1 }}
                                value={t.type}
                                disabled={saving === t.id}
                                onChange={e => handleTypeChange(t.id, e.target.value)}
                              >
                                <option value="expense">Expense</option>
                                <option value="income">Income</option>
                                <option value="card_payment">Card Payment</option>
                              </select>
                              <button
                                style={{
                                  fontFamily: 'inherit',
                                  fontSize: '12px',
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  border: '1px solid var(--color-border)',
                                  background: 'transparent',
                                  color: 'var(--color-primary-text)',
                                  cursor: 'pointer',
                                }}
                                onClick={() => setSplitModal({ tx: t, splits: [] })}
                              >
                                Split
                              </button>
                            </div>
                          )}
                        </td>
                        <td style={{ ...s.td, width: '32px', padding: '10px 8px' }}>
                          {t.source !== 'sync' && (
                            confirmDeleteId === t.id ? (
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                  onClick={() => handleDelete(t.id)}
                                  style={{ fontFamily: 'inherit', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--color-expense)', background: 'var(--color-expense)', color: '#fff', cursor: 'pointer' }}
                                >
                                  ✓
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  style={{ fontFamily: 'inherit', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(t.id)}
                                title="Delete transaction"
                                style={{ fontFamily: 'inherit', fontSize: '14px', padding: '2px 6px', borderRadius: '4px', border: 'none', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer', opacity: 0.4, lineHeight: 1 }}
                              >
                                ×
                              </button>
                            )
                          )}
                        </td>
                      </tr>
                      {t.is_split && isExpanded && (
                        <tr>
                          <td colSpan={6} style={{ padding: '0 14px 12px 28px', background: 'var(--color-bg)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                              <tbody>
                                {txSplits.map(sp => (
                                  <tr key={sp.id}>
                                    <td style={{ padding: '4px 8px', color: 'var(--color-text-muted)' }}>
                                      {catMap.get(sp.category_id) ?? 'Unknown category'}
                                    </td>
                                    <td style={{ padding: '4px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--color-expense)', fontWeight: 500 }}>
                                      {currencySymbol}{formatAmount(sp.amount)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
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
    </div>
  )
}
