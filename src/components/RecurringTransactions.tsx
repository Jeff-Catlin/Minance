import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Account, Category, Transaction } from '../types'
import { useSettings } from '../context/SettingsContext'
import TransactionDetailModal from './TransactionDetailModal'
import EditTransactionModal from './EditTransactionModal'

// ── Types ─────────────────────────────────────────────────────────────────────

type Cadence = 'weekly' | 'biweekly' | 'semi-monthly' | 'monthly' | 'quarterly' | 'biannually' | 'annually'
type GraphMode = 'historical' | 'forecast'
type GraphFilter = Set<Cadence>
type GraphRange = 1 | 3 | 6 | 12 | 'ytd'

interface RecurringEntry {
  id: string
  vendor: string
  category_id: string | null
  cadence: Cadence
  expected_day: number | null
  expected_month: number | null
  expected_months: string | null
  created_at: string
}

interface Suggestion {
  vendor: string
  category_id: string | null
  cadence: Cadence
  occurrences: number
  avgAmount: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CADENCE_LABELS: Record<Cadence, string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  'semi-monthly': 'Twice monthly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  biannually: 'Biannually',
  annually: 'Annually',
}

const CADENCE_MONTHS: Record<Cadence, number> = {
  weekly: 0,           // day-based — handled separately in forecast
  biweekly: 0,         // day-based — handled separately in forecast
  'semi-monthly': 0,   // twice per month — handled separately in forecast
  monthly: 1,
  quarterly: 3,
  biannually: 6,
  annually: 12,
}

const CADENCE_TARGET_DAYS: Record<Cadence, number> = {
  weekly: 7,
  biweekly: 14,
  'semi-monthly': 15,
  monthly: 30,
  quarterly: 91,
  biannually: 182,
  annually: 365,
}

const CADENCE_TOLERANCE: Record<Cadence, number> = {
  weekly: 1,
  biweekly: 2,
  'semi-monthly': 1,
  monthly: 5,
  quarterly: 10,
  biannually: 15,
  annually: 15,
}

const CADENCE_COLORS: Record<Cadence, string> = {
  weekly: '#10B981',
  biweekly: '#06B6D4',
  'semi-monthly': '#3B82F6',
  monthly: '#0E9F8E',
  quarterly: '#8B5CF6',
  biannually: '#F59E0B',
  annually: '#EF4444',
}

const CADENCE_ORDER: Record<Cadence, number> = {
  weekly: 0, biweekly: 1, 'semi-monthly': 2, monthly: 3, quarterly: 4, biannually: 5, annually: 6,
}

// ── Date helpers ──────────────────────────────────────────────────────────────

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const DAY_NAMES_PLURAL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function detectDayOfWeek(txns: Transaction[]): string | null {
  if (txns.length === 0) return null
  const counts = new Array(7).fill(0)
  for (const t of txns) counts[new Date(t.date + 'T12:00:00').getDay()]++
  return DAY_NAMES_PLURAL[counts.indexOf(Math.max(...counts))]
}

// Cadence-aware representative amount:
// Low CV (<15%) = flat-rate subscription → recent N transactions to capture price drift
// High CV (≥15%) = variable (utilities) → 12-month rolling average
function computeSmartAmount(txns: Transaction[], cadence: Cadence): number {
  if (txns.length === 0) return 0
  const sorted = [...txns].sort((a, b) => b.date.localeCompare(a.date))
  const amounts = sorted.map(t => t.amount)
  const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length
  if (amounts.length === 1) return amounts[0]
  const stdDev = Math.sqrt(amounts.map(a => Math.pow(a - avg, 2)).reduce((s, v) => s + v, 0) / amounts.length)
  const cv = avg > 0 ? stdDev / avg : 0
  if (cv < 0.15) {
    const n = (cadence === 'weekly' || cadence === 'biweekly') ? Math.min(10, sorted.length)
      : cadence === 'monthly' ? Math.min(3, sorted.length)
      : Math.min(2, sorted.length)
    return sorted.slice(0, n).reduce((s, t) => s + t.amount, 0) / n
  }
  const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 1)
  const recent = sorted.filter(t => t.date >= cutoff.toISOString().slice(0, 10))
  return recent.length > 0 ? recent.reduce((s, t) => s + t.amount, 0) / recent.length : avg
}

function formatExpectedDate(cadence: Cadence, day: number | null, month: number | null, dayOfWeek?: string | null, expectedMonthsJson?: string | null): string | null {
  if (cadence === 'weekly' || cadence === 'biweekly') {
    if (day !== null && day >= 1 && day <= 7) return `Expected on ${DAY_NAMES[day - 1]}s`
    return dayOfWeek ? `Expected on ${dayOfWeek}` : null
  }
  if (cadence === 'semi-monthly') {
    if (expectedMonthsJson) {
      try {
        const [d1, d2] = JSON.parse(expectedMonthsJson) as [number, number]
        return `Expected on the ${ordinal(d1)} & ${d2 === 31 ? 'last day' : ordinal(d2)}`
      } catch { /* fall through */ }
    }
    return 'Expected on the 15th & last day'
  }
  if (!day) return null
  if (cadence === 'monthly') return `Expected around the ${ordinal(day)}`
  if (cadence === 'quarterly' || cadence === 'biannually') {
    if (expectedMonthsJson) {
      try {
        const months: number[] = JSON.parse(expectedMonthsJson)
        if (months.length > 0) {
          const monthStr = [...months].sort((a, b) => a - b).map(m => MONTH_SHORT[m - 1]).join(', ')
          return `Expected around the ${ordinal(day)} of ${monthStr}`
        }
      } catch { /* ignore parse errors */ }
    }
    if (month) return `Expected around ${MONTH_NAMES[month - 1]} ${ordinal(day)}`
    return `Expected around the ${ordinal(day)}`
  }
  if (month) return `Expected around ${MONTH_NAMES[month - 1]} ${ordinal(day)}`
  return `Expected around the ${ordinal(day)}`
}

function detectExpectedDate(
  txns: Transaction[],
  cadence: Cadence,
): { expected_day: number | null; expected_month: number | null } {
  if (cadence === 'weekly' || cadence === 'biweekly') return { expected_day: null, expected_month: null }
  if (txns.length === 0) return { expected_day: null, expected_month: null }
  const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date))
  const days = sorted.map(t => new Date(t.date).getDate())
  const expected_day = Math.round(days.reduce((a, b) => a + b, 0) / days.length)
  if (cadence === 'monthly') return { expected_day, expected_month: null }
  const recentMonth = new Date(sorted[sorted.length - 1].date).getMonth() + 1
  return { expected_day, expected_month: recentMonth }
}

// ── Pattern detection ─────────────────────────────────────────────────────────

function detectCadence(gaps: number[]): Cadence | null {
  if (gaps.length === 0) return null
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length
  for (const cadence of ['weekly', 'biweekly', 'monthly', 'quarterly', 'biannually', 'annually'] as Cadence[]) {
    const target = CADENCE_TARGET_DAYS[cadence]
    const tol = CADENCE_TOLERANCE[cadence]
    if (Math.abs(avg - target) <= tol) {
      // Allow up to 25% of gaps to be off-cycle (e.g. one-off charge from same vendor)
      const conforming = gaps.filter(g => Math.abs(g - target) <= tol * 2).length
      if (conforming >= Math.max(1, Math.ceil(gaps.length * 0.75))) return cadence
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
      avgAmount: computeSmartAmount(sorted, cadence),
    })
  }

  return results
}

// ── Graph helpers ─────────────────────────────────────────────────────────────

type BarPoint = { label: string; amount: number; breakdown: { name: string; amount: number }[] }

