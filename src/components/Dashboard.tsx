import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import type { Category, Transaction, TransactionSplit } from '../types'
import { useSettings } from '../context/SettingsContext'

// ── Date helpers ──────────────────────────────────────────────────────────────

function toISO(d: Date) {
  return d.toISOString().slice(0, 10)
}

type Period = 'week' | 'month' | 'ytd' | 'year'
type Relative = 'current' | 'last'

function getRange(period: Period, relative: Relative): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()

  if (period === 'week') {
    const day = now.getDay()
    const thisMon = new Date(now)
    thisMon.setDate(d - ((day + 6) % 7))
    if (relative === 'current') {
      const sun = new Date(thisMon)
      sun.setDate(thisMon.getDate() + 6)
      return { from: toISO(thisMon), to: toISO(sun) }
    } else {
      const lastMon = new Date(thisMon)
      lastMon.setDate(thisMon.getDate() - 7)
      const lastSun = new Date(lastMon)
      lastSun.setDate(lastMon.getDate() + 6)
      return { from: toISO(lastMon), to: toISO(lastSun) }
    }
  }
  if (period === 'month') {
    if (relative === 'current') {
      return { from: toISO(new Date(y, m, 1)), to: toISO(new Date(y, m + 1, 0)) }
    } else {
      return { from: toISO(new Date(y, m - 1, 1)), to: toISO(new Date(y, m, 0)) }
    }
  }
  // ytd — always Jan 1 of current year through today
  if (period === 'ytd') {
    return { from: toISO(new Date(y, 0, 1)), to: toISO(now) }
  }
  // year
  if (relative === 'current') {
    return { from: toISO(new Date(y, 0, 1)), to: toISO(new Date(y, 11, 31)) }
  } else {
    return { from: toISO(new Date(y - 1, 0, 1)), to: toISO(new Date(y - 1, 11, 31)) }
  }
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

// ── Donut chart ───────────────────────────────────────────────────────────────

const SLICE_COLORS = [
  '#0E9F8E', '#6366F1', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#10B981', '#F97316',
  '#06B6D4', '#84CC16',
]

type DonutRow = { parentId: string; parentName: string; parentTotal: number; children: { id: string; name: string; total: number }[] }

