import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import type { Category } from '../types'
import { useSettings } from '../context/SettingsContext'
import ProgressBar from './ProgressBar'
import SetBudgetModal, { getBudgetForMonth, getAnnualBudgetTotal } from './SetBudgetModal'
import type { CategoryBudget } from './SetBudgetModal'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAmount(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '12px',
  } as React.CSSProperties,

  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  } as React.CSSProperties,

  parentName: {
    fontSize: '17px',
    fontWeight: 600,
    color: 'var(--color-text)',
    margin: 0,
  } as React.CSSProperties,

  subList: {
    listStyle: 'none',
    padding: 0,
    margin: '12px 0 0 0',
  } as React.CSSProperties,

  subItem: {
    padding: '10px 0',
    borderTop: '1px solid var(--color-border)',
  } as React.CSSProperties,

  subName: {
    fontSize: '15px',
    color: 'var(--color-text)',
  } as React.CSSProperties,

  btn: (variant: 'primary' | 'ghost' | 'danger' | 'small' | 'dots') => ({
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 500,
    padding: '4px 12px',
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
    ...(variant === 'small' && {
      background: 'transparent',
      borderColor: 'var(--color-border)',
      color: 'var(--color-primary-text)',
      fontSize: '12px',
      padding: '3px 10px',
    }),
    ...(variant === 'dots' && {
      background: 'transparent',
      borderColor: 'transparent',
      color: 'var(--color-text-muted)',
      fontSize: '18px',
      padding: '2px 8px',
      lineHeight: 1,
    }),
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

  notice: (type: 'error' | 'info') => ({
    fontSize: '13px',
    padding: '8px 12px',
    borderRadius: '8px',
    marginTop: '8px',
    background: type === 'error' ? 'rgba(224,107,107,0.1)' : 'rgba(34,195,166,0.1)',
    color: type === 'error' ? 'var(--color-expense)' : 'var(--color-primary-text)',
    border: `1px solid ${type === 'error' ? 'var(--color-expense)' : 'var(--color-primary)'}`,
  }) as React.CSSProperties,

  heading: {
    fontSize: '20px',
    fontWeight: 600,
    color: 'var(--color-text)',
    margin: 0,
  } as React.CSSProperties,

  dropdownWrap: {
    position: 'relative' as const,
    display: 'inline-block',
  } as React.CSSProperties,

  dropdownMenu: {
    position: 'absolute' as const,
    right: 0,
    top: '100%',
    marginTop: '4px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    zIndex: 100,
    minWidth: '130px',
    overflow: 'hidden',
  } as React.CSSProperties,

  dropdownItem: (danger?: boolean) => ({
    display: 'block',
    width: '100%',
    textAlign: 'left' as const,
    padding: '9px 14px',
    fontSize: '14px',
    fontFamily: 'inherit',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: danger ? 'var(--color-expense)' : 'var(--color-text)',
  }) as React.CSSProperties,

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
    width: '360px',
    maxWidth: '90vw',
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
  } as React.CSSProperties,

  modalTitle: {
    fontSize: '17px',
    fontWeight: 600,
    color: 'var(--color-text)',
    margin: '0 0 20px 0',
  } as React.CSSProperties,

  modalLabel: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    marginBottom: '6px',
    display: 'block',
  } as React.CSSProperties,

  modalActions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
    marginTop: '20px',
  } as React.CSSProperties,
}

// ── Dots menu ─────────────────────────────────────────────────────────────────

interface DotsMenuProps {
  items: { label: string; danger?: boolean; onClick: () => void }[]
}