function buildHistoricalData(
  transactions: Transaction[],
  recurring: RecurringEntry[],
  filter: GraphFilter,
  range: GraphRange,
  categoryFilter: Set<string>,
): BarPoint[] {
  const now = new Date()
  const filtered = recurring
    .filter(r => filter.size === 0 || filter.has(r.cadence))
    .filter(r => categoryFilter.size === 0 || (r.category_id !== null && categoryFilter.has(r.category_id)))
  const data: BarPoint[] = []

  const monthsBack = range === 'ytd' ? now.getMonth() : (range as number) - 1

  for (let i = monthsBack; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = d.getMonth()
    const from = `${y}-${String(m + 1).padStart(2, '0')}-01`
    const to = `${y}-${String(m + 1).padStart(2, '0')}-${String(new Date(y, m + 1, 0).getDate()).padStart(2, '0')}`
    const label = d.toLocaleString('en-US', { month: 'short', year: '2-digit' })

    const breakdown: { name: string; amount: number }[] = []
    for (const r of filtered) {
      const amt = transactions
        .filter(t => t.vendor === r.vendor && t.category_id === r.category_id && t.date >= from && t.date <= to)
        .reduce((s, t) => s + t.amount, 0)
      if (amt > 0) breakdown.push({ name: r.vendor, amount: amt })
    }
    breakdown.sort((a, b) => b.amount - a.amount)
    data.push({ label, amount: breakdown.reduce((s, b) => s + b.amount, 0), breakdown })
  }

  return data
}