function DonutChart({ rows, total, uncatAmount, sym, onSliceClick, onUncatClick }: {
  rows: DonutRow[]
  total: number
  uncatAmount?: number
  sym: string
  onSliceClick?: (categoryId: string) => void
  onUncatClick?: () => void
}) {
  const [hovered, setHovered] = useState<string | null>(null)

  if (rows.length === 0 || total === 0) return null

  const SZ = 280, CX = 140, CY = 140, OR = 118, IR = 73

  const fmt  = (n: number) => `${sym}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmtS = (n: number) => `${sym}${Math.round(n).toLocaleString()}`
  const trunc = (s: string, max: number) => s.length > max ? s.slice(0, max - 1) + '…' : s

  let angle = -Math.PI / 2

  const slices = rows.map((row, i) => {
    const pct = row.parentTotal / total
    const sweep = pct * 2 * Math.PI
    const start = angle
    const end   = angle + sweep
    angle = end

    const mid = (start + end) / 2
    const large = sweep > Math.PI ? 1 : 0

    const path = [
      `M ${CX + OR * Math.cos(start)} ${CY + OR * Math.sin(start)}`,
      `A ${OR} ${OR} 0 ${large} 1 ${CX + OR * Math.cos(end)} ${CY + OR * Math.sin(end)}`,
      `L ${CX + IR * Math.cos(end)} ${CY + IR * Math.sin(end)}`,
      `A ${IR} ${IR} 0 ${large} 0 ${CX + IR * Math.cos(start)} ${CY + IR * Math.sin(start)}`,
      'Z',
    ].join(' ')

    return {
      id: row.parentId,
      name: row.parentName,
      total: row.parentTotal,
      children: [...row.children].sort((a, b) => b.total - a.total),
      color: SLICE_COLORS[i % SLICE_COLORS.length],
      path, mid, pct,
    }
  })

  // Add uncategorized slice if there are uncategorized expenses
  if (uncatAmount && uncatAmount > 0) {
    const pct  = uncatAmount / total
    const sweep = pct * 2 * Math.PI
    const start = angle
    const end   = angle + sweep
    const mid   = (start + end) / 2
    const large = sweep > Math.PI ? 1 : 0
    const path = [
      `M ${CX + OR * Math.cos(start)} ${CY + OR * Math.sin(start)}`,
      `A ${OR} ${OR} 0 ${large} 1 ${CX + OR * Math.cos(end)} ${CY + OR * Math.sin(end)}`,
      `L ${CX + IR * Math.cos(end)} ${CY + IR * Math.sin(end)}`,
      `A ${IR} ${IR} 0 ${large} 0 ${CX + IR * Math.cos(start)} ${CY + IR * Math.sin(start)}`,
      'Z',
    ].join(' ')
    slices.push({ id: '__uncat__', name: 'Uncategorized', total: uncatAmount, children: [], color: '#A8A29E', path, mid, pct })
  }

  const active = slices.find(s => s.id === hovered) ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={SZ} height={SZ} style={{ overflow: 'visible' }}>
        {slices.map(sl => {
          const isActive = hovered === sl.id
          const dimmed  = hovered !== null && !isActive
          const tx = isActive ? Math.cos(sl.mid) * 8 : 0
          const ty = isActive ? Math.sin(sl.mid) * 8 : 0
          return (
            <g
              key={sl.id}
              style={{ cursor: onSliceClick ? 'pointer' : 'default', transition: 'opacity 0.15s, transform 0.15s', opacity: dimmed ? 0.3 : 1 }}
              transform={`translate(${tx.toFixed(2)}, ${ty.toFixed(2)})`}
              onMouseEnter={() => setHovered(sl.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={sl.id === '__uncat__'
                ? (onUncatClick ? () => onUncatClick() : undefined)
                : (onSliceClick ? () => onSliceClick(sl.id) : undefined)}
            >
              {(sl.id === '__uncat__' ? onUncatClick : onSliceClick) && <title>{`View ${sl.name} transactions`}</title>}
              <path d={sl.path} fill={sl.color} stroke="var(--color-surface)" strokeWidth={2} />
            </g>
          )
        })}

        {/* Center — default */}
        {!active && (
          <>
            <text x={CX} y={CY - 7} textAnchor="middle" fontSize={11} fontWeight={500} fill="var(--color-text-muted)" fontFamily="Inter,system-ui,sans-serif">
              Total Expenses
            </text>
            <text x={CX} y={CY + 15} textAnchor="middle" fontSize={21} fontWeight={700} fill="var(--color-expense)" fontFamily="Inter,system-ui,sans-serif">
              {fmt(total)}
            </text>
          </>
        )}

        {/* Center — hovered */}
        {active && (
          <>
            <text x={CX} y={CY - 30} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--color-text)" fontFamily="Inter,system-ui,sans-serif">
              {trunc(active.name, 16)}
            </text>
            <text x={CX} y={CY - 12} textAnchor="middle" fontSize={18} fontWeight={700} fill={active.color} fontFamily="Inter,system-ui,sans-serif">
              {fmt(active.total)}
            </text>
            <text x={CX} y={CY - 1} textAnchor="middle" fontSize={9.5} fill="var(--color-text-muted)" fontFamily="Inter,system-ui,sans-serif">
              {(active.pct * 100).toFixed(1)}% of expenses
            </text>
            <line x1={CX - 44} y1={CY + 7} x2={CX + 44} y2={CY + 7} stroke="var(--color-border)" strokeWidth={1} />
            {active.children.slice(0, 3).map((child, i) => (
              <g key={child.id}>
                <text x={CX - 4} y={CY + 22 + i * 16} textAnchor="end" fontSize={9.5} fill="var(--color-text-muted)" fontFamily="Inter,system-ui,sans-serif">
                  {trunc(child.name, 11)}
                </text>
                <text x={CX + 4} y={CY + 22 + i * 16} textAnchor="start" fontSize={9.5} fontWeight={500} fill="var(--color-text)" fontFamily="Inter,system-ui,sans-serif">
                  {fmtS(child.total)}
                </text>
              </g>
            ))}
          </>
        )}
      </svg>

      {/* Legend */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px', marginTop: '10px', width: '100%' }}>
        {slices.map(sl => (
          <div
            key={sl.id}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', cursor: onSliceClick ? 'pointer' : 'default', opacity: hovered && hovered !== sl.id ? 0.35 : 1, transition: 'opacity 0.15s' }}
            onMouseEnter={() => setHovered(sl.id)}
            onMouseLeave={() => setHovered(null)}
            onClick={sl.id === '__uncat__' ? (onUncatClick ?? undefined) : (onSliceClick ? () => onSliceClick(sl.id) : undefined)}
            title={(sl.id === '__uncat__' ? onUncatClick : onSliceClick) ? `View ${sl.name} transactions` : undefined}
          >
            <div style={{ width: '9px', height: '9px', borderRadius: '2px', background: sl.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sl.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Drill-down link ───────────────────────────────────────────────────────────

function DrillLink({ name, onClick, stopProp = false }: {
  name: string
  onClick?: (e: React.MouseEvent) => void
  stopProp?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  if (!onClick) return <>{name}</>
  return (
    <span
      onClick={e => { if (stopProp) e.stopPropagation(); onClick(e) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="View transactions"
      style={{
        cursor: 'pointer',
        borderRadius: '4px',
        padding: '1px 5px',
        margin: '-1px -5px',
        transition: 'background 0.12s, color 0.12s',
        background: hovered ? 'rgba(34,195,166,0.12)' : 'transparent',
        color: hovered ? 'var(--color-primary-text)' : undefined,
        display: 'inline-block',
      }}
    >
      {name}
    </span>
  )
}

interface DashboardProps {
  onDrillDown?: (categoryId: string, from: string, to: string, type: 'expense' | 'income') => void
  onUncatDrillDown?: () => void
}

export default function Dashboard({ onDrillDown, onUncatDrillDown }: DashboardProps) {
  const { settings, currencySymbol } = useSettings()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [splits, setSplits] = useState<TransactionSplit[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  const [period, setPeriod] = useState<Period | null>(settings.defaultPeriod as Period || null)
  const [relative, setRelative] = useState<Relative>('current')
  const [dateFrom, setDateFrom] = useState(() => getRange((settings.defaultPeriod as Period) || 'month', 'current').from)
  const [dateTo, setDateTo] = useState(() => getRange((settings.defaultPeriod as Period) || 'month', 'current').to)

  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Compute active date range
  const range = useMemo(() => ({ from: dateFrom, to: dateTo }), [dateFrom, dateTo])

  const budgetMultiplier = useMemo(() => {
    if (period === 'month') return 1
    if (period === 'year') return 12
    if (range.from && range.to) {
      const days = (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86400000 + 1
      return days / 30.44
    }
    return null
  }, [period, range])

  useEffect(() => {
    async function load() {
      setLoading(true)
      let query = supabase.from('transactions').select('*')
      if (range.from) query = query.gte('date', range.from)
      if (range.to)   query = query.lte('date', range.to)

      const txns_result = await query
      const txnIds = (txns_result.data ?? []).filter(t => t.is_split).map(t => t.id)
      const [{ data: cats }, { data: splitData }] = await Promise.all([
        supabase.from('categories').select('*'),
        txnIds.length > 0
          ? supabase.from('transaction_splits').select('*').in('transaction_id', txnIds)
          : Promise.resolve({ data: [] }),
      ])

      setTransactions(txns_result.data ?? [])
      setSplits(splitData ?? [])
      setCategories(cats ?? [])
      setLoading(false)
    }
    load()
  }, [range.from, range.to])

  // ── Rollup logic ────────────────────────────────────────────────────────────

  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])

  const { expenseRows, incomeRows, totalExpenses, totalIncome, uncatExpense } = useMemo(() => {
    const parents = categories.filter(c => c.parent_id === null)
    const childrenOf = (id: string) => categories.filter(c => c.parent_id === id)

    // Build splits lookup
    const splitsById = new Map<string, TransactionSplit[]>()
    for (const sp of splits) {
      if (!splitsById.has(sp.transaction_id)) splitsById.set(sp.transaction_id, [])
      splitsById.get(sp.transaction_id)!.push(sp)
    }

    // Sum transactions by category_id, using split amounts for split transactions
    // Card payments are excluded entirely — they cancel with the matching bank debit
    const sumByCategory = new Map<string, number>()
    for (const t of transactions) {
      if (t.type === 'card_payment') continue
      if (t.is_split) {
        for (const sp of splitsById.get(t.id) ?? []) {
          sumByCategory.set(sp.category_id, (sumByCategory.get(sp.category_id) ?? 0) + sp.amount)
        }
      } else {
        if (!t.category_id) continue
        sumByCategory.set(t.category_id, (sumByCategory.get(t.category_id) ?? 0) + t.amount)
      }
    }

    // Uncategorized totals (exclude split and card_payment transactions)
    const uncatExpense = transactions.filter(t => !t.category_id && !t.is_split && t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const uncatIncome  = transactions.filter(t => !t.category_id && !t.is_split && t.type === 'income').reduce((s, t) => s + t.amount, 0)

    // Split-aware category total — checks split lines for split transactions
    function getCategoryTotal(catId: string, type: 'expense' | 'income'): number {
      let total = 0
      for (const t of transactions) {
        if (t.type !== type) continue
        if (t.is_split) {
          for (const sp of splitsById.get(t.id) ?? []) {
            if (sp.category_id === catId) total += sp.amount
          }
        } else {
          if (t.category_id === catId) total += t.amount
        }
      }
      return total
    }

    function buildRows(type: 'expense' | 'income') {
      const rows: {
        parentId: string
        parentName: string
        parentTotal: number
        children: { id: string; name: string; total: number }[]
      }[] = []

      for (const parent of parents) {
        const children = childrenOf(parent.id)

        const childRows = children
          .map(c => ({ id: c.id, name: c.name, total: getCategoryTotal(c.id, type) }))
          .filter(c => Math.abs(c.total) >= 0.005)

        const directTotal = getCategoryTotal(parent.id, type)
        const parentTotal = directTotal + childRows.reduce((s, c) => s + c.total, 0)

        if (Math.abs(parentTotal) >= 0.005) {
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
  }, [transactions, splits, categories])

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  function renderBudgetBar(spent: number, budget: number | null, isIncome: boolean) {
    const hasBudget = budget !== null && budget > 0
    const pct = hasBudget ? Math.min((spent / budget!) * 100, 100) : 0
    const over = hasBudget && (isIncome ? spent < budget! : spent > budget!)
    const fill = hasBudget ? (over ? 'var(--color-expense)' : 'var(--color-income)') : 'var(--color-border)'
    const diff = hasBudget ? Math.abs(budget! - spent) : null

    return (
      <div style={{ marginTop: '4px' }}>
        <div style={{ height: '3px', background: 'var(--color-border)', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: fill, borderRadius: '2px', transition: 'width 0.3s' }} />
        </div>
        {hasBudget && diff !== null && (
          <span style={{ fontSize: '10px', color: over ? 'var(--color-expense)' : 'var(--color-income)', fontWeight: 500 }}>
            {isIncome
              ? over ? `${currencySymbol}${formatAmount(diff)} below target` : `${currencySymbol}${formatAmount(diff)} above target`
              : over ? `${currencySymbol}${formatAmount(diff)} over` : `${currencySymbol}${formatAmount(diff)} left`}
          </span>
        )}
        {!hasBudget && (
          <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>No budget set</span>
        )}
      </div>
    )
  }

  function renderTable(
    rows: { parentId: string; parentName: string; parentTotal: number; children: { id: string; name: string; total: number }[] }[],
    total: number,
    color: string,
    isIncome: boolean,
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
          {rows.map(row => {
            const parentCat = catMap.get(row.parentId)
            const allChildren = categories.filter(c => c.parent_id === row.parentId)
            const scaledParentBudget = (() => {
              if (!budgetMultiplier) return null
              if (allChildren.length === 0) {
                return parentCat?.monthly_budget != null ? parentCat.monthly_budget * budgetMultiplier : null
              }
              const hasSubBudget = allChildren.some(c => c.monthly_budget != null)
              if (!hasSubBudget) return null
              return allChildren.reduce((s, c) => s + (c.monthly_budget ?? 0), 0) * budgetMultiplier
            })()

            return (
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
                    <DrillLink
                      name={row.parentName}
                      onClick={onDrillDown ? () => onDrillDown(row.parentId, range.from, range.to, isIncome ? 'income' : 'expense') : undefined}
                      stopProp
                    />
                    {renderBudgetBar(row.parentTotal, scaledParentBudget, isIncome)}
                  </td>
                  <td style={{ ...s.parentTd(row.parentTotal < 0 ? 'var(--color-income)' : color), textAlign: 'right', fontVariantNumeric: 'tabular-nums', verticalAlign: 'top' }}>
                    {row.parentTotal < 0 ? '−' : ''}{currencySymbol}{formatAmount(Math.abs(row.parentTotal))}
                    {scaledParentBudget !== null && (
                      <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 400 }}>
                        of {currencySymbol}{formatAmount(scaledParentBudget)}
                      </div>
                    )}
                  </td>
                </tr>
                {expanded.has(row.parentId) && row.children.map(child => {
                  const childCat = catMap.get(child.id)
                  const scaledChildBudget = budgetMultiplier && childCat?.monthly_budget != null
                    ? childCat.monthly_budget * budgetMultiplier : null
                  return (
                    <tr key={child.id}>
                      <td style={s.childTd()}>
                        <DrillLink
                          name={child.name}
                          onClick={onDrillDown ? () => onDrillDown(child.id, range.from, range.to, isIncome ? 'income' : 'expense') : undefined}
                        />
                        {renderBudgetBar(child.total, scaledChildBudget, isIncome)}
                      </td>
                      <td style={{ ...s.childTd(child.total < 0 ? 'var(--color-income)' : color), textAlign: 'right', fontVariantNumeric: 'tabular-nums', opacity: 0.8, verticalAlign: 'top' }}>
                        {child.total < 0 ? '−' : ''}{currencySymbol}{formatAmount(Math.abs(child.total))}
                        {scaledChildBudget !== null && (
                          <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontWeight: 400, opacity: 1 }}>
                            of {currencySymbol}{formatAmount(scaledChildBudget)}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </>
            )
          })}
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
        {/* Last / Current toggle — only shown for period-based selections (not manual dates or YTD) */}
        {period !== null && period !== 'ytd' && (
          <>
            <button style={s.presetBtn(relative === 'last')} onClick={() => {
              setRelative('last')
              if (period) { const r = getRange(period, 'last'); setDateFrom(r.from); setDateTo(r.to) }
            }}>Last</button>
            <button style={s.presetBtn(relative === 'current')} onClick={() => {
              setRelative('current')
              if (period) { const r = getRange(period, 'current'); setDateFrom(r.from); setDateTo(r.to) }
            }}>Current</button>
            <div style={{ width: '1px', background: 'var(--color-border)', alignSelf: 'stretch', margin: '0 2px' }} />
          </>
        )}

        {/* Period buttons */}
        {(['week', 'month', 'ytd', 'year'] as Period[]).map(p => (
          <button
            key={p}
            style={s.presetBtn(period === p)}
            onClick={() => {
              setPeriod(p)
              const r = getRange(p, relative)
              setDateFrom(r.from)
              setDateTo(r.to)
            }}
          >
            {p === 'ytd' ? 'YTD' : p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}

        <div style={{ width: '1px', background: 'var(--color-border)', alignSelf: 'stretch', margin: '0 2px' }} />

        {/* Always-visible date range */}
        <input type="date" style={s.dateInput} value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPeriod(null) }} />
        <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>–</span>
        <input type="date" style={s.dateInput} value={dateTo} onChange={e => { setDateTo(e.target.value); setPeriod(null) }} />
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
            <div style={{ display: 'grid', gridTemplateColumns: expenseRows.length > 0 ? '300px 1fr' : '1fr', gap: '32px', alignItems: 'start' }}>
              {expenseRows.length > 0 && (
                <DonutChart
                  rows={expenseRows}
                  total={totalExpenses}
                  uncatAmount={uncatExpense > 0 ? uncatExpense : undefined}
                  sym={currencySymbol}
                  onSliceClick={onDrillDown ? (catId) => onDrillDown(catId, range.from, range.to, 'expense') : undefined}
                  onUncatClick={onUncatDrillDown}
                />
              )}
              <div>
                {renderTable(expenseRows, totalExpenses, 'var(--color-expense)', false)}
              </div>
            </div>
          </div>

          {/* Income breakdown */}
          <div style={s.card}>
            <p style={s.sectionTitle}>Money in</p>
            {renderTable(incomeRows, totalIncome, 'var(--color-income)', true)}
          </div>
        </>
      )}
    </div>
  )
}
