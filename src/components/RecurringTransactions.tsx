import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import type { Category, Transaction } from '../types'

// ── Types ─────────────────────────────────────────────────────────────────────

type Cadence = 'monthly' | 'quarterly' | 'biannually' | 'annually'
type GraphMode = 'historical' | 'forecast'
type GraphFilter = 'all' | 'monthly'
type GraphRange = 1 | 3 | 6 | 12

interface RecurringEntry {
  id: string
  vendor: string
  category_id: string | null
  cadence: Cadence
  created_at: string
}

interface Suggestion {
  vendor: string
  category_id: string | null
  cadence: Cadence
  occurrences: number
  recentAmount: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CADENCE_LABELS: Record<Cadence, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  biannually: 'Biannually',
  annually: 'Annually',
}

const CADENCE_MONTHS: Record<Cadence, number> = {
  monthly: 1,
  quarterly: 3,
  biannually: 6,
  annually: 12,
}

const CADENCE_TARGET_DAYS: Record<Cadence, number> = {
  monthly: 30,
  quarterly: 91,
  biannually: 182,
  annually: 365,
}

const CADENCE_TOLERANCE: Record<Cadence, number> = {
  monthly: 5,
  quarterly: 10,
  biannually: 15,
  annually: 15,
}

const CADENCE_COLORS: Record<Cadence, string> = {
  monthly: 'var(--color-primary-text)',
  quarterly: '#8B5CF6',
  biannually: '#F59E0B',
  annually: '#EF4444',
}

// ── Pattern detection ─────────────────────────────────────────────────────────

function detectCadence(gaps: number[]): Cadence | null {
  if (gaps.length === 0) return null
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length
  for (const cadence of ['monthly', 'quarterly', 'biannually', 'annually'] as Cadence[]) {
    const target = CADENCE_TARGET_DAYS[cadence]
    const tol = CADENCE_TOLERANCE[cadence]
    if (Math.abs(avg - target) <= tol && gaps.every(g => Math.abs(g - target) <= tol * 2)) {
      return cadence
    }
  }
  return null
}