function buildForecastData(
  transactions: Transaction[],
  recurring: RecurringEntry[],
  filter: GraphFilter,
  range: GraphRange,
  categoryFilter: Set<string>,
): BarPoint[] {
  const now = new Date()
  const filtered = recurring
    .filter(r => filter.size === 0 || filter.has(r.cadence))
    .filter(r => categoryFilter.size === 0 || (r.category_id !== null && categoryFilter.has(r.category_id)))
  const data: BarPoint[] = []

  const monthsAhead = range === 'ytd' ? 12 - now.getMonth() : range as number

  for (let i = 0; i < monthsAhead; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const year = d.getFullYear()
    const month = d.getMonth()
    const label = d.toLocaleString('en-US', { month: 'short', year: '2-digit' })
    const breakdown: { name: string; amount: number }[] = []

    for (const r of filtered) {
      const matches = transactions
        .filter(t => t.vendor === r.vendor && t.category_id === r.category_id)
        .sort((a, b) => b.date.localeCompare(a.date))
      if (matches.length === 0) continue

      // Determine how many times this entry hits the target month
      const lastDate = new Date(matches[0].date)
      let occurrences = 0

      if (r.cadence === 'weekly' || r.cadence === 'biweekly') {
        // Day-based: count how many times the interval lands in the target month
        const intervalDays = r.cadence === 'weekly' ? 7 : 14
        const daysInMonth = new Date(year, month + 1, 0).getDate()
        occurrences = Math.round(daysInMonth / intervalDays)
      } else if (r.cadence === 'semi-monthly') {
        occurrences = 2
      } else {
        const intervalMonths = CADENCE_MONTHS[r.cadence]
        let proj = new Date(lastDate)
        for (let n = 1; n <= 24; n++) {
          proj = new Date(proj.getFullYear(), proj.getMonth() + intervalMonths, proj.getDate())
          if (proj.getFullYear() === year && proj.getMonth() === month) { occurrences = 1; break }
          if (proj.getFullYear() > year || (proj.getFullYear() === year && proj.getMonth() > month)) break
        }
      }
      if (occurrences === 0) continue

      // Project amount using variance-aware logic:
      // Coefficient of variation (std dev / mean) tells us if this is flat-fee or seasonal.
      // Low CV  (<15%) → flat fee → use recent average (captures price increases)
      // High CV (≥15%) → seasonal → use prior-year same month → overall average fallback
      const allAmounts  = matches.map(t => t.amount)
      const avgAll      = allAmounts.reduce((s, a) => s + a, 0) / allAmounts.length
      const stdDev      = allAmounts.length > 1
        ? Math.sqrt(allAmounts.map(a => Math.pow(a - avgAll, 2)).reduce((s, v) => s + v, 0) / allAmounts.length)
        : 0
      const cv          = avgAll > 0 ? stdDev / avgAll : 0

      let projAmount: number
      if (cv < 0.15) {
        // Flat fee — recent average picks up price changes faster than historical average
        const recentN   = Math.min(3, matches.length)
        projAmount      = matches.slice(0, recentN).reduce((s, t) => s + t.amount, 0) / recentN
      } else {
        // Seasonal — try prior-year same month, fall back to overall average
        const priorYear = year - 1
        const priorFrom = `${priorYear}-${String(month + 1).padStart(2, '0')}-01`
        const priorTo   = `${priorYear}-${String(month + 1).padStart(2, '0')}-${String(new Date(priorYear, month + 1, 0).getDate()).padStart(2, '0')}`
        const priorTxns = matches.filter(t => t.date >= priorFrom && t.date <= priorTo)
        projAmount      = priorTxns.length > 0
          ? priorTxns.reduce((s, t) => s + t.amount, 0) / priorTxns.length
          : avgAll
      }

      breakdown.push({ name: r.vendor, amount: projAmount * occurrences })
    }

    breakdown.sort((a, b) => b.amount - a.amount)
    data.push({ label, amount: breakdown.reduce((s, b) => s + b.amount, 0), breakdown })
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

function BarChart({ data, sym, color }: { data: BarPoint[]; sym: string; color: string }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const max = Math.max(...data.map(d => d.amount), 1)
  const BAR_H = 200
  const BAR_W = 36
  const GAP = 24
  const totalW = data.length * (BAR_W + GAP) - GAP
  const hoveredBar = hovered !== null ? data[hovered] : null

  return (
    <div style={{ position: 'relative' }}>
      {/* Scrollable bar area */}
      <div style={{ overflowX: 'auto' }}>
        <svg
          width={totalW}
          height={BAR_H + 44}
          style={{ display: 'block', minWidth: '100%', overflow: 'visible' }}
        >
          {data.map((d, i) => {
            const barH = d.amount > 0 ? Math.max((d.amount / max) * BAR_H, 4) : 0
            const x = i * (BAR_W + GAP)
            const isHov = hovered === i
            return (
              <g
                key={d.label}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'default' }}
              >
                <rect
                  x={x} y={barH > 0 ? BAR_H - barH : BAR_H - 2}
                  width={BAR_W} height={barH > 0 ? barH : 2}
                  fill={isHov ? color : barH > 0 ? color : 'var(--color-border)'}
                  rx={3} opacity={isHov ? 1 : d.amount === 0 ? 0.3 : 0.65}
                />
                <text x={x + BAR_W / 2} y={BAR_H + 16} textAnchor="middle" fontSize={11}
                  fill={isHov ? color : 'var(--color-text-muted)'} fontFamily="inherit">
                  {d.label}
                </text>
                {d.amount > 0 && (
                  <text x={x + BAR_W / 2} y={BAR_H + 31} textAnchor="middle" fontSize={10}
                    fill={color} fontFamily="inherit" opacity={isHov ? 1 : 0.75}>
                    {sym}{Math.round(d.amount).toLocaleString('en-US')}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Hover tooltip — outside the scroll container so it can extend freely downward */}
      {hoveredBar && hovered !== null && (
        <div style={{
          position: 'absolute',
          top: 0,
          right: 0,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          padding: '10px 12px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          zIndex: 100,
          minWidth: '160px',
          maxWidth: '220px',
          pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--color-text)', marginBottom: hoveredBar.breakdown.length > 0 ? '6px' : 0 }}>
            {hoveredBar.label}
            <span style={{ color, marginLeft: '6px' }}>
              {sym}{formatAmount(hoveredBar.amount)}
            </span>
          </div>
          {hoveredBar.breakdown.map((item, j) => (
            <div key={j} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '3px' }}>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.name}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {sym}{formatAmount(item.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
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
  transactions: Transaction[]
  onSave: (vendor: string, category_id: string | null, cadence: Cadence, expected_day: number | null, expected_month: number | null, expected_months: number[] | null) => Promise<string | null>
  onClose: () => void
}

function AddRecurringModal({ categoryOptions, transactions, onSave, onClose }: AddModalProps) {
  const [categoryId, setCategoryId] = useState('')
  const [vendor, setVendor] = useState('')
  const [cadence, setCadence] = useState<Cadence>('monthly')
  const [biweeklyMode, setBiweeklyMode] = useState<'interval' | 'dates'>('interval')
  const [semiDay1, setSemiDay1] = useState('15')
  const [semiDay2, setSemiDay2] = useState('30')
  const [expectedDay, setExpectedDay] = useState('')
  const [expectedMonth, setExpectedMonth] = useState('')
  const [expectedMonths, setExpectedMonths] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const vendorsByCategory = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const t of transactions) {
      const key = t.category_id ?? ''
      if (!map.has(key)) map.set(key, new Set())
      map.get(key)!.add(t.vendor)
    }
    return map
  }, [transactions])

  const categoriesByVendor = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const t of transactions) {
      const v = t.vendor.toLowerCase()
      if (!map.has(v)) map.set(v, new Set())
      map.get(v)!.add(t.category_id ?? '')
    }
    return map
  }, [transactions])

  const filteredVendors = useMemo(() => {
    if (!categoryId) return [...new Set(transactions.map(t => t.vendor))].sort()
    return [...(vendorsByCategory.get(categoryId) ?? [])].sort()
  }, [categoryId, vendorsByCategory, transactions])

  const filteredCategoryOptions = useMemo(() => {
    const trimmed = vendor.trim().toLowerCase()
    if (!trimmed) return categoryOptions
    const validCatIds = categoriesByVendor.get(trimmed) ?? new Set<string>()
    if (validCatIds.size === 0) return categoryOptions
    return categoryOptions.filter(opt => validCatIds.has(opt.id))
  }, [vendor, categoriesByVendor, categoryOptions])

  function handleCategoryChange(newCat: string) {
    setCategoryId(newCat)
    // clear vendor only if it's no longer in the filtered list for the new category
    if (newCat && vendor) {
      const available = vendorsByCategory.get(newCat)
      if (available && !available.has(vendor)) setVendor('')
    }
  }

  function handleVendorChange(newVendor: string) {
    setVendor(newVendor)
    // clear category only if it's no longer valid for the typed vendor
    if (categoryId && newVendor.trim()) {
      const validCatIds = categoriesByVendor.get(newVendor.trim().toLowerCase())
      if (validCatIds && !validCatIds.has(categoryId)) setCategoryId('')
    }
  }

  function handleCadenceChange(newCadence: string) {
    setCadence(newCadence as Cadence)
    setBiweeklyMode('interval')
    setExpectedDay('')
    setExpectedMonth('')
    setExpectedMonths(new Set())
  }

  function toggleMonth(m: number) {
    const next = new Set(expectedMonths)
    if (next.has(m)) { next.delete(m) } else { next.add(m) }
    setExpectedMonths(next)
  }

  async function handleSave() {
    if (!vendor.trim()) { setError('Please enter a vendor name.'); return }
    const isTwiceMonthly = cadence === 'biweekly' && biweeklyMode === 'dates'
    const saveCadence: Cadence = isTwiceMonthly ? 'semi-monthly' : cadence
    const day    = isTwiceMonthly ? null : (expectedDay ? parseInt(expectedDay) : null)
    const month  = isTwiceMonthly ? null : (expectedMonth ? parseInt(expectedMonth) : null)
    const months = isTwiceMonthly
      ? [parseInt(semiDay1), parseInt(semiDay2)].sort((a, b) => a - b)
      : (expectedMonths.size > 0 ? [...expectedMonths].sort((a, b) => a - b) : null)
    setSaving(true)
    const err = await onSave(vendor.trim(), categoryId || null, saveCadence, day, month, months)
    setSaving(false)
    if (err) { setError(err) } else { onClose() }
  }

  const isTwiceMonthly = cadence === 'biweekly' && biweeklyMode === 'dates'
  const isWeeklyInterval = cadence === 'weekly' || (cadence === 'biweekly' && biweeklyMode === 'interval')
  const isMultiMonth = cadence === 'quarterly' || cadence === 'biannually'
  const isSingleMonth = cadence === 'annually'

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={s.modal}>
        <p style={{ fontSize: '17px', fontWeight: 600, color: 'var(--color-text)', margin: '0 0 4px 0' }}>
          Add Recurring Transaction
        </p>
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: '0 0 16px 0' }}>
          Track a regular charge by vendor and category.
        </p>

        <label style={s.modalLabel}>
          Category
          {vendor.trim() && filteredCategoryOptions.length < categoryOptions.length && (
            <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '6px' }}>
              ({filteredCategoryOptions.length} used by this vendor)
            </span>
          )}
        </label>
        <select style={s.select} value={categoryId} onChange={e => handleCategoryChange(e.target.value)}>
          <option value="">Uncategorized</option>
          {filteredCategoryOptions.map(opt => (
            <option key={opt.id} value={opt.id}>{opt.indent ? `  ${opt.label}` : opt.label}</option>
          ))}
        </select>

        <label style={s.modalLabel}>
          Vendor
          {categoryId && filteredVendors.length > 0 && (
            <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '6px' }}>
              ({filteredVendors.length} in this category)
            </span>
          )}
        </label>
        <input
          list="add-recurring-vendor-list"
          style={s.input}
          value={vendor}
          onChange={e => handleVendorChange(e.target.value)}
          placeholder={categoryId ? 'Type or pick a vendor…' : 'e.g. Netflix'}
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose() }}
        />
        <datalist id="add-recurring-vendor-list">
          {filteredVendors.map(v => <option key={v} value={v} />)}
        </datalist>

        <label style={s.modalLabel}>Cadence</label>
        <select style={s.select} value={cadence} onChange={e => handleCadenceChange(e.target.value)}>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Biweekly</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="biannually">Biannually</option>
          <option value="annually">Annually</option>
        </select>

        {cadence === 'biweekly' && (
          <>
            <label style={s.modalLabel}>Schedule</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button type="button" style={{ ...s.toggleBtn(biweeklyMode === 'interval'), fontSize: '12px', padding: '5px 12px' }} onClick={() => setBiweeklyMode('interval')}>
                Every 14 days
              </button>
              <button type="button" style={{ ...s.toggleBtn(biweeklyMode === 'dates'), fontSize: '12px', padding: '5px 12px' }} onClick={() => setBiweeklyMode('dates')}>
                Twice monthly
              </button>
            </div>
          </>
        )}

        {isTwiceMonthly ? (
          <>
            <label style={s.modalLabel}>Days of month</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select style={{ ...s.select, flex: 1 }} value={semiDay1} onChange={e => setSemiDay1(e.target.value)}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d}>{d === 31 ? '31st / End of month' : ordinal(d)}</option>
                ))}
              </select>
              <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>&amp;</span>
              <select style={{ ...s.select, flex: 1 }} value={semiDay2} onChange={e => setSemiDay2(e.target.value)}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d}>{d === 31 ? '31st / End of month' : ordinal(d)}</option>
                ))}
              </select>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '5px 0 0' }}>
              Days are clamped to the last day of shorter months (e.g. Feb).
            </p>
          </>
        ) : (
          <>
            <label style={{ ...s.modalLabel }}>{isWeeklyInterval ? 'Expected day of week' : 'Expected day of month'}</label>
            <select style={s.select} value={expectedDay} onChange={e => setExpectedDay(e.target.value)}>
              <option value="">Not set</option>
              {isWeeklyInterval
                ? DAY_NAMES.map((d, i) => <option key={i + 1} value={i + 1}>{d}</option>)
                : Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{ordinal(d)}</option>)
              }
            </select>
          </>
        )}

        {isSingleMonth && (
          <>
            <label style={s.modalLabel}>Expected month</label>
            <select style={s.select} value={expectedMonth} onChange={e => setExpectedMonth(e.target.value)}>
              <option value="">Not set</option>
              {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </>
        )}

        {isMultiMonth && (
          <>
            <label style={s.modalLabel}>
              Expected months
              <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '6px' }}>select all that apply</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {MONTH_SHORT.map((m, i) => {
                const monthNum = i + 1
                const active = expectedMonths.has(monthNum)
                return (
                  <button
                    key={monthNum}
                    type="button"
                    onClick={() => toggleMonth(monthNum)}
                    style={{ ...s.toggleBtn(active), padding: '4px 10px', fontSize: '12px' }}
                  >
                    {m}
                  </button>
                )
              })}
            </div>
          </>
        )}

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

