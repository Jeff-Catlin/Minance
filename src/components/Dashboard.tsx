import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import type { Category, Transaction } from '../types'

// ── Date helpers ──────────────────────────────────────────────────────────────

function toISO(d: Date) {
  return d.toISOString().slice(0, 10)
}

function getPresetRange(preset: string): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()

  if (preset === 'week') {
    const day = now.getDay() // 0=Sun
    const mon = new Date(now)
    mon.setDate(d - ((day + 6) % 7))
    const sun = new Date(mon)
    sun.setDate(mon.getDate() + 6)
    return { from: toISO(mon), to: toISO(sun) }
  }
  if (preset === 'month') {
    return {
      from: toISO(new Date(y, m, 1)),
      to: toISO(new Date(y, m + 1, 0)),
    }
  }
  if (preset === 'year') {
    return {
      from: toISO(new Date(y, 0, 1)),
      to: toISO(new Date(y, 11, 31)),
    }
  }
  return { from: '', to: '' }
}

function formatAmount(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDateRange(from: string, to: string) {
  if (!from && !to) return 'All time'
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-')
    return `${m}/${d}/${y}`
  }
  if (from && to) return `${fmt(from)} – ${fmt(to)}`
  if (from) return `From ${fmt(from)}`
  return `Through ${fmt(to)}`
}

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
    padding: '24px',
    marginBottom: '16px',
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--color-text)',
    margin: '0 0 12px 0',
  } as React.CSSProperties,

  presetBtn: (active: boolean) => ({
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 500,
    padding: '5px 14px',
    borderRadius: '8px',
    cursor: 'pointer',
    border: '1px solid',
    background: active ? 'var(--color-primary-text)' : 'transparent',
    borderColor: active ? 'var(--color-primary-text)' : 'var(--color-border)',
    color: active ? '#fff' : 'var(--color-text-muted)',
  }) as React.CSSProperties,

  dateInput: {
    fontFamily: 'inherit',
    fontSize: '13px',
    padding: '5px 10px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    outline: 'none',
  } as React.CSSProperties,

  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '14px',
  } as React.CSSProperties,

  th: {
    textAlign: 'left' as const,
    padding: '8px 12px',
    borderBottom: '2px solid var(--color-border)',
    color: 'var(--color-text-muted)',
    fontWeight: 600,
    fontSize: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  } as React.CSSProperties,

  parentRow: {
    cursor: 'pointer',
  } as React.CSSProperties,

  parentTd: (color?: string) => ({
    padding: '10px 12px',
    fontWeight: 600,
    color: color ?? 'var(--color-text)',
    borderBottom: '1px solid var(--color-border)',
  }) as React.CSSProperties,

  childTd: (color?: string) => ({
    padding: '7px 12px 7px 28px',
    fontSize: '13px',
    color: color ?? 'var(--color-text-muted)',
    borderBottom: '1px solid var(--color-border)',
  }) as React.CSSProperties,

  totalRow: {
    background: 'var(--color-bg)',
  } as React.CSSProperties,

  totalTd: (color?: string) => ({
    padding: '12px',
    fontWeight: 700,
    fontSize: '15px',
    color: color ?? 'var(--color-text)',
    borderTop: '2px solid var(--color-border)',
  }) as React.CSSProperties,

  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
    marginBottom: '24px',
  } as React.CSSProperties,

  summaryCard: (color: string) => ({
    background: 'var(--color-surface)',
    border: `1px solid var(--color-border)`,
    borderRadius: '12px',
    padding: '16px 20px',
    borderTop: `3px solid ${color}`,
  }) as React.CSSProperties,

  summaryLabel: {
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--color-text-muted)',
    margin: '0 0 6px 0',
  } as React.CSSProperties,

  summaryAmount: (color: string) => ({
    fontSize: '22px',
    fontWeight: 700,
    color,
    margin: 0,
    fontVariantNumeric: 'tabular-nums',
  }) as React.CSSProperties,
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  const [preset, setPreset] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Compute active date range
  const range = useMemo(() => {
    if (preset === 'custom') return { from: customFrom, to: customTo }
    return getPresetRange(preset)
  }, [preset, customFrom, customTo])

  useEffect(() => {
    async function load() {
      setLoading(true)
      let query = supabase.from('transactions').select('*')
      if (range.from) query = query.gte('date', range.from)
      if (range.to)   query = query.lte('date', range.to)

      const [{ data: txns }, { data: cats }] = await Promise.all([
        query,
        supabase.from('categories').select('*'),
      ])

      setTransactions(txns ?? [])
      setCategories(cats ?? [])
      setLoading(false)
    }
    load()
  }, [range.from, range.to])

  // ── Rollup logic ────────────────────────────────────────────────────────────

  const { expenseRows, incomeRows, totalExpenses, totalIncome } = useMemo(() => {
    const catMap = new Map(categories.map(c => [c.id, c]))
    const parents = categories.filter(c => c.parent_id === null)
    const childrenOf = (id: string) => categories.filter(c => c.parent_id === id)

    // Sum transactions by category_id
    const sumByCategory = new Map<string, number>()
    for (const t of transactions) {
      if (!t.category_id) continue
      sumByCategory.set(t.category_id, (sumByCategory.get(t.category_id) ?? 0) + t.amount)
    }

    // Uncategorized totals
    const uncatExpense = transactions.filter(t => !t.category_id && t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const uncatIncome  = transactions.filter(t => !t.category_id && t.type === 'income').reduce((s, t) => s + t.amount, 0)

    function buildRows(type: 'expense' | 'income') {
      const typeTxns = transactions.filter(t => t.type === type)

      const rows: {
        parentId: string
        parentName: string
        parentTotal: number
        children: { id: string; name: string; total: number }[]
      }[] = []

      for (const parent of parents) {
        const children = childrenOf(parent.id)

        // Only include categories that have transactions of the right type
        const childRows = children
          .map(c => {
            const total = typeTxns
              .filter(t => t.category_id === c.id)
              .reduce((s, t) => s + t.amount, 0)
            return { id: c.id, name: c.name, total }
          })
          .filter(c => c.total > 0)

        const directTotal = typeTxns
          .filter(t => t.category_id === parent.id)
          .reduce((s, t) => s + t.amount, 0)

        const parentTotal = directTotal + childRows.reduce((s, c) => s + c.total, 0)

        if (parentTotal > 0) {
          rows.push({ parentId: parent.id, parentName: parent.name, parentTotal, children: childRows })
        }
      }

      // Sort by total descending
      rows.sort((a, b) => b.parentTotal - a.parentTotal)
      return rows
    }

    const expenseRows = buildRows('expense')
    const incomeRows  = buildRows('income')

    const totalExpenses = expenseRows.reduce((s, r) => s + r.parentTotal, 0) + uncatExpense
    const totalIncome   = incomeRows.reduce((s, r) => s + r.parentTotal, 0) + uncatIncome

    return { expenseRows, incomeRows, totalExpenses, totalIncome, uncatExpense, uncatIncome, catMap }
  }, [transactions, categories])

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  function renderTable(
    rows: { parentId: string; parentName: string; parentTotal: number; children: { id: string; name: string; total: number }[] }[],
    total: number,
    color: string,
  ) {
    if (rows.length === 0) return (
      <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', margin: 0 }}>
        No transactions in this period.
      </p>
    )

    return (
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Category</th>
            <th style={{ ...s.th, textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <>
              <tr
                key={row.parentId}
                style={s.parentRow}
                onClick={() => row.children.length > 0 && toggleExpanded(row.parentId)}
              >
                <td style={s.parentTd()}>
                  {row.children.length > 0 && (
                    <span style={{ marginRight: '6px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      {expanded.has(row.parentId) ? '▼' : '▶'}
                    </span>
                  )}
                  {row.parentName}
                </td>
                <td style={{ ...s.parentTd(color), textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  ${formatAmount(row.parentTotal)}
                </td>
              </tr>
              {expanded.has(row.parentId) && row.children.map(child => (
                <tr key={child.id}>
                  <td style={s.childTd()}>{child.name}</td>
                  <td style={{ ...s.childTd(color), textAlign: 'right', fontVariantNumeric: 'tabular-nums', opacity: 0.8 }}>
                    ${formatAmount(child.total)}
                  </td>
                </tr>
              ))}
            </>
          ))}
        </tbody>
        <tfoot>
          <tr style={s.totalRow}>
            <td style={s.totalTd()}>Total</td>
            <td style={{ ...s.totalTd(color), textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              ${formatAmount(total)}
            </td>
          </tr>
        </tfoot>
      </table>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 style={s.heading}>Dashboard</h2>
        <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
          {formatDateRange(range.from, range.to)}
        </span>
      </div>

      {/* Time filter */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { key: 'week', label: 'This week' },
          { key: 'month', label: 'This month' },
          { key: 'year', label: 'This year' },
          { key: 'custom', label: 'Custom' },
        ].map(p => (
          <button key={p.key} style={s.presetBtn(preset === p.key)} onClick={() => setPreset(p.key)}>
            {p.label}
          </button>
        ))}
        {preset === 'custom' && (
          <>
            <input
              type="date"
              style={s.dateInput}
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
            />
            <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>–</span>
            <input
              type="date"
              style={s.dateInput}
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
            />
          </>
        )}
      </div>

      {loading ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      ) : (
        <>
          {/* Summary cards */}
          <div style={s.summaryGrid}>
            <div style={s.summaryCard('var(--color-expense)')}>
              <p style={s.summaryLabel}>Total Expenses</p>
              <p style={s.summaryAmount('var(--color-expense)')}>
                ${formatAmount(totalExpenses)}
              </p>
            </div>
            <div style={s.summaryCard('var(--color-income)')}>
              <p style={s.summaryLabel}>Total Income</p>
              <p style={s.summaryAmount('var(--color-income)')}>
                ${formatAmount(totalIncome)}
              </p>
            </div>
            <div style={s.summaryCard(totalIncome - totalExpenses >= 0 ? 'var(--color-income)' : 'var(--color-expense)')}>
              <p style={s.summaryLabel}>Net</p>
              <p style={s.summaryAmount(totalIncome - totalExpenses >= 0 ? 'var(--color-income)' : 'var(--color-expense)')}>
                {totalIncome - totalExpenses >= 0 ? '+' : '−'}${formatAmount(Math.abs(totalIncome - totalExpenses))}
              </p>
            </div>
          </div>

          {/* Expenses breakdown */}
          <div style={s.card}>
            <p style={s.sectionTitle}>Where your money went</p>
            {renderTable(expenseRows, totalExpenses, 'var(--color-expense)')}
          </div>

          {/* Income breakdown */}
          <div style={s.card}>
            <p style={s.sectionTitle}>Money in</p>
            {renderTable(incomeRows, totalIncome, 'var(--color-income)')}
          </div>
        </>
      )}
    </div>
  )
}