function detectPatterns(
  transactions: Transaction[],
  confirmed: RecurringEntry[],
  dismissedKeys: Set<string>,
): Suggestion[] {
  const confirmedKeys = new Set(confirmed.map(r => `${r.vendor}|||${r.category_id ?? ''}`))
  const groups = new Map<string, Transaction[]>()

  for (const t of transactions) {
    const key = `${t.vendor}|||${t.category_id ?? ''}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(t)
  }

  const results: Suggestion[] = []

  for (const [key, txns] of groups) {
    if (confirmedKeys.has(key) || dismissedKeys.has(key) || txns.length < 3) continue

    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date))
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      const ms = new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()
      gaps.push(Math.round(ms / 86400000))
    }

    const cadence = detectCadence(gaps)
    if (!cadence) continue

    const [vendor, catId] = key.split('|||')
    results.push({
      vendor,
      category_id: catId === '' ? null : catId,
      cadence,
      occurrences: txns.length,
      recentAmount: sorted[sorted.length - 1].amount,
    })
  }

  return results
}

// ── Graph helpers ─────────────────────────────────────────────────────────────

function buildHistoricalData(
  transactions: Transaction[],
  recurring: RecurringEntry[],
  filter: GraphFilter,
  range: GraphRange,
): { label: string; amount: number }[] {
  const now = new Date()
  const filtered = filter === 'monthly' ? recurring.filter(r => r.cadence === 'monthly') : recurring
  const keys = new Set(filtered.map(r => `${r.vendor}|||${r.category_id ?? ''}`))
  const data: { label: string; amount: number }[] = []

  for (let i = range - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = d.getMonth()
    const from = `${y}-${String(m + 1).padStart(2, '0')}-01`
    const to = `${y}-${String(m + 1).padStart(2, '0')}-${String(new Date(y, m + 1, 0).getDate()).padStart(2, '0')}`
    const label = d.toLocaleString('en-US', { month: 'short', year: '2-digit' })
    const amount = transactions
      .filter(t => keys.has(`${t.vendor}|||${t.category_id ?? ''}`) && t.date >= from && t.date <= to)
      .reduce((s, t) => s + t.amount, 0)
    data.push({ label, amount })
  }

  return data
}

function buildForecastData(
  transactions: Transaction[],
  recurring: RecurringEntry[],
  filter: GraphFilter,
  range: GraphRange,
): { label: string; amount: number }[] {
  const now = new Date()
  const filtered = filter === 'monthly' ? recurring.filter(r => r.cadence === 'monthly') : recurring
  const data: { label: string; amount: number }[] = []

  for (let i = 0; i < range; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const year = d.getFullYear()
    const month = d.getMonth()
    const label = d.toLocaleString('en-US', { month: 'short', year: '2-digit' })
    let amount = 0

    for (const r of filtered) {
      const matches = transactions
        .filter(t => t.vendor === r.vendor && t.category_id === r.category_id)
        .sort((a, b) => b.date.localeCompare(a.date))
      if (matches.length === 0) continue

      const lastDate = new Date(matches[0].date)
      const lastAmount = matches[0].amount
      const intervalMonths = CADENCE_MONTHS[r.cadence]

      let proj = new Date(lastDate)
      for (let n = 1; n <= 24; n++) {
        proj = new Date(proj.getFullYear(), proj.getMonth() + intervalMonths, proj.getDate())
        if (proj.getFullYear() === year && proj.getMonth() === month) {
          amount += lastAmount
          break
        }
        if (proj.getFullYear() > year || (proj.getFullYear() === year && proj.getMonth() > month)) break
      }
    }

    data.push({ label, amount })
  }

  return data
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatAmount(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y}`
}

// ── Bar Chart ─────────────────────────────────────────────────────────────────

function BarChart({ data }: { data: { label: string; amount: number }[] }) {
  const max = Math.max(...data.map(d => d.amount), 1)
  const BAR_H = 100
  const BAR_W = 30
  const GAP = 10
  const LABEL_H = 20
  const totalW = data.length * (BAR_W + GAP) - GAP

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg
        width={totalW}
        height={BAR_H + LABEL_H + 8}
        style={{ display: 'block', minWidth: '100%', overflow: 'visible' }}
      >
        {data.map((d, i) => {
          const barH = d.amount > 0 ? Math.max((d.amount / max) * BAR_H, 4) : 0
          const x = i * (BAR_W + GAP)
          return (
            <g key={d.label}>
              <title>{`${d.label}: $${formatAmount(d.amount)}`}</title>
              <rect
                x={x}
                y={BAR_H - barH}
                width={BAR_W}
                height={barH > 0 ? barH : 2}
                fill={barH > 0 ? 'var(--color-expense)' : 'var(--color-border)'}
                rx={3}
                opacity={d.amount === 0 ? 0.3 : 1}
              />
              <text
                x={x + BAR_W / 2}
                y={BAR_H + LABEL_H}
                textAnchor="middle"
                fontSize={9}
                fill="var(--color-text-muted)"
              >
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  heading: {
    fontSize: '20px',
    fontWeight: 600,
    color: 'var(--color-text)',
    margin: 0,
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--color-text)',
    margin: '0 0 14px 0',
  } as React.CSSProperties,

  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    padding: '20px 24px',
    marginBottom: '16px',
  } as React.CSSProperties,

  suggestionCard: {
    background: 'rgba(250, 204, 21, 0.06)',
    border: '1px solid rgba(250, 204, 21, 0.35)',
    borderRadius: '12px',
    padding: '20px 24px',
    marginBottom: '16px',
  } as React.CSSProperties,

  btn: (variant: 'primary' | 'ghost' | 'confirm' | 'dismiss') => ({
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 500,
    padding: '5px 14px',
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
    ...(variant === 'confirm' && {
      background: 'var(--color-income)',
      borderColor: 'var(--color-income)',
      color: '#fff',
    }),
    ...(variant === 'dismiss' && {
      background: 'transparent',
      borderColor: 'var(--color-border)',
      color: 'var(--color-text-muted)',
    }),
  }) as React.CSSProperties,

  toggleBtn: (active: boolean) => ({
    fontFamily: 'inherit',
    fontSize: '12px',
    fontWeight: 500,
    padding: '4px 12px',
    borderRadius: '8px',
    cursor: 'pointer',
    border: '1px solid',
    background: active ? 'var(--color-primary-text)' : 'transparent',
    borderColor: active ? 'var(--color-primary-text)' : 'var(--color-border)',
    color: active ? '#fff' : 'var(--color-text-muted)',
  }) as React.CSSProperties,

  cadenceBadge: (cadence: Cadence) => ({
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '20px',
    background: `${CADENCE_COLORS[cadence]}18`,
    color: CADENCE_COLORS[cadence],
    border: `1px solid ${CADENCE_COLORS[cadence]}40`,
    flexShrink: 0,
  }) as React.CSSProperties,

  input: {
    fontFamily: 'inherit',
    fontSize: '14px',
    padding: '8px 12px',
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
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    width: '100%',
    cursor: 'pointer',
  } as React.CSSProperties,

  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,

  modal: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    padding: '28px',
    width: '380px',
    maxWidth: '90vw',
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
  } as React.CSSProperties,

  modalLabel: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    marginBottom: '6px',
    marginTop: '16px',
    display: 'block',
  } as React.CSSProperties,
}

// ── Add modal ─────────────────────────────────────────────────────────────────

interface AddModalProps {
  categoryOptions: { id: string; label: string; indent: boolean }[]
  uniqueVendors: string[]
  onSave: (vendor: string, category_id: string | null, cadence: Cadence) => Promise<string | null>
  onClose: () => void
}

function AddRecurringModal({ categoryOptions, uniqueVendors, onSave, onClose }: AddModalProps) {
  const [vendor, setVendor] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [cadence, setCadence] = useState<Cadence>('monthly')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!vendor.trim()) { setError('Please enter a vendor name.'); return }
    setSaving(true)
    const err = await onSave(vendor.trim(), categoryId === '' ? null : categoryId, cadence)
    setSaving(false)
    if (err) setError(err)
    else onClose()
  }

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={s.modal}>
        <p style={{ fontSize: '17px', fontWeight: 600, color: 'var(--color-text)', margin: '0 0 4px 0' }}>
          Add Recurring Transaction
        </p>
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: '0 0 4px 0' }}>
          Track a regular charge by vendor and category.
        </p>

        <label style={s.modalLabel}>Vendor</label>
        <input
          list="vendor-list"
          style={s.input}
          value={vendor}
          onChange={e => setVendor(e.target.value)}
          placeholder="e.g. Netflix"
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose() }}
        />
        <datalist id="vendor-list">
          {uniqueVendors.map(v => <option key={v} value={v} />)}
        </datalist>

        <label style={s.modalLabel}>Category</label>
        <select style={s.select} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
          <option value="">Uncategorized</option>
          {categoryOptions.map(opt => (
            <option key={opt.id} value={opt.id}>{opt.indent ? `  ${opt.label}` : opt.label}</option>
          ))}
        </select>

        <label style={s.modalLabel}>Cadence</label>
        <select style={s.select} value={cadence} onChange={e => setCadence(e.target.value as Cadence)}>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="biannually">Biannually</option>
          <option value="annually">Annually</option>
        </select>

        {error && (
          <div style={{ marginTop: '12px', fontSize: '13px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(224,107,107,0.1)', color: 'var(--color-expense)', border: '1px solid var(--color-expense)' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button style={s.btn('ghost')} onClick={onClose}>Cancel</button>
          <button style={s.btn('primary')} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RecurringTransactions() {
  const [recurring, setRecurring] = useState<RecurringEntry[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [graphMode, setGraphMode] = useState<GraphMode>('historical')
  const [graphFilter, setGraphFilter] = useState<GraphFilter>('all')
  const [graphRange, setGraphRange] = useState<GraphRange>(1)
  const [showAddModal, setShowAddModal] = useState(false)

  async function load() {
    const [{ data: rec }, { data: txns }, { data: cats }, { data: dismissed }] = await Promise.all([
      supabase.from('recurring_transactions').select('*').order('vendor'),
      supabase.from('transactions').select('*').order('date', { ascending: false }),
      supabase.from('categories').select('*').eq('is_archived', false),
      supabase.from('dismissed_suggestions').select('vendor, category_id'),
    ])

    setRecurring((rec ?? []) as RecurringEntry[])
    setTransactions(txns ?? [])
    setCategories(cats ?? [])
    setDismissedKeys(new Set((dismissed ?? []).map(d => `${d.vendor}|||${d.category_id ?? ''}`)))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ── Derived data ─────────────────────────────────────────────────────────────

  const suggestions = useMemo(
    () => detectPatterns(transactions, recurring, dismissedKeys),
    [transactions, recurring, dismissedKeys],
  )

  const graphData = useMemo(() => {
    if (graphMode === 'historical') return buildHistoricalData(transactions, recurring, graphFilter, graphRange)
    return buildForecastData(transactions, recurring, graphFilter, graphRange)
  }, [graphMode, graphFilter, graphRange, transactions, recurring])

  const monthlyAvg = useMemo(() => {
    const nonZero = graphData.filter(d => d.amount > 0)
    if (nonZero.length === 0) return 0
    return nonZero.reduce((s, d) => s + d.amount, 0) / nonZero.length
  }, [graphData])

  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])

  const parents = useMemo(() => categories.filter(c => c.parent_id === null), [categories])
  const categoryOptions = parents.flatMap(p => [
    { id: p.id, label: p.name, indent: false },
    ...categories.filter(c => c.parent_id === p.id).map(c => ({ id: c.id, label: c.name, indent: true })),
  ])

  const uniqueVendors = useMemo(
    () => [...new Set(transactions.map(t => t.vendor))].sort(),
    [transactions],
  )

  function getLastThree(entry: RecurringEntry): Transaction[] {
    return transactions
      .filter(t => t.vendor === entry.vendor && t.category_id === entry.category_id)
      .slice(0, 3)
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleConfirm(sg: Suggestion) {
    await supabase.from('recurring_transactions').insert({
      vendor: sg.vendor,
      category_id: sg.category_id,
      cadence: sg.cadence,
    })
    load()
  }

  async function handleDismiss(sg: Suggestion) {
    const key = `${sg.vendor}|||${sg.category_id ?? ''}`
    await supabase.from('dismissed_suggestions').insert({ vendor: sg.vendor, category_id: sg.category_id })
    setDismissedKeys(prev => new Set([...prev, key]))
  }

  async function handleDelete(id: string) {
    await supabase.from('recurring_transactions').delete().eq('id', id)
    load()
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 style={s.heading}>Recurring Transactions</h2>
        <button style={s.btn('primary')} onClick={() => setShowAddModal(true)}>+ Add Recurring</button>
      </div>

      {/* ── Suggestions ── */}
      {suggestions.length > 0 && (
        <div style={s.suggestionCard}>
          <p style={{ ...s.sectionTitle, color: '#92400E', margin: '0 0 12px 0' }}>
            ✦ {suggestions.length} possible recurring {suggestions.length === 1 ? 'charge' : 'charges'} detected
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {suggestions.map(sg => {
              const cat = sg.category_id ? catMap.get(sg.category_id) : null
              return (
                <div
                  key={`${sg.vendor}|||${sg.category_id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 14px',
                    background: 'var(--color-bg)',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-text)' }}>{sg.vendor}</div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                      {cat?.name ?? 'Uncategorized'} · {sg.occurrences} occurrences · ~${formatAmount(sg.recentAmount)}
                    </div>
                  </div>
                  <span style={s.cadenceBadge(sg.cadence)}>{CADENCE_LABELS[sg.cadence]}</span>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    <button style={s.btn('confirm')} onClick={() => handleConfirm(sg)}>Confirm</button>
                    <button style={s.btn('dismiss')} onClick={() => handleDismiss(sg)}>Dismiss</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Bar graph ── */}
      <div style={s.card}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <p style={s.sectionTitle}>
              {graphMode === 'historical' ? 'Recurring spend — last 12 months' : 'Projected recurring spend — next 12 months'}
            </p>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted)' }}>
              {graphMode === 'historical' ? 'Monthly avg' : 'Projected avg'}:{' '}
              <strong style={{ color: 'var(--color-text)' }}>${formatAmount(monthlyAvg)}</strong>
            </p>
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', flexShrink: 0, alignItems: 'center' }}>
            <button style={s.toggleBtn(graphMode === 'historical')} onClick={() => setGraphMode('historical')}>Historical</button>
            <button style={s.toggleBtn(graphMode === 'forecast')} onClick={() => setGraphMode('forecast')}>Forecast</button>
            <div style={{ width: '1px', background: 'var(--color-border)', margin: '0 4px' }} />
            <button style={s.toggleBtn(graphFilter === 'all')} onClick={() => setGraphFilter('all')}>All</button>
            <button style={s.toggleBtn(graphFilter === 'monthly')} onClick={() => setGraphFilter('monthly')}>Monthly only</button>
            <div style={{ width: '1px', background: 'var(--color-border)', margin: '0 4px' }} />
            {([1, 3, 6, 12] as GraphRange[]).map(r => (
              <button key={r} style={s.toggleBtn(graphRange === r)} onClick={() => setGraphRange(r)}>
                {r === 1 ? '1M' : r === 3 ? '3M' : r === 6 ? '6M' : '12M'}
              </button>
            ))}
          </div>
        </div>

        {recurring.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', margin: 0 }}>
            No recurring transactions yet — confirm a suggestion or add one manually to see your chart.
          </p>
        ) : (
          <BarChart data={graphData} />
        )}
      </div>

      {/* ── Confirmed recurring list ── */}
      <p style={{ ...s.sectionTitle, marginBottom: '12px' }}>Confirmed Recurring</p>

      {recurring.length === 0 ? (
        <div style={{ ...s.card, color: 'var(--color-text-muted)', fontSize: '14px' }}>
          Nothing here yet — confirm a suggestion above or add one manually.
        </div>
      ) : (
        recurring.map(entry => {
          const cat = entry.category_id ? catMap.get(entry.category_id) : null
          const isExpanded = expandedId === entry.id
          const lastThree = isExpanded ? getLastThree(entry) : []

          return (
            <div key={entry.id} style={s.card}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => setExpandedId(isExpanded ? null : entry.id)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: '15px', color: 'var(--color-text)' }}>
                      {entry.vendor}
                    </span>
                    <span style={s.cadenceBadge(entry.cadence)}>{CADENCE_LABELS[entry.cadence]}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '3px' }}>
                    {cat?.name ?? 'Uncategorized'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    {isExpanded ? '▲' : '▼'}
                  </span>
                  <button
                    style={{ ...s.btn('ghost'), fontSize: '12px', padding: '3px 10px' }}
                    onClick={e => { e.stopPropagation(); handleDelete(entry.id) }}
                  >
                    Remove
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--color-border)' }}>
                  {lastThree.length === 0 ? (
                    <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: 0 }}>
                      No matching transactions found in your history.
                    </p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date</th>
                          <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lastThree.map(t => (
                          <tr key={t.id}>
                            <td style={{ padding: '6px 8px', color: 'var(--color-text-muted)' }}>{formatDate(t.date)}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 500, color: 'var(--color-expense)', fontVariantNumeric: 'tabular-nums' }}>
                              ${formatAmount(t.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}

      {/* Add modal */}
      {showAddModal && (
        <AddRecurringModal
          categoryOptions={categoryOptions}
          uniqueVendors={uniqueVendors}
          onSave={async (vendor, category_id, cadence) => {
            const { error } = await supabase.from('recurring_transactions').insert({ vendor, category_id, cadence })
            if (error) return error.message
            load()
            return null
          }}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}