// ── Edit modal ────────────────────────────────────────────────────────────────

interface EditModalProps {
  entry: RecurringEntry
  categoryOptions: { id: string; label: string; indent: boolean }[]
  onSave: (fields: {
    vendor: string
    category_id: string | null
    cadence: Cadence
    expected_day: number | null
    expected_month: number | null
    expected_months: number[] | null
  }) => Promise<string | null>
  onClose: () => void
}

function EditRecurringModal({ entry, categoryOptions, onSave, onClose }: EditModalProps) {
  const isSemiEntry = entry.cadence === 'semi-monthly'
  const parsedSemiDays: [number, number] = (() => {
    if (!entry.expected_months) return [15, 30]
    try { const d = JSON.parse(entry.expected_months) as number[]; return [d[0] ?? 15, d[1] ?? 30] } catch { return [15, 30] }
  })()

  const [vendor, setVendor] = useState(entry.vendor)
  const [categoryId, setCategoryId] = useState(entry.category_id ?? '')
  const [cadence, setCadence] = useState<Cadence>(isSemiEntry ? 'biweekly' : entry.cadence)
  const [biweeklyMode, setBiweeklyMode] = useState<'interval' | 'dates'>(isSemiEntry ? 'dates' : 'interval')
  const [semiDay1, setSemiDay1] = useState(String(parsedSemiDays[0]))
  const [semiDay2, setSemiDay2] = useState(String(parsedSemiDays[1]))
  const [expectedDay, setExpectedDay] = useState(entry.expected_day ? String(entry.expected_day) : '')
  const [expectedMonth, setExpectedMonth] = useState(entry.expected_month ? String(entry.expected_month) : '')
  const [expectedMonths, setExpectedMonths] = useState<Set<number>>(() => {
    if (isSemiEntry || !entry.expected_months) return new Set()
    try { return new Set(JSON.parse(entry.expected_months) as number[]) } catch { return new Set() }
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function handleCadenceChange(newCadence: string) {
    setCadence(newCadence as Cadence)
    setBiweeklyMode('interval')
    setExpectedDay('')
    setExpectedMonth('')
    setExpectedMonths(new Set())
  }

  function toggleMonth(m: number) {
    const next = new Set(expectedMonths)
    if (next.has(m)) { next.delete(m) } else { next.add(m) }
    setExpectedMonths(next)
  }

  async function handleSave() {
    if (!vendor.trim()) { setError('Please enter a vendor name.'); return }
    const isTwiceMonthly = cadence === 'biweekly' && biweeklyMode === 'dates'
    const saveCadence: Cadence = isTwiceMonthly ? 'semi-monthly' : cadence
    const day    = isTwiceMonthly ? null : (expectedDay   ? parseInt(expectedDay)   : null)
    const month  = isTwiceMonthly ? null : (expectedMonth ? parseInt(expectedMonth) : null)
    const months = isTwiceMonthly
      ? [parseInt(semiDay1), parseInt(semiDay2)].sort((a, b) => a - b)
      : (expectedMonths.size > 0 ? [...expectedMonths].sort((a, b) => a - b) : null)
    setSaving(true)
    const err = await onSave({
      vendor: vendor.trim(),
      category_id: categoryId || null,
      cadence: saveCadence,
      expected_day: day,
      expected_month: month,
      expected_months: months,
    })
    setSaving(false)
    if (err) { setError(err) } else { onClose() }
  }

  const isTwiceMonthly   = cadence === 'biweekly' && biweeklyMode === 'dates'
  const isWeeklyInterval = cadence === 'weekly' || (cadence === 'biweekly' && biweeklyMode === 'interval')
  const isMultiMonth     = cadence === 'quarterly' || cadence === 'biannually'
  const isSingleMonth    = cadence === 'annually'

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={s.modal}>
        <p style={{ fontSize: '17px', fontWeight: 600, color: 'var(--color-text)', margin: '0 0 4px 0' }}>
          Edit Recurring Transaction
        </p>
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: '0 0 16px 0' }}>
          Update the details for this recurring entry.
        </p>

        <label style={s.modalLabel}>Category</label>
        <select style={s.select} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
          <option value="">Uncategorized</option>
          {categoryOptions.map(opt => (
            <option key={opt.id} value={opt.id}>{opt.indent ? `  ${opt.label}` : opt.label}</option>
          ))}
        </select>

        <label style={s.modalLabel}>Vendor</label>
        <input
          style={s.input}
          value={vendor}
          onChange={e => setVendor(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose() }}
        />

        <label style={s.modalLabel}>Cadence</label>
        <select style={s.select} value={cadence} onChange={e => handleCadenceChange(e.target.value)}>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Biweekly</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="biannually">Biannually</option>
          <option value="annually">Annually</option>
        </select>

        {cadence === 'biweekly' && (
          <>
            <label style={s.modalLabel}>Schedule</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button type="button" style={{ ...s.toggleBtn(biweeklyMode === 'interval'), fontSize: '12px', padding: '5px 12px' }} onClick={() => setBiweeklyMode('interval')}>
                Every 14 days
              </button>
              <button type="button" style={{ ...s.toggleBtn(biweeklyMode === 'dates'), fontSize: '12px', padding: '5px 12px' }} onClick={() => setBiweeklyMode('dates')}>
                Twice monthly
              </button>
            </div>
          </>
        )}

        {isTwiceMonthly ? (
          <>
            <label style={s.modalLabel}>Days of month</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select style={{ ...s.select, flex: 1 }} value={semiDay1} onChange={e => setSemiDay1(e.target.value)}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d}>{d === 31 ? '31st / End of month' : ordinal(d)}</option>
                ))}
              </select>
              <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>&amp;</span>
              <select style={{ ...s.select, flex: 1 }} value={semiDay2} onChange={e => setSemiDay2(e.target.value)}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d}>{d === 31 ? '31st / End of month' : ordinal(d)}</option>
                ))}
              </select>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '5px 0 0' }}>
              Days are clamped to the last day of shorter months (e.g. Feb).
            </p>
          </>
        ) : (
          <>
            <label style={s.modalLabel}>{isWeeklyInterval ? 'Expected day of week' : 'Expected day of month'}</label>
            <select style={s.select} value={expectedDay} onChange={e => setExpectedDay(e.target.value)}>
              <option value="">Not set</option>
              {isWeeklyInterval
                ? DAY_NAMES.map((d, i) => <option key={i + 1} value={i + 1}>{d}</option>)
                : Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{ordinal(d)}</option>)
              }
            </select>
          </>
        )}

        {isSingleMonth && (
          <>
            <label style={s.modalLabel}>Expected month</label>
            <select style={s.select} value={expectedMonth} onChange={e => setExpectedMonth(e.target.value)}>
              <option value="">Not set</option>
              {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </>
        )}

        {isMultiMonth && (
          <>
            <label style={s.modalLabel}>
              Expected months
              <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '6px' }}>select all that apply</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {MONTH_SHORT.map((m, i) => {
                const monthNum = i + 1
                const active = expectedMonths.has(monthNum)
                return (
                  <button key={monthNum} type="button" onClick={() => toggleMonth(monthNum)}
                    style={{ ...s.toggleBtn(active), padding: '4px 10px', fontSize: '12px' }}>
                    {m}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {error && (
          <div style={{ marginTop: '12px', fontSize: '13px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(224,107,107,0.1)', color: 'var(--color-expense)', border: '1px solid var(--color-expense)' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button style={s.btn('ghost')} onClick={onClose}>Cancel</button>
          <button style={s.btn('primary')} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RecurringTransactions({ typeFilter, onSuggestionCount }: { typeFilter: 'expense' | 'income'; onSuggestionCount?: (n: number) => void }) {
  const { currencySymbol } = useSettings()
  const accent = typeFilter === 'expense' ? '#F59E0B' : 'var(--color-primary-text)'
  const accentBtn = (): React.CSSProperties => ({ ...s.btn('primary'), background: accent, borderColor: accent })
  const accentToggleBtn = (active: boolean): React.CSSProperties => ({
    ...s.toggleBtn(active),
    background: active ? accent : 'transparent',
    borderColor: active ? accent : 'var(--color-border)',
  })
  const [recurring, setRecurring] = useState<RecurringEntry[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [accountsMap, setAccountsMap] = useState<Map<string, Account>>(new Map())
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedSuggestions, setExpandedSuggestions] = useState<Set<string>>(new Set())
  const [showAllSuggestions, setShowAllSuggestions] = useState<Set<string>>(new Set())
  const [graphMode, setGraphMode] = useState<GraphMode>('historical')
  const [graphFilter, setGraphFilter] = useState<GraphFilter>(new Set())
  const [graphCadenceOpen, setGraphCadenceOpen] = useState(false)
  const graphCadenceRef = useRef<HTMLDivElement>(null)
  const [graphCategoryFilter, setGraphCategoryFilter] = useState<Set<string>>(new Set())
  const [graphCategoryOpen, setGraphCategoryOpen] = useState(false)
  const graphCategoryRef = useRef<HTMLDivElement>(null)
  const [expandedCategoryParents, setExpandedCategoryParents] = useState<Set<string>>(new Set())
  const [graphRange, setGraphRange] = useState<GraphRange>(6)
  const [showAddModal, setShowAddModal] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [editingEntry, setEditingEntry] = useState<RecurringEntry | null>(null)
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null)
  const [confirmErrors, setConfirmErrors] = useState<Map<string, string>>(new Map())
  const [cadenceFilter, setCadenceFilter] = useState<Cadence | ''>('')
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set())
  const [pendingExclude, setPendingExclude] = useState<string | null>(null)
  const [excludeError, setExcludeError] = useState<string | null>(null)
  const [detailTx, setDetailTx] = useState<(Transaction & { categoryName?: string | null }) | null>(null)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)

  async function load() {
    const [{ data: rec }, { data: txns }, { data: cats }, { data: dismissed }, { data: accts }, { data: exclusions }] = await Promise.all([
      supabase.from('recurring_transactions').select('*').order('vendor'),
      supabase.from('transactions').select('*').order('date', { ascending: false }),
      supabase.from('categories').select('*').eq('is_archived', false),
      supabase.from('dismissed_suggestions').select('vendor, category_id'),
      supabase.from('accounts').select('*'),
      supabase.from('recurring_exclusions').select('transaction_id'),
    ])

    setRecurring((rec ?? []) as RecurringEntry[])
    setTransactions(txns ?? [])
    setCategories(cats ?? [])
    setDismissedKeys(new Set((dismissed ?? []).map(d => `${d.vendor}|||${d.category_id ?? ''}`)))
    setAccountsMap(new Map((accts ?? []).map(a => [a.id, a as Account])))
    setExcludedIds(new Set((exclusions ?? []).map(e => e.transaction_id)))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!graphCadenceOpen) return
    function onMouseDown(e: MouseEvent) {
      if (graphCadenceRef.current && !graphCadenceRef.current.contains(e.target as Node)) {
        setGraphCadenceOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [graphCadenceOpen])

  useEffect(() => {
    if (!graphCategoryOpen) return
    function onMouseDown(e: MouseEvent) {
      if (graphCategoryRef.current && !graphCategoryRef.current.contains(e.target as Node)) {
        setGraphCategoryOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [graphCategoryOpen])

  useEffect(() => {
    if (!menuOpenId) return
    function onDocClick() { setMenuOpenId(null) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [menuOpenId])

  // ── Derived data ─────────────────────────────────────────────────────────────

  const nonExcludedTxns = useMemo(
    () => transactions.filter(t => !excludedIds.has(t.id) && (
      typeFilter === 'expense' ? (t.type === 'expense' || t.type === 'card_payment') : t.type === 'income'
    )),
    [transactions, excludedIds, typeFilter],
  )

  const typeFilteredRecurring = useMemo(() => {
    const keyTypes = new Map<string, string>()
    for (const t of transactions) {
      const key = `${t.vendor}|||${t.category_id ?? ''}`
      if (!keyTypes.has(key)) keyTypes.set(key, t.type)
    }
    return recurring.filter(r => {
      const type = keyTypes.get(`${r.vendor}|||${r.category_id ?? ''}`)
      if (type == null) return typeFilter === 'expense'
      return typeFilter === 'expense' ? (type === 'expense' || type === 'card_payment') : type === 'income'
    })
  }, [recurring, transactions, typeFilter])

  const suggestions = useMemo(
    () => detectPatterns(nonExcludedTxns, recurring, dismissedKeys),
    [nonExcludedTxns, recurring, dismissedKeys],
  )

  useEffect(() => { onSuggestionCount?.(suggestions.length) }, [suggestions.length, onSuggestionCount])

  // Expand selected parent IDs to also match their children in the actual chart filter
  const effectiveCategoryFilter = useMemo(() => {
    if (graphCategoryFilter.size === 0) return graphCategoryFilter
    const expanded = new Set(graphCategoryFilter)
    for (const id of graphCategoryFilter) {
      for (const cat of categories) {
        if (cat.parent_id === id) expanded.add(cat.id)
      }
    }
    return expanded
  }, [graphCategoryFilter, categories])

  const graphData = useMemo(() => {
    if (graphMode === 'historical') return buildHistoricalData(nonExcludedTxns, typeFilteredRecurring, graphFilter, graphRange, effectiveCategoryFilter)
    return buildForecastData(nonExcludedTxns, typeFilteredRecurring, graphFilter, graphRange, effectiveCategoryFilter)
  }, [graphMode, graphFilter, graphRange, effectiveCategoryFilter, nonExcludedTxns, typeFilteredRecurring])

  const monthlyAvg = useMemo(() => {
    const nonZero = graphData.filter(d => d.amount > 0)
    if (nonZero.length === 0) return 0
    return nonZero.reduce((s, d) => s + d.amount, 0) / nonZero.length
  }, [graphData])

  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])

  const recurringCategories = useMemo(() => {
    const ids = new Set(typeFilteredRecurring.map(r => r.category_id).filter((id): id is string => id !== null))
    return Array.from(ids)
      .map(id => catMap.get(id))
      .filter((c): c is Category => c !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [typeFilteredRecurring, catMap])

  // Bidirectional filtering: each filter shows only options valid given the other filter
  const availableCategoryIds = useMemo(() => {
    const relevant = graphFilter.size === 0
      ? typeFilteredRecurring
      : typeFilteredRecurring.filter(r => graphFilter.has(r.cadence))
    return new Set(relevant.map(r => r.category_id).filter((id): id is string => id !== null))
  }, [typeFilteredRecurring, graphFilter])

  const availableCadences = useMemo(() => {
    const relevant = effectiveCategoryFilter.size === 0
      ? typeFilteredRecurring
      : typeFilteredRecurring.filter(r => r.category_id !== null && effectiveCategoryFilter.has(r.category_id))
    return new Set(relevant.map(r => r.cadence))
  }, [typeFilteredRecurring, effectiveCategoryFilter])

  // Auto-deselect picks that become invalid when the other filter changes
  useEffect(() => {
    if (graphCategoryFilter.size === 0) return
    const next = new Set([...graphCategoryFilter].filter(id => {
      if (availableCategoryIds.has(id)) return true
      // Keep parent IDs whose children are still available
      return categories.some(c => c.parent_id === id && availableCategoryIds.has(c.id))
    }))
    if (next.size !== graphCategoryFilter.size) setGraphCategoryFilter(next)
  }, [availableCategoryIds, categories])

  useEffect(() => {
    if (graphFilter.size === 0) return
    const next = new Set([...graphFilter].filter(c => availableCadences.has(c)))
    if (next.size !== graphFilter.size) setGraphFilter(next as GraphFilter)
  }, [availableCadences])

  // Hierarchical category list for the dropdown
  const categoryHierarchy = useMemo(() => {
    type Node = { cat: Category; children: Category[] }
    const nodes: Node[] = []
    for (const cat of categories) {
      if (cat.parent_id !== null) continue
      const children = categories
        .filter(c => c.parent_id === cat.id && availableCategoryIds.has(c.id))
        .sort((a, b) => a.name.localeCompare(b.name))
      const hasDirectItems = availableCategoryIds.has(cat.id)
      if (!hasDirectItems && children.length === 0) continue
      nodes.push({ cat, children })
    }
    return nodes.sort((a, b) => a.cat.name.localeCompare(b.cat.name))
  }, [categories, availableCategoryIds])

  const parents = useMemo(() => categories.filter(c => c.parent_id === null), [categories])
  const categoryOptions = parents.flatMap(p => [
    { id: p.id, label: p.name, indent: false },
    ...categories.filter(c => c.parent_id === p.id).map(c => ({ id: c.id, label: c.name, indent: true })),
  ])


  const [showAllEntries, setShowAllEntries] = useState<Set<string>>(new Set())
  const ENTRY_LIMIT = 10

  const recurringSmartAmounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const entry of typeFilteredRecurring) {
      const txns = nonExcludedTxns.filter(t => t.vendor === entry.vendor && t.category_id === entry.category_id)
      map.set(`${entry.vendor}|||${entry.category_id ?? ''}`, computeSmartAmount(txns, entry.cadence))
    }
    return map
  }, [typeFilteredRecurring, nonExcludedTxns])

  const displayedRecurring = useMemo(() => {
    const base = cadenceFilter ? typeFilteredRecurring.filter(r => r.cadence === cadenceFilter) : typeFilteredRecurring
    return [...base].sort((a, b) => {
      const cadenceDiff = CADENCE_ORDER[a.cadence] - CADENCE_ORDER[b.cadence]
      if (cadenceDiff !== 0) return cadenceDiff
      const aAmt = recurringSmartAmounts.get(`${a.vendor}|||${a.category_id ?? ''}`) ?? 0
      const bAmt = recurringSmartAmounts.get(`${b.vendor}|||${b.category_id ?? ''}`) ?? 0
      return bAmt - aAmt
    })
  }, [cadenceFilter, typeFilteredRecurring, recurringSmartAmounts])

  function getEntryTransactions(entry: RecurringEntry): Transaction[] {
    return transactions
      .filter(t => t.vendor === entry.vendor && t.category_id === entry.category_id && !excludedIds.has(t.id))
      .sort((a, b) => b.date.localeCompare(a.date))
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleConfirm(sg: Suggestion) {
    const key = `${sg.vendor}|||${sg.category_id ?? ''}`
    setConfirmingKey(key)
    setConfirmErrors(prev => { const m = new Map(prev); m.delete(key); return m })

    const matches = transactions.filter(t => t.vendor === sg.vendor && t.category_id === sg.category_id)
    const { expected_day, expected_month } = detectExpectedDate(matches, sg.cadence)
    const { error } = await supabase.from('recurring_transactions').insert({
      vendor: sg.vendor,
      category_id: sg.category_id,
      cadence: sg.cadence,
      expected_day,
      expected_month,
    })

    setConfirmingKey(null)
    if (error) {
      setConfirmErrors(prev => new Map(prev).set(key, error.message))
      return
    }
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

  async function handleSaveEdit(id: string, fields: {
    vendor: string; category_id: string | null; cadence: Cadence
    expected_day: number | null; expected_month: number | null; expected_months: number[] | null
  }): Promise<string | null> {
    const { error } = await supabase.from('recurring_transactions').update({
      vendor: fields.vendor,
      category_id: fields.category_id,
      cadence: fields.cadence,
      expected_day: fields.expected_day,
      expected_month: fields.expected_month,
      expected_months: fields.expected_months ? JSON.stringify(fields.expected_months) : null,
    }).eq('id', id)
    if (error) return error.message
    load()
    return null
  }

  async function handleExclude(txId: string) {
    setExcludeError(null)
    const { error } = await supabase.from('recurring_exclusions').insert({ transaction_id: txId })
    if (error) {
      setExcludeError(error.message)
      return
    }
    setExcludedIds(prev => new Set([...prev, txId]))
    setPendingExclude(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 style={s.heading}>Recurring Transactions</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={s.btn('ghost')} onClick={() => { setLoading(true); load() }}>↻ Query Transactions</button>
          <button style={accentBtn()} onClick={() => setShowAddModal(true)}>+ Add Recurring</button>
        </div>
      </div>

      {/* ── Suggestions ── */}
      {suggestions.length > 0 && (
        <div style={s.suggestionCard}>
          <p style={{ ...s.sectionTitle, color: '#92400E', margin: '0 0 12px 0' }}>
            ✦ {suggestions.length} possible recurring {suggestions.length === 1 ? 'charge' : 'charges'} detected
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {suggestions.map(sg => {
              const cat    = sg.category_id ? catMap.get(sg.category_id) : null
              const sgKey  = `${sg.vendor}|||${sg.category_id ?? ''}`
              const isOpen = expandedSuggestions.has(sgKey)
              const showingAll = showAllSuggestions.has(sgKey)
              const LIMIT  = 5

              const sgTxns = transactions
                .filter(t => t.vendor === sg.vendor && t.category_id === sg.category_id)
                .sort((a, b) => b.date.localeCompare(a.date))
              const visible = showingAll ? sgTxns : sgTxns.slice(0, LIMIT)
              const sgDayOfWeek = (sg.cadence === 'weekly' || sg.cadence === 'biweekly') ? detectDayOfWeek(sgTxns) : null

              const isConfirming = confirmingKey === sgKey
              const confirmErr = confirmErrors.get(sgKey)

              return (
                <div
                  key={sgKey}
                  style={{
                    background: 'var(--color-bg)',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    overflow: 'hidden',
                  }}
                >
                  {/* Main row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '10px 14px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-text)' }}>{sg.vendor}</span>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-primary-text)', fontVariantNumeric: 'tabular-nums' }}>
                          ~{currencySymbol}{formatAmount(sg.avgAmount)}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                        {cat?.name ?? 'Uncategorized'}
                        {sgDayOfWeek && <span style={{ marginLeft: '6px', color: 'var(--color-primary-text)' }}>· Expected on {sgDayOfWeek}</span>}
                      </div>
                      <button
                        onClick={() => setExpandedSuggestions(prev => {
                          const next = new Set(prev)
                          next.has(sgKey) ? next.delete(sgKey) : next.add(sgKey)
                          return next
                        })}
                        style={{ fontFamily: 'inherit', fontSize: '12px', color: 'var(--color-text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0 0', display: 'block' }}
                      >
                        {isOpen ? '▲' : '▼'} {sg.occurrences} occurrences
                      </button>
                      {confirmErr && (
                        <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--color-expense)', padding: '4px 8px', borderRadius: '6px', background: 'rgba(224,107,107,0.08)', border: '1px solid rgba(224,107,107,0.3)' }}>
                          Could not save: {confirmErr}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, paddingTop: '2px' }}>
                      <span style={s.cadenceBadge(sg.cadence)}>{CADENCE_LABELS[sg.cadence]}</span>
                      <button style={s.btn('confirm')} onClick={() => handleConfirm(sg)} disabled={isConfirming}>
                        {isConfirming ? 'Saving…' : 'Confirm'}
                      </button>
                      <button style={s.btn('dismiss')} onClick={() => handleDismiss(sg)} disabled={isConfirming}>Dismiss</button>
                    </div>
                  </div>

                  {/* Expandable transactions */}
                  {isOpen && (
                    <div style={{ borderTop: '1px solid var(--color-border)', padding: '8px 14px 10px' }}>
                      {visible.map(t => (
                        <div key={t.id} onClick={() => setDetailTx({ ...t, categoryName: t.category_id ? catMap.get(t.category_id)?.name ?? null : null })} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}>
                          <div style={{ display: 'flex', gap: '12px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', flexShrink: 0 }}>{formatDate(t.date)}</span>
                            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{t.vendor}</span>
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: t.amount < 0 && t.type === 'expense' ? 'var(--color-income)' : 'var(--color-expense)' }}>
                            {t.amount < 0 && t.type === 'expense' ? '+' : '−'}{currencySymbol}{formatAmount(Math.abs(t.amount))}
                          </span>
                        </div>
                      ))}
                      {sgTxns.length > LIMIT && (
                        <button
                          onClick={() => setShowAllSuggestions(prev => {
                            const next = new Set(prev)
                            next.has(sgKey) ? next.delete(sgKey) : next.add(sgKey)
                            return next
                          })}
                          style={{ fontFamily: 'inherit', fontSize: '11px', color: 'var(--color-primary-text)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px 0 0' }}
                        >
                          {showingAll ? '▲ Show less' : `▼ Show all ${sgTxns.length} transactions`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Bar graph ── */}
      <div style={s.card}>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '10px' }}>
            <p style={s.sectionTitle}>
              {graphMode === 'historical'
                ? `Recurring ${typeFilter === 'income' ? 'income' : 'spend'} — ${graphRange === 'ytd' ? 'YTD' : graphRange === 1 ? 'this month' : `last ${graphRange} months`}`
                : `Projected recurring ${typeFilter === 'income' ? 'income' : 'spend'} — ${graphRange === 'ytd' ? 'rest of year' : graphRange === 1 ? 'next month' : `next ${graphRange} months`}`
              }
            </p>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted)', flexShrink: 0, marginLeft: '12px' }}>
              {graphMode === 'historical' ? 'Monthly avg' : 'Projected avg'}:{' '}
              <strong style={{ color: 'var(--color-text)' }}>{currencySymbol}{formatAmount(monthlyAvg)}</strong>
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <button style={accentToggleBtn(graphMode === 'historical')} onClick={() => setGraphMode('historical')}>Historical</button>
              <button style={accentToggleBtn(graphMode === 'forecast')} onClick={() => setGraphMode('forecast')}>Forecast</button>
            </div>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <button style={accentToggleBtn(graphFilter.size === 0)} onClick={() => setGraphFilter(new Set())}>All</button>
              {/* Cadence multi-select dropdown */}
              <div ref={graphCadenceRef} style={{ position: 'relative' }}>
                <button
                  style={accentToggleBtn(graphFilter.size > 0)}
                  onClick={() => setGraphCadenceOpen(o => !o)}
                >
                  Cadence{graphFilter.size > 0 ? ` (${graphFilter.size})` : ''}
                </button>
                {graphCadenceOpen && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                    borderRadius: '8px', padding: '6px 0', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                    minWidth: '150px',
                  }}>
                    {(['weekly', 'biweekly', 'semi-monthly', 'monthly', 'quarterly', 'biannually', 'annually'] as Cadence[]).filter(c => availableCadences.has(c)).map(c => {
                      const checked = graphFilter.has(c)
                      return (
                        <label key={c} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 14px', cursor: 'pointer', fontSize: '13px', color: 'var(--color-text)' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = new Set(graphFilter)
                              checked ? next.delete(c) : next.add(c)
                              setGraphFilter(next)
                            }}
                            style={{ cursor: 'pointer', accentColor: accent }}
                          />
                          {CADENCE_LABELS[c]}
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
              <div style={{ width: '1px', background: 'var(--color-border)', margin: '0 4px' }} />
              {([1, 3, 6, 12, 'ytd'] as GraphRange[]).map(r => (
                <button key={r} style={accentToggleBtn(graphRange === r)} onClick={() => setGraphRange(r)}>
                  {r === 'ytd' ? 'YTD' : r === 1 ? '1M' : r === 3 ? '3M' : r === 6 ? '6M' : '12M'}
                </button>
              ))}
              {recurringCategories.length > 0 && (
                <>
                  <div style={{ width: '1px', background: 'var(--color-border)', margin: '0 4px' }} />
                  <div ref={graphCategoryRef} style={{ position: 'relative' }}>
                    <button
                      style={accentToggleBtn(graphCategoryFilter.size > 0)}
                      onClick={() => setGraphCategoryOpen(o => !o)}
                    >
                      Category{graphCategoryFilter.size > 0 ? ` (${graphCategoryFilter.size})` : ''}
                    </button>
                    {graphCategoryOpen && (
                      <div style={{
                        position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
                        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                        borderRadius: '8px', padding: '6px 0', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                        minWidth: '190px', maxHeight: '280px', overflowY: 'auto',
                      }}>
                        {categoryHierarchy.map(({ cat, children }) => {
                          const isExpanded = expandedCategoryParents.has(cat.id)
                          const hasChildren = children.length > 0
                          return (
                            <div key={cat.id}>
                              <div style={{ display: 'flex', alignItems: 'center', padding: '6px 14px', gap: '6px' }}>
                                <input
                                  type="checkbox"
                                  checked={graphCategoryFilter.has(cat.id)}
                                  onChange={() => {
                                    const next = new Set(graphCategoryFilter)
                                    graphCategoryFilter.has(cat.id) ? next.delete(cat.id) : next.add(cat.id)
                                    setGraphCategoryFilter(next)
                                  }}
                                  style={{ cursor: 'pointer', accentColor: accent, flexShrink: 0 }}
                                />
                                <span style={{ fontSize: '13px', color: 'var(--color-text)', flex: 1, userSelect: 'none' }}>{cat.name}</span>
                                {hasChildren && (
                                  <button
                                    onClick={() => setExpandedCategoryParents(prev => {
                                      const next = new Set(prev)
                                      next.has(cat.id) ? next.delete(cat.id) : next.add(cat.id)
                                      return next
                                    })}
                                    style={{ fontFamily: 'inherit', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '12px', padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
                                  >
                                    {isExpanded ? '▾' : '›'}
                                  </button>
                                )}
                              </div>
                              {isExpanded && children.map(child => {
                                const childChecked = graphCategoryFilter.has(child.id)
                                return (
                                  <label key={child.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 14px 5px 30px', cursor: 'pointer', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                    <input
                                      type="checkbox"
                                      checked={childChecked}
                                      onChange={() => {
                                        const next = new Set(graphCategoryFilter)
                                        childChecked ? next.delete(child.id) : next.add(child.id)
                                        setGraphCategoryFilter(next)
                                      }}
                                      style={{ cursor: 'pointer', accentColor: accent, flexShrink: 0 }}
                                    />
                                    {child.name}
                                  </label>
                                )
                              })}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {recurring.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', margin: 0 }}>
            No recurring transactions yet — confirm a suggestion or add one manually to see your chart.
          </p>
        ) : (
          <BarChart data={graphData} sym={currencySymbol} color={typeFilter === 'expense' ? '#F59E0B' : 'var(--color-primary)'} />
        )}
      </div>

      {/* ── Confirmed recurring list ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <p style={{ ...s.sectionTitle, margin: 0 }}>Confirmed Recurring</p>
        {recurring.length > 0 && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            <button style={accentToggleBtn(cadenceFilter === '')} onClick={() => setCadenceFilter('')}>All</button>
            {([...new Set(recurring.map(r => r.cadence))] as Cadence[])
              .sort((a, b) => CADENCE_ORDER[a] - CADENCE_ORDER[b])
              .map(c => (
                <button key={c} style={accentToggleBtn(cadenceFilter === c)} onClick={() => setCadenceFilter(c)}>
                  {CADENCE_LABELS[c]}
                </button>
              ))}
          </div>
        )}
      </div>

      {recurring.length === 0 ? (
        <div style={{ ...s.card, color: 'var(--color-text-muted)', fontSize: '14px' }}>
          Nothing here yet — confirm a suggestion above or add one manually.
        </div>
      ) : displayedRecurring.length === 0 ? (
        <div style={{ ...s.card, color: 'var(--color-text-muted)', fontSize: '14px' }}>
          No {CADENCE_LABELS[cadenceFilter as Cadence]} recurring entries.
        </div>
      ) : (
        displayedRecurring.map(entry => {
          const cat = entry.category_id ? catMap.get(entry.category_id) : null
          const isExpanded   = expandedId === entry.id
          const allEntryTxns = isExpanded ? getEntryTransactions(entry) : []
          const showingAll   = showAllEntries.has(entry.id)
          const visibleTxns  = showingAll ? allEntryTxns : allEntryTxns.slice(0, ENTRY_LIMIT)
          const entrySmartAmt = recurringSmartAmounts.get(`${entry.vendor}|||${entry.category_id ?? ''}`) ?? 0
          const entryDayOfWeek = (entry.cadence === 'weekly' || entry.cadence === 'biweekly')
            ? detectDayOfWeek(transactions.filter(t => t.vendor === entry.vendor && t.category_id === entry.category_id))
            : null

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
                    {formatExpectedDate(entry.cadence, entry.expected_day, entry.expected_month, entryDayOfWeek, entry.expected_months) && (
                      <span style={{ marginLeft: '8px', color: 'var(--color-primary-text)' }}>
                        · {formatExpectedDate(entry.cadence, entry.expected_day, entry.expected_month, entryDayOfWeek, entry.expected_months)}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                  {entrySmartAmt > 0 && (
                    <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
                      {currencySymbol}{formatAmount(entrySmartAmt)}
                    </span>
                  )}
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    {isExpanded ? '▲' : '▼'}
                  </span>
                  <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
                    <button
                      style={{ ...s.btn('ghost'), fontSize: '18px', padding: '2px 8px', lineHeight: 1, letterSpacing: '1px' }}
                      onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === entry.id ? null : entry.id) }}
                      title="More options"
                    >
                      ⋯
                    </button>
                    {menuOpenId === entry.id && (
                      <div style={{
                        position: 'absolute', right: 0, top: 'calc(100% + 4px)',
                        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                        borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
                        zIndex: 300, minWidth: '120px', overflow: 'hidden',
                      }}>
                        <button
                          style={{ display: 'block', width: '100%', textAlign: 'left', fontFamily: 'inherit', fontSize: '13px', padding: '9px 16px', background: 'transparent', border: 'none', color: 'var(--color-text)', cursor: 'pointer' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          onClick={() => { setEditingEntry(entry); setMenuOpenId(null) }}
                        >
                          Edit
                        </button>
                        <button
                          style={{ display: 'block', width: '100%', textAlign: 'left', fontFamily: 'inherit', fontSize: '13px', padding: '9px 16px', background: 'transparent', border: 'none', color: 'var(--color-expense)', cursor: 'pointer' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          onClick={() => { handleDelete(entry.id); setMenuOpenId(null) }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--color-border)' }}>
                  {allEntryTxns.length === 0 ? (
                    <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: 0 }}>
                      No matching transactions found in your history.
                    </p>
                  ) : (
                    <>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date</th>
                            <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Amount</th>
                            <th style={{ width: '32px' }} />
                          </tr>
                        </thead>
                        <tbody>
                          {visibleTxns.map(t => {
                            const isPending = pendingExclude === t.id
                            if (isPending) {
                              return (
                                <tr key={t.id} style={{ background: 'rgba(224,107,107,0.04)' }}>
                                  <td colSpan={3} style={{ padding: '7px 8px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ flex: 1, fontSize: '12px', color: 'var(--color-text)' }}>
                                          Remove {formatDate(t.date)} · {currencySymbol}{formatAmount(t.amount)} from this group?
                                        </span>
                                        <button
                                          onClick={() => handleExclude(t.id)}
                                          style={{ ...s.btn('dismiss'), fontSize: '12px', padding: '3px 10px', borderColor: 'var(--color-expense)', color: 'var(--color-expense)' }}
                                        >
                                          Confirm
                                        </button>
                                        <button
                                          onClick={() => { setPendingExclude(null); setExcludeError(null) }}
                                          style={{ ...s.btn('ghost'), fontSize: '12px', padding: '3px 10px' }}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                      {excludeError && (
                                        <div style={{ fontSize: '11px', color: 'var(--color-expense)', paddingLeft: '2px' }}>
                                          Error: {excludeError}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )
                            }
                            return (
                              <tr
                                key={t.id}
                                onClick={() => setDetailTx({ ...t, categoryName: t.category_id ? catMap.get(t.category_id)?.name ?? null : null })}
                                style={{ cursor: 'pointer' }}
                              >
                                <td style={{ padding: '6px 8px', color: 'var(--color-text-muted)' }}>{formatDate(t.date)}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 500, color: 'var(--color-primary-text)', fontVariantNumeric: 'tabular-nums' }}>
                                  {currencySymbol}{formatAmount(t.amount)}
                                </td>
                                <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                                  <button
                                    title="Remove from recurring group"
                                    onClick={e => { e.stopPropagation(); setPendingExclude(t.id) }}
                                    style={{ fontFamily: 'inherit', fontSize: '14px', lineHeight: 1, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', opacity: 0.4, padding: '0 2px', borderRadius: '4px' }}
                                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                                    onMouseLeave={e => (e.currentTarget.style.opacity = '0.4')}
                                  >
                                    ⊖
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                      {allEntryTxns.length > ENTRY_LIMIT && (
                        <button
                          onClick={() => setShowAllEntries(prev => {
                            const next = new Set(prev)
                            next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id)
                            return next
                          })}
                          style={{ fontFamily: 'inherit', fontSize: '12px', color: 'var(--color-primary-text)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px 0 0' }}
                        >
                          {showingAll ? '▲ Show less' : `▼ Show all ${allEntryTxns.length} transactions`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}

      {/* Edit modal */}
      {editingEntry && (
        <EditRecurringModal
          entry={editingEntry}
          categoryOptions={categoryOptions}
          onSave={fields => handleSaveEdit(editingEntry.id, fields)}
          onClose={() => setEditingEntry(null)}
        />
      )}

      {/* Add modal */}
      {showAddModal && (
        <AddRecurringModal
          categoryOptions={categoryOptions}
          transactions={transactions}
          onSave={async (vendor, category_id, cadence, expected_day, expected_month, expected_months) => {
            const { error } = await supabase.from('recurring_transactions').insert({
              vendor, category_id, cadence, expected_day, expected_month,
              expected_months: expected_months ? JSON.stringify(expected_months) : null,
            })
            if (error) return error.message
            load()
            return null
          }}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {detailTx && !editingTx && (
        <TransactionDetailModal
          transaction={detailTx}
          account={detailTx.account_id ? accountsMap.get(detailTx.account_id) : undefined}
          onEdit={() => { setEditingTx(detailTx); setDetailTx(null) }}
          onDeleted={() => { setDetailTx(null); load() }}
          onClose={() => setDetailTx(null)}
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