function DotsMenu({ items }: DotsMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div style={s.dropdownWrap} ref={ref}>
      <button style={s.btn('dots')} onClick={() => setOpen(o => !o)} aria-label="More options">⋮</button>
      {open && (
        <div style={s.dropdownMenu}>
          {items.map(item => (
            <button
              key={item.label}
              style={s.dropdownItem(item.danger)}
              onClick={() => { setOpen(false); item.onClick() }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Add modal ─────────────────────────────────────────────────────────────────

function AddModal({ title, onSave, onClose }: { title: string; onSave: (name: string) => Promise<string | null>; onClose: () => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) { setError('Please enter a name.'); return }
    setSaving(true)
    const err = await onSave(trimmed)
    setSaving(false)
    if (err) setError(err); else onClose()
  }

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={s.modal}>
        <p style={s.modalTitle}>{title}</p>
        <label style={s.modalLabel}>Name</label>
        <input ref={inputRef} style={s.input} value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose() }}
          placeholder="e.g. Entertainment" />
        {error && <div style={s.notice('error')}>{error}</div>}
        <div style={s.modalActions}>
          <button style={s.btn('ghost')} onClick={onClose}>Cancel</button>
          <button style={s.btn('primary')} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Add'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Rename modal ──────────────────────────────────────────────────────────────

function RenameModal({ current, onSave, onClose }: { current: string; onSave: (name: string) => Promise<string | null>; onClose: () => void }) {
  const [name, setName] = useState(current)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) { setError('Please enter a name.'); return }
    setSaving(true)
    const err = await onSave(trimmed)
    setSaving(false)
    if (err) setError(err); else onClose()
  }

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={s.modal}>
        <p style={s.modalTitle}>Rename category</p>
        <label style={s.modalLabel}>Name</label>
        <input ref={inputRef} style={s.input} value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose() }} />
        {error && <div style={s.notice('error')}>{error}</div>}
        <div style={s.modalActions}>
          <button style={s.btn('ghost')} onClick={onClose}>Cancel</button>
          <button style={s.btn('primary')} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Category spend graph ──────────────────────────────────────────────────────

const GRAPH_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const G_PAD = 8, G_BAR = 14, G_INTRA = 3, G_INTER = 10
const G_GROUP = G_BAR * 2 + G_INTRA + G_INTER     // 41 px per month group
const G_W     = G_PAD * 2 + 12 * G_GROUP - G_INTER // 498
const G_BAR_H = 80, G_NEG = 24, G_LABEL_H = 18
const G_H     = G_BAR_H + G_NEG + G_LABEL_H + 4   // 126

function CategorySpendGraph({
  monthlySpend, monthlyBudget, selectedYear, currencySymbol, isLoading, onMonthClick, isIncome,
}: {
  monthlySpend: number[]
  monthlyBudget: (number | null)[]
  selectedYear: number
  currencySymbol: string
  isLoading: boolean
  onMonthClick?: (month: number) => void
  isIncome?: boolean
}) {
  const [hovMonth, setHovMonth] = useState<number | null>(null)
  const now = new Date()

  if (isLoading) {
    return (
      <div style={{ marginTop: '16px', height: `${G_H}px`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Loading chart…</span>
      </div>
    )
  }

  const maxVal = Math.max(
    ...monthlySpend.filter(v => v > 0),
    ...(monthlyBudget.filter(v => v !== null) as number[]),
    1,
  )
  const maxNeg = Math.max(...monthlySpend.filter(v => v < 0).map(v => Math.abs(v)), 1)

  function bh(val: number)    { return Math.max(1, (val / maxVal) * G_BAR_H) }
  function bneg(val: number)  { return Math.min((Math.abs(val) / maxNeg) * (G_NEG - 3), G_NEG - 3) }

  const SPEND_CLR  = isIncome ? 'var(--color-income)'  : 'var(--color-expense)'
  const CREDIT_CLR = isIncome ? 'var(--color-expense)' : 'var(--color-income)'
  const BUDGET_CLR = 'var(--color-primary-text)'

  return (
    <div style={{ marginTop: '16px', position: 'relative' }}>
      <svg width="100%" viewBox={`0 0 ${G_W} ${G_H}`} style={{ overflow: 'visible', display: 'block' }}>
        {/* Baseline */}
        <line x1={0} y1={G_BAR_H} x2={G_W} y2={G_BAR_H} stroke="var(--color-border)" strokeWidth={0.75} />

        {GRAPH_MONTHS.map((mon, m) => {
          const x      = G_PAD + m * G_GROUP
          const spend  = monthlySpend[m] ?? 0
          const budget = monthlyBudget[m]
          const isFuture = selectedYear > now.getFullYear() ||
            (selectedYear === now.getFullYear() && m > now.getMonth())
          const isHov = hovMonth === m
          const isNeg = spend < 0

          return (
            <g key={m}>
              {/* Spend bar — positive goes up, negative goes down */}
              {spend !== 0 && !isFuture && (
                <rect
                  x={x}
                  y={isNeg ? G_BAR_H + 1 : G_BAR_H - bh(spend)}
                  width={G_BAR}
                  height={isNeg ? bneg(spend) : bh(spend)}
                  rx={2}
                  fill={isNeg ? CREDIT_CLR : SPEND_CLR}
                  opacity={isHov ? 1 : 0.75}
                />
              )}

              {/* Budget bar */}
              {budget !== null && budget > 0 && (
                <rect
                  x={x + G_BAR + G_INTRA} y={G_BAR_H - bh(budget)} width={G_BAR} height={bh(budget)}
                  rx={2} fill={BUDGET_CLR} opacity={isHov ? 1 : 0.6}
                />
              )}

              {/* Month label */}
              <text
                x={x + G_BAR + G_INTRA / 2} y={G_BAR_H + G_NEG + G_LABEL_H - 2}
                textAnchor="middle" fontSize={9} fontFamily="inherit"
                fill={isHov ? 'var(--color-primary-text)' : 'var(--color-text-muted)'}
                fontWeight={isHov ? 600 : 400}
                style={{ cursor: onMonthClick ? 'pointer' : 'default' }}
              >
                {mon}
              </text>

              {/* Invisible hover + click target (covers positive + negative zone) */}
              <rect
                x={x - G_INTER / 2} y={0} width={G_GROUP} height={G_BAR_H + G_NEG}
                fill="transparent" style={{ cursor: onMonthClick ? 'pointer' : 'default' }}
                onMouseEnter={() => setHovMonth(m)}
                onMouseLeave={() => setHovMonth(null)}
                onClick={() => onMonthClick?.(m)}
              />
            </g>
          )
        })}
      </svg>

      {/* Tooltip */}
      {hovMonth !== null && (() => {
        const m       = hovMonth
        const spend   = monthlySpend[m] ?? 0
        const budget  = monthlyBudget[m]
        const isFuture = selectedYear > now.getFullYear() ||
          (selectedYear === now.getFullYear() && m > now.getMonth())
        const leftPct = (G_PAD + m * G_GROUP + G_BAR + G_INTRA / 2) / G_W * 100
        return (
          <div style={{
            position: 'absolute', bottom: G_NEG + G_LABEL_H + 10,
            left: `${Math.min(Math.max(leftPct, 8), 92)}%`,
            transform: 'translateX(-50%)',
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: '8px', padding: '7px 11px', fontSize: '12px',
            color: 'var(--color-text)', whiteSpace: 'nowrap',
            pointerEvents: 'none', zIndex: 20,
            boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
          }}>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>{GRAPH_MONTHS[m]}</div>
            {!isFuture && spend !== 0 && (
              <div style={{ color: spend < 0 ? CREDIT_CLR : SPEND_CLR }}>
                {isIncome
                  ? (spend < 0
                    ? `${currencySymbol}${Math.abs(spend).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} deducted`
                    : `${currencySymbol}${spend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} earned`)
                  : (spend < 0
                    ? `${currencySymbol}${Math.abs(spend).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} credit`
                    : `${currencySymbol}${spend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} spent`)}
              </div>
            )}
            {budget !== null ? (
              <div style={{ color: BUDGET_CLR }}>
                {currencySymbol}{budget.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} budgeted
              </div>
            ) : (
              <div style={{ color: 'var(--color-text-muted)' }}>No budget set</div>
            )}
            {onMonthClick && (
              <div style={{ color: 'var(--color-text-muted)', fontSize: '11px', marginTop: '5px', borderTop: '1px solid var(--color-border)', paddingTop: '4px' }}>
                Click to view transactions
              </div>
            )}
          </div>
        )
      })()}

      {/* Legend */}
      <div style={{ display: 'flex', gap: '14px', marginTop: '6px', justifyContent: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
          <div style={{ width: '10px', height: '8px', background: SPEND_CLR, opacity: 0.75, borderRadius: '2px' }} />
          {isIncome ? 'Earned' : 'Spent'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
          <div style={{ width: '10px', height: '8px', background: BUDGET_CLR, opacity: 0.6, borderRadius: '2px' }} />
          Budgeted
        </div>
      </div>
    </div>
  )
}

// ── Budget bar ────────────────────────────────────────────────────────────────

function BudgetBar({ spent, budget, isIncome }: { spent: number; budget: number | null; isIncome: boolean }) {
  const { currencySymbol } = useSettings()
  const hasBudget = budget !== null && budget > 0
  const over = hasBudget && (isIncome ? spent < budget! : spent > budget!)
  const diff = hasBudget ? Math.abs(budget! - spent) : null

  return (
    <div style={{ marginTop: '8px' }}>
      <ProgressBar value={spent} target={budget} type="expense" height={5} />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
          {currencySymbol}{formatAmount(spent)} spent this month
        </span>
        {hasBudget && diff !== null ? (
          <span style={{ fontSize: '11px', fontWeight: 500, color: over ? 'var(--color-expense)' : 'var(--color-income)' }}>
            {isIncome
              ? over ? `${currencySymbol}${formatAmount(diff)} below target` : `${currencySymbol}${formatAmount(diff)} above target`
              : over ? `${currencySymbol}${formatAmount(diff)} over budget` : `${currencySymbol}${formatAmount(diff)} remaining`}
          </span>
        ) : (
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>No budget set</span>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const CADENCE_LABELS: Record<string, string> = {
  weekly: 'Weekly', biweekly: 'Biweekly', monthly: 'Monthly',
  quarterly: 'Quarterly', biannually: 'Biannually', annually: 'Annually',
}

export default function CategoryManager({ onMonthDrillDown }: { onMonthDrillDown?: (categoryId: string | null, from: string, to: string) => void } = {}) {
  const { currencySymbol } = useSettings()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [spendMap, setSpendMap] = useState<Map<string, number>>(new Map())
  const [typeMap, setTypeMap] = useState<Map<string, 'expense' | 'income'>>(new Map())
  const [addModalFor, setAddModalFor] = useState<string | null>(null)
  const [renamingCat, setRenamingCat] = useState<Category | null>(null)
  const [messages, setMessages] = useState<Record<string, { text: string; type: 'error' | 'info' }>>({})

  const currentYear  = new Date().getFullYear()
  const currentMonth = new Date().getMonth()

  const [selectedYear, setSelectedYear]     = useState(currentYear)
  const [budgets, setBudgets]               = useState<CategoryBudget[]>([])
  const [budgetingCategory, setBudgetingCategory] = useState<Category | null>(null)
  const didRolloverRef = useRef(false)

  const [showGraph, setShowGraph]                     = useState(false)
  const [yearlySpendByCategory, setYearlySpendByCategory] = useState<Map<string, number[]>>(new Map())
  const [graphLoading, setGraphLoading]               = useState(false)

  const budgetsMap = useMemo(() => {
    const m = new Map<string, CategoryBudget>()
    for (const b of budgets) {
      if (b.year === selectedYear) m.set(b.category_id, b)
    }
    return m
  }, [budgets, selectedYear])

  const isNextYear = selectedYear > currentYear

  function catBudgetMonthly(categoryId: string): number | null {
    const b = budgetsMap.get(categoryId)
    if (!b) return null
    return getBudgetForMonth(b, currentMonth, selectedYear)
  }

  function budgetSummaryStr(categoryId: string): string | null {
    const b = budgetsMap.get(categoryId)
    if (!b) return null
    if (b.mode === 'flat') return b.monthly_amount !== null ? `${currencySymbol}${formatAmount(b.monthly_amount)}/mo` : null
    if (b.mode === 'variable') {
      const annual = getAnnualBudgetTotal(b, selectedYear)
      return annual !== null ? `Variable · ${currencySymbol}${Math.round(annual).toLocaleString()}/yr` : 'Variable'
    }
    if (b.mode === 'cadence') {
      const lbl = CADENCE_LABELS[b.cadence ?? ''] ?? b.cadence ?? 'Cadence'
      const annual = getAnnualBudgetTotal(b, selectedYear)
      return annual !== null ? `${lbl} · ${currencySymbol}${Math.round(annual).toLocaleString()}/yr` : lbl
    }
    return null
  }

  async function loadYearlySpend(year: number) {
    setGraphLoading(true)
    const { data: txns } = await supabase.from('transactions')
      .select('id, date, amount, category_id, is_split')
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`)

    const txnList = txns ?? []
    const splitIds = txnList.filter((t: { is_split: boolean }) => t.is_split).map((t: { id: string }) => t.id)
    const splitsData = splitIds.length > 0
      ? (await supabase.from('transaction_splits').select('*').in('transaction_id', splitIds)).data ?? []
      : []

    const splitsByTxn = new Map<string, typeof splitsData>()
    for (const sp of splitsData) {
      if (!splitsByTxn.has(sp.transaction_id)) splitsByTxn.set(sp.transaction_id, [])
      splitsByTxn.get(sp.transaction_id)!.push(sp)
    }

    const result = new Map<string, number[]>()
    for (const t of txnList) {
      const m = new Date((t.date as string) + 'T12:00:00').getMonth()
      if (t.is_split) {
        for (const sp of splitsByTxn.get(t.id) ?? []) {
          if (sp.category_id) {
            if (!result.has(sp.category_id)) result.set(sp.category_id, new Array(12).fill(0))
            result.get(sp.category_id)![m] += sp.amount
          }
        }
      } else if (t.category_id) {
        if (!result.has(t.category_id)) result.set(t.category_id, new Array(12).fill(0))
        result.get(t.category_id)![m] += t.amount
      }
    }

    setYearlySpendByCategory(result)
    setGraphLoading(false)
  }

  useEffect(() => { if (showGraph) loadYearlySpend(selectedYear) }, [showGraph, selectedYear])

  function catMonthlySpendArray(categoryId: string): number[] {
    return yearlySpendByCategory.get(categoryId) ?? new Array(12).fill(0)
  }

  function catMonthlyBudgetArray(categoryId: string): (number | null)[] {
    const b = budgetsMap.get(categoryId)
    if (!b) return new Array(12).fill(null)
    return Array.from({ length: 12 }, (_, m) => getBudgetForMonth(b, m, selectedYear))
  }

  function makeMonthClickHandler(categoryId: string) {
    if (!onMonthDrillDown) return undefined
    return (m: number) => {
      const from = `${selectedYear}-${String(m + 1).padStart(2, '0')}-01`
      const to   = `${selectedYear}-${String(m + 1).padStart(2, '0')}-${String(new Date(selectedYear, m + 1, 0).getDate()).padStart(2, '0')}`
      onMonthDrillDown(categoryId, from, to)
    }
  }

  async function performRollover(allBudgets: CategoryBudget[], year: number): Promise<boolean> {
    const priorBudgets = allBudgets.filter(b => b.year === year - 1)
    const currentIds   = new Set(allBudgets.filter(b => b.year === year).map(b => b.category_id))
    const toRollover   = priorBudgets.filter(b => !currentIds.has(b.category_id))
    if (toRollover.length === 0) return false

    const newBudgets = await Promise.all(toRollover.map(async b => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const base: Record<string, any> = { category_id: b.category_id, year, mode: b.mode }
      if (b.mode === 'flat') return { ...base, monthly_amount: b.monthly_amount }
      if (b.mode === 'variable') {
        if (b.variable_rollover_source === 'actuals') {
          const { data } = await supabase.from('transactions').select('date, amount')
            .eq('category_id', b.category_id)
            .gte('date', `${year - 1}-01-01`)
            .lte('date', `${year - 1}-12-31`)
          const totals = new Array(12).fill(0)
          for (const t of data ?? []) totals[new Date(t.date + 'T12:00:00').getMonth()] += t.amount
          return { ...base, monthly_amounts: totals, variable_rollover_source: b.variable_rollover_source }
        }
        return { ...base, monthly_amounts: b.monthly_amounts, variable_rollover_source: b.variable_rollover_source }
      }
      return { ...base, cadence: b.cadence, reference_date: b.reference_date, amount_per_occurrence: b.amount_per_occurrence }
    }))

    const { error } = await supabase.from('category_budgets').insert(newBudgets)
    return !error
  }

  async function load() {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    const from = `${y}-${String(m + 1).padStart(2, '0')}-01`
    const to = `${y}-${String(m + 1).padStart(2, '0')}-${String(new Date(y, m + 1, 0).getDate()).padStart(2, '0')}`

    const [{ data: cats }, { data: txns }, { data: budgetData }] = await Promise.all([
      supabase.from('categories').select('*').eq('is_archived', false).order('name', { ascending: true }),
      supabase.from('transactions').select('*').gte('date', from).lte('date', to),
      supabase.from('category_budgets').select('*').in('year', [y - 1, y, y + 1]),
    ])

    setCategories(cats ?? [])

    const txnList = txns ?? []
    const splitTxIds = txnList.filter(t => t.is_split).map(t => t.id)
    const splitsData = splitTxIds.length > 0
      ? (await supabase.from('transaction_splits').select('*').in('transaction_id', splitTxIds)).data ?? []
      : []

    const splitsByTxn = new Map<string, typeof splitsData>()
    for (const sp of splitsData) {
      if (!splitsByTxn.has(sp.transaction_id)) splitsByTxn.set(sp.transaction_id, [])
      splitsByTxn.get(sp.transaction_id)!.push(sp)
    }

    const sMap = new Map<string, number>()
    const tMap = new Map<string, 'expense' | 'income'>()
    for (const t of txnList) {
      if (t.is_split) {
        for (const sp of splitsByTxn.get(t.id) ?? []) {
          sMap.set(sp.category_id, (sMap.get(sp.category_id) ?? 0) + sp.amount)
          tMap.set(sp.category_id, t.type)
        }
      } else if (t.category_id) {
        sMap.set(t.category_id, (sMap.get(t.category_id) ?? 0) + t.amount)
        tMap.set(t.category_id, t.type)
      }
    }

    setSpendMap(sMap)
    setTypeMap(tMap)

    const allBudgets = (budgetData ?? []) as CategoryBudget[]
    if (!didRolloverRef.current) {
      didRolloverRef.current = true
      const rolled = await performRollover(allBudgets, y)
      if (rolled) {
        const { data: refreshed } = await supabase.from('category_budgets').select('*').in('year', [y - 1, y, y + 1])
        setBudgets((refreshed ?? []) as CategoryBudget[])
      } else {
        setBudgets(allBudgets)
      }
    } else {
      setBudgets(allBudgets)
    }

    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function setMessage(id: string, text: string, type: 'error' | 'info') {
    setMessages(m => ({ ...m, [id]: { text, type } }))
    setTimeout(() => setMessages(m => { const n = { ...m }; delete n[id]; return n }), 4000)
  }

  // ── Create ────────────────────────────────────────────────────────────────

  async function handleCreate(name: string): Promise<string | null> {
    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      return 'A category with that name already exists.'
    }
    const parent_id = (!addModalFor || addModalFor === '__top__') ? null : addModalFor
    const { error } = await supabase.from('categories').insert({ name, parent_id })
    if (error) return error.message
    load()
    return null
  }

  // ── Rename ────────────────────────────────────────────────────────────────

  async function handleRename(name: string): Promise<string | null> {
    if (!renamingCat) return null
    if (categories.some(c => c.id !== renamingCat.id && c.name.toLowerCase() === name.toLowerCase())) {
      return 'Another category already has that name.'
    }
    const { error } = await supabase.from('categories').update({ name }).eq('id', renamingCat.id)
    if (error) return error.message
    load()
    return null
  }

  // ── Archive ───────────────────────────────────────────────────────────────

  async function handleArchive(cat: Category) {
    const childIds = categories.filter(c => c.parent_id === cat.id).map(c => c.id)
    if (childIds.length > 0) {
      await supabase.from('categories').update({ is_archived: true }).in('id', childIds)
    }
    const { error } = await supabase.from('categories').update({ is_archived: true }).eq('id', cat.id)
    if (error) { setMessage(cat.id, error.message, 'error'); return }
    load()
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(cat: Category) {
    const { count: txCount } = await supabase
      .from('transactions').select('id', { count: 'exact', head: true }).eq('category_id', cat.id)
    if ((txCount ?? 0) > 0) {
      setMessage(cat.id, `This category has ${txCount} transaction(s) assigned. Archive it instead to keep your history.`, 'error')
      return
    }
    const children = categories.filter(c => c.parent_id === cat.id)
    if (children.length > 0) {
      setMessage(cat.id, 'Remove or archive all subcategories first before deleting this parent.', 'error')
      return
    }
    const { error } = await supabase.from('categories').delete().eq('id', cat.id)
    if (error) { setMessage(cat.id, error.message, 'error'); return }
    load()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const parents = categories.filter(c => c.parent_id === null)
  const subcategories = categories.filter(c => c.parent_id !== null)
  const addModalParent = addModalFor && addModalFor !== '__top__'
    ? categories.find(c => c.id === addModalFor) : null

  if (loading) return <p style={{ color: 'var(--color-text-muted)' }}>Loading categories…</p>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={s.heading}>Categories</h2>
          <div style={{ display: 'flex', gap: '2px', background: 'var(--color-bg)', borderRadius: '8px', padding: '2px', border: '1px solid var(--color-border)' }}>
            {[currentYear, currentYear + 1].map(yr => (
              <button key={yr} onClick={() => setSelectedYear(yr)} style={{ fontFamily: 'inherit', fontSize: '13px', fontWeight: selectedYear === yr ? 600 : 400, padding: '3px 10px', borderRadius: '6px', cursor: 'pointer', border: 'none', background: selectedYear === yr ? 'var(--color-surface)' : 'transparent', color: selectedYear === yr ? 'var(--color-text)' : 'var(--color-text-muted)', boxShadow: selectedYear === yr ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                {yr}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowGraph(g => !g)}
            style={{ fontFamily: 'inherit', fontSize: '13px', fontWeight: 500, padding: '3px 12px', borderRadius: '8px', cursor: 'pointer', border: '1px solid', background: showGraph ? 'var(--color-primary-text)' : 'transparent', borderColor: showGraph ? 'var(--color-primary-text)' : 'var(--color-border)', color: showGraph ? '#fff' : 'var(--color-text-muted)' }}
          >
            BvA
          </button>
        </div>
        <button style={s.btn('primary')} onClick={() => setAddModalFor('__top__')}>+ Add Category</button>
      </div>

      {parents.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)' }}>Nothing here yet — add your first category above.</p>
      )}

      {showGraph && parents.length > 0 && (() => {
        const allIds     = [...parents.map(p => p.id), ...subcategories.map(s => s.id)]
        const expenseIds = allIds.filter(id => typeMap.get(id) !== 'income')
        const incomeIds  = allIds.filter(id => typeMap.get(id) === 'income')

        const sumSpend = (ids: string[]) =>
          Array.from({ length: 12 }, (_, m) => {
            let sum = 0
            for (const id of ids) sum += (yearlySpendByCategory.get(id)?.[m] ?? 0)
            return sum
          })
        const sumBudget = (filterIncome: boolean) =>
          Array.from({ length: 12 }, (_, m) => {
            let sum = 0; let hasAny = false
            for (const [catId, b] of budgetsMap) {
              if ((typeMap.get(catId) === 'income') !== filterIncome) continue
              const amt = getBudgetForMonth(b, m, selectedYear)
              if (amt !== null) { sum += amt; hasAny = true }
            }
            return hasAny ? sum : null
          })

        const totalMonthClick = onMonthDrillDown ? (m: number) => {
          const from = `${selectedYear}-${String(m + 1).padStart(2, '0')}-01`
          const to   = `${selectedYear}-${String(m + 1).padStart(2, '0')}-${String(new Date(selectedYear, m + 1, 0).getDate()).padStart(2, '0')}`
          onMonthDrillDown(null, from, to)
        } : undefined

        return (
          <>
            <div style={{ ...s.card, marginBottom: '20px' }}>
              <div style={s.cardHeader}>
                <p style={s.parentName}>All Categories — Expenses</p>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{selectedYear} totals</span>
              </div>
              <CategorySpendGraph
                monthlySpend={sumSpend(expenseIds)}
                monthlyBudget={sumBudget(false)}
                selectedYear={selectedYear}
                currencySymbol={currencySymbol}
                isLoading={graphLoading}
                onMonthClick={totalMonthClick}
              />
            </div>
            {incomeIds.length > 0 && (
              <div style={{ ...s.card, marginBottom: '20px' }}>
                <div style={s.cardHeader}>
                  <p style={s.parentName}>All Categories — Income</p>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{selectedYear} totals</span>
                </div>
                <CategorySpendGraph
                  monthlySpend={sumSpend(incomeIds)}
                  monthlyBudget={sumBudget(true)}
                  selectedYear={selectedYear}
                  currencySymbol={currencySymbol}
                  isLoading={graphLoading}
                  onMonthClick={totalMonthClick}
                  isIncome
                />
              </div>
            )}
          </>
        )
      })()}

      {parents.map(parent => {
        const children = subcategories.filter(c => c.parent_id === parent.id)
        const hasChildren = children.length > 0

        const parentSpend = (spendMap.get(parent.id) ?? 0) + children.reduce((s, c) => s + (spendMap.get(c.id) ?? 0), 0)
        const isIncome = typeMap.get(parent.id) === 'income' || children.some(c => typeMap.get(c.id) === 'income')

        const childrenWithBudget = children.filter(c => budgetsMap.has(c.id))
        const parentBudgetMonthly = hasChildren
          ? (childrenWithBudget.length > 0 ? children.reduce((s, c) => s + (catBudgetMonthly(c.id) ?? 0), 0) : null)
          : catBudgetMonthly(parent.id)

        return (
          <div key={parent.id} style={s.card}>
            {/* Card header */}
            <div style={s.cardHeader}>
              <p style={s.parentName}>{parent.name}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button style={s.btn('small')} onClick={() => setAddModalFor(parent.id)}>+ Add Subcategory</button>
                <DotsMenu items={[
                  { label: 'Rename', onClick: () => setRenamingCat(parent) },
                  { label: 'Archive', onClick: () => handleArchive(parent) },
                  { label: 'Delete', danger: true, onClick: () => handleDelete(parent) },
                ]} />
              </div>
            </div>

            {messages[parent.id] && <div style={s.notice(messages[parent.id].type)}>{messages[parent.id].text}</div>}

            {/* Subcategories with per-sub budget */}
            {hasChildren && (
              <ul style={s.subList}>
                {children.map(sub => {
                  const subSpend = spendMap.get(sub.id) ?? 0
                  const subIsIncome = typeMap.get(sub.id) === 'income' || isIncome
                  const subBudget = catBudgetMonthly(sub.id)
                  return (
                    <li key={sub.id} style={s.subItem}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={s.subName}>{sub.name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            onClick={() => setBudgetingCategory(sub)}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', padding: 0, color: budgetsMap.has(sub.id) ? 'var(--color-primary-text)' : 'var(--color-text-muted)' }}
                          >
                            {budgetSummaryStr(sub.id) ?? `+ Set ${selectedYear} budget`}
                          </button>
                          <DotsMenu items={[
                            { label: 'Rename', onClick: () => setRenamingCat(sub) },
                            { label: 'Archive', onClick: () => handleArchive(sub) },
                            { label: 'Delete', danger: true, onClick: () => handleDelete(sub) },
                          ]} />
                        </div>
                      </div>
                      {!isNextYear && !showGraph && <BudgetBar spent={subSpend} budget={subBudget} isIncome={subIsIncome} />}
                      {showGraph && (
                        <CategorySpendGraph
                          monthlySpend={catMonthlySpendArray(sub.id)}
                          monthlyBudget={catMonthlyBudgetArray(sub.id)}
                          selectedYear={selectedYear}
                          currencySymbol={currencySymbol}
                          isLoading={graphLoading}
                          onMonthClick={makeMonthClickHandler(sub.id)}
                          isIncome={subIsIncome}
                        />
                      )}
                      {messages[sub.id] && <div style={s.notice(messages[sub.id].type)}>{messages[sub.id].text}</div>}
                    </li>
                  )
                })}
              </ul>
            )}

            {/* Budget section */}
            <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {isNextYear ? `${selectedYear} Budget` : (hasChildren ? 'Total This Month' : 'Monthly Budget')}
                </span>
                {!hasChildren && (
                  <button
                    onClick={() => setBudgetingCategory(parent)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', padding: 0, color: budgetsMap.has(parent.id) ? 'var(--color-primary-text)' : 'var(--color-text-muted)' }}
                  >
                    {budgetSummaryStr(parent.id) ?? `+ Set ${selectedYear} budget`}
                  </button>
                )}
                {hasChildren && parentBudgetMonthly !== null && !isNextYear && (
                  <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    {currencySymbol}{formatAmount(parentBudgetMonthly)}/mo combined
                  </span>
                )}
                {hasChildren && isNextYear && (
                  <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    Set budgets on subcategories above
                  </span>
                )}
              </div>
              {!isNextYear && !showGraph && <BudgetBar spent={parentSpend} budget={parentBudgetMonthly} isIncome={isIncome} />}
            </div>

            {/* For leaf categories (no children), chart sits here */}
            {showGraph && !hasChildren && (
              <CategorySpendGraph
                monthlySpend={catMonthlySpendArray(parent.id)}
                monthlyBudget={catMonthlyBudgetArray(parent.id)}
                selectedYear={selectedYear}
                currencySymbol={currencySymbol}
                isLoading={graphLoading}
                onMonthClick={makeMonthClickHandler(parent.id)}
                isIncome={isIncome}
              />
            )}
          </div>
        )
      })}

      {addModalFor && (
        <AddModal
          title={addModalParent ? `Add subcategory under "${addModalParent.name}"` : 'Add a parent category'}
          onSave={handleCreate}
          onClose={() => setAddModalFor(null)}
        />
      )}

      {renamingCat && (
        <RenameModal
          current={renamingCat.name}
          onSave={handleRename}
          onClose={() => setRenamingCat(null)}
        />
      )}

      {budgetingCategory && (
        <SetBudgetModal
          category={budgetingCategory}
          existingBudget={budgetsMap.get(budgetingCategory.id) ?? null}
          year={selectedYear}
          onSave={() => { setBudgetingCategory(null); load() }}
          onClose={() => setBudgetingCategory(null)}
        />
      )}
    </div>
  )
}
