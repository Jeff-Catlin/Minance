import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import type { Transaction } from '../types'
import { useSettings } from '../context/SettingsContext'

type Cadence = 'weekly' | 'biweekly' | 'semi-monthly' | 'monthly' | 'quarterly' | 'biannually' | 'annually'

interface RecurringEntry {
  id: string
  vendor: string
  category_id: string | null
  cadence: Cadence
  expected_day: number | null
  expected_month: number | null
  expected_months: string | null
}

interface DayEvent {
  vendor: string
  amount: number
  isIncome: boolean
}

const MONTH_ABBR  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DOW_ABBR    = ['Su','Mo','Tu','We','Th','Fr','Sa']

// Mirror of computeSmartAmount from RecurringTransactions
function smartAmount(txns: Transaction[]): number {
  if (txns.length === 0) return 0
  const sorted = [...txns].sort((a, b) => b.date.localeCompare(a.date))
  const amounts = sorted.map(t => t.amount)
  const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length
  if (amounts.length < 2) return amounts[0]
  const stdDev = Math.sqrt(amounts.map(a => (a - avg) ** 2).reduce((s, v) => s + v, 0) / amounts.length)
  if (stdDev / avg < 0.15) {
    const n = Math.min(3, sorted.length)
    return sorted.slice(0, n).reduce((s, t) => s + t.amount, 0) / n
  }
  return avg
}

function dominantDow(txns: Transaction[]): number | null {
  if (txns.length === 0) return null
  const counts = new Array(7).fill(0)
  for (const t of txns) counts[new Date(t.date + 'T12:00:00').getDay()]++
  return counts.indexOf(Math.max(...counts))
}

function occurrenceDaysInMonth(
  entry: RecurringEntry,
  txns: Transaction[],
  year: number,
  month: number,
): number[] {
  const cap = new Date(year, month + 1, 0).getDate()
  const days: number[] = []

  if (entry.cadence === 'monthly') {
    if (entry.expected_day) days.push(Math.min(entry.expected_day, cap))

  } else if (entry.cadence === 'weekly') {
    const dow = dominantDow(txns)
    if (dow !== null) {
      for (let d = 1; d <= cap; d++) {
        if (new Date(year, month, d).getDay() === dow) days.push(d)
      }
    }

  } else if (entry.cadence === 'biweekly') {
    const sorted = [...txns].sort((a, b) => b.date.localeCompare(a.date))
    if (sorted.length > 0) {
      const ref = new Date(sorted[0].date + 'T12:00:00')
      const end = new Date(year, month, cap)
      let d = new Date(ref)
      // Walk toward the target month
      while (d > end) d = new Date(d.getTime() - 14 * 86_400_000)
      while (d < new Date(year, month, 1)) d = new Date(d.getTime() + 14 * 86_400_000)
      while (d <= end) { days.push(d.getDate()); d = new Date(d.getTime() + 14 * 86_400_000) }
    }

  } else if (entry.cadence === 'semi-monthly') {
    if (entry.expected_months) {
      try {
        const [d1, d2] = JSON.parse(entry.expected_months) as [number, number]
        days.push(Math.min(d1, cap), Math.min(d2, cap))
      } catch { days.push(Math.floor(cap / 2), cap) }
    } else {
      days.push(Math.floor(cap / 2), cap)
    }

  } else if (entry.cadence === 'quarterly') {
    let months: number[] = []
    if (entry.expected_months) {
      try { months = JSON.parse(entry.expected_months) } catch { /* ignore */ }
    } else if (entry.expected_month !== null) {
      const m0 = entry.expected_month
      months = [m0, (m0 + 3) % 12, (m0 + 6) % 12, (m0 + 9) % 12]
    }
    if (months.includes(month) && entry.expected_day) days.push(Math.min(entry.expected_day, cap))

  } else if (entry.cadence === 'biannually') {
    let months: number[] = []
    if (entry.expected_months) {
      try { months = JSON.parse(entry.expected_months) } catch { /* ignore */ }
    } else if (entry.expected_month !== null) {
      const m0 = entry.expected_month
      months = [m0, (m0 + 6) % 12]
    }
    if (months.includes(month) && entry.expected_day) days.push(Math.min(entry.expected_day, cap))

  } else if (entry.cadence === 'annually') {
    if (entry.expected_month === month && entry.expected_day) {
      days.push(Math.min(entry.expected_day, cap))
    }
  }

  return [...new Set(days)].sort((a, b) => a - b)
}

export default function RecurringCalendar() {
  const { currencySymbol } = useSettings()
  const now = useMemo(() => new Date(), [])

  const thisYear  = now.getFullYear()
  const firstYear = thisYear - 5
  const lastYear  = thisYear + 2
  const years     = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i)

  const [calYear,  setCalYear]  = useState(thisYear)
  const [calMonth, setCalMonth] = useState(now.getMonth())
  const [entries,  setEntries]  = useState<RecurringEntry[]>([])
  const [txns,     setTxns]     = useState<Transaction[]>([])
  const [loading,  setLoading]  = useState(true)
  const [hovDay,   setHovDay]   = useState<number | null>(null)

  useEffect(() => {
    async function load() {
      const sixMonthsAgo = new Date(now)
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
      const [{ data: rec }, { data: tx }] = await Promise.all([
        supabase.from('recurring_transactions').select('*'),
        supabase.from('transactions').select('id,date,amount,type,vendor,category_id')
          .gte('date', sixMonthsAgo.toISOString().slice(0, 10)),
      ])
      setEntries((rec ?? []) as RecurringEntry[])
      setTxns((tx ?? []) as Transaction[])
      setLoading(false)
    }
    load()
  }, [])

  // Most-common type per vendor+category
  const typeMap = useMemo(() => {
    const m = new Map<string, 'income' | 'expense'>()
    for (const t of txns) {
      const k = `${t.vendor}|||${t.category_id ?? ''}`
      if (!m.has(k)) m.set(k, t.type === 'income' ? 'income' : 'expense')
    }
    return m
  }, [txns])

  // Events keyed by day-of-month
  const dayEvents = useMemo(() => {
    const map = new Map<number, DayEvent[]>()
    for (const entry of entries) {
      const k    = `${entry.vendor}|||${entry.category_id ?? ''}`
      const etxns = txns.filter(t => t.vendor === entry.vendor && t.category_id === entry.category_id)
      const amount   = smartAmount(etxns)
      const isIncome = typeMap.get(k) === 'income'
      for (const d of occurrenceDaysInMonth(entry, etxns, calYear, calMonth)) {
        if (!map.has(d)) map.set(d, [])
        map.get(d)!.push({ vendor: entry.vendor, amount, isIncome })
      }
    }
    return map
  }, [entries, txns, typeMap, calYear, calMonth])

  const atMin = calYear === firstYear && calMonth === 0
  const atMax = calYear === lastYear  && calMonth === 11

  function goBack() {
    if (atMin) return
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) } else setCalMonth(m => m - 1)
  }
  function goForward() {
    if (atMax) return
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) } else setCalMonth(m => m + 1)
  }

  const firstDow    = new Date(calYear, calMonth, 1).getDay()
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()

  function borderStyle(day: number): React.CSSProperties {
    const total = (dayEvents.get(day) ?? []).filter(e => !e.isIncome).reduce((s, e) => s + e.amount, 0)
    if (total === 0) return {}
    const w = total < 50 ? 1 : total < 200 ? 2 : 3
    return { outline: `${w}px solid var(--color-expense)`, outlineOffset: '-2px', borderRadius: '4px' }
  }

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer',
    padding: '2px 8px', color: 'var(--color-text)', fontSize: '16px',
    opacity: disabled ? 0.25 : 0.8, lineHeight: 1,
  })

  if (loading) return (
    <div style={{ width: '264px', flexShrink: 0, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Loading…</span>
    </div>
  )

  return (
    <div style={{ width: '264px', flexShrink: 0, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '16px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '10px' }}>
        <button style={btnStyle(atMin)} onClick={goBack} disabled={atMin}>‹</button>
        <select
          value={calMonth}
          onChange={e => setCalMonth(+e.target.value)}
          style={{ flex: 1, fontFamily: 'inherit', fontSize: '12px', fontWeight: 600, background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text)', cursor: 'pointer', padding: '3px 4px', outline: 'none' }}
        >
          {MONTH_ABBR.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select
          value={calYear}
          onChange={e => setCalYear(+e.target.value)}
          style={{ fontFamily: 'inherit', fontSize: '12px', fontWeight: 600, background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text)', cursor: 'pointer', padding: '3px 4px', outline: 'none' }}
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button style={btnStyle(atMax)} onClick={goForward} disabled={atMax}>›</button>
      </div>

      {/* DOW headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '2px' }}>
        {DOW_ABBR.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 600, color: 'var(--color-text-muted)', padding: '2px 0' }}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {Array.from({ length: firstDow }, (_, i) => <div key={`e${i}`} />)}

        {Array.from({ length: daysInMonth }, (_, i) => {
          const day      = i + 1
          const events   = dayEvents.get(day) ?? []
          const hasExp   = events.some(e => !e.isIncome)
          const hasInc   = events.some(e => e.isIncome)
          const isToday  = calYear === now.getFullYear() && calMonth === now.getMonth() && day === now.getDate()
          const isHov    = hovDay === day && events.length > 0
          const col      = (firstDow + i) % 7  // 0=Sun … 6=Sat

          // Tooltip anchor: left-side for cols 0-1, right-side for cols 5-6, centered otherwise
          const tooltipStyle: React.CSSProperties = {
            position: 'absolute',
            top: '110%',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '8px 10px',
            zIndex: 40,
            minWidth: '160px',
            maxWidth: '200px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
            pointerEvents: 'none',
            ...(col <= 1 ? { left: 0 } : col >= 5 ? { right: 0 } : { left: '50%', transform: 'translateX(-50%)' }),
          }

          return (
            <div
              key={day}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '30px',
                borderRadius: '4px',
                background: isToday ? 'rgba(34,195,166,0.1)' : isHov ? 'var(--color-bg)' : 'transparent',
                ...borderStyle(day),
              }}
              onMouseEnter={() => setHovDay(day)}
              onMouseLeave={() => setHovDay(null)}
            >
              <span style={{
                fontSize: '12px',
                fontWeight: isToday ? 700 : 400,
                color: hasInc
                  ? 'var(--color-income)'
                  : isToday
                    ? 'var(--color-primary-text)'
                    : hasExp ? 'var(--color-expense)' : 'var(--color-text)',
              }}>
                {day}
              </span>

              {isHov && (
                <div style={tooltipStyle}>
                  <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '5px', color: 'var(--color-text)' }}>
                    {MONTH_ABBR[calMonth]} {day}
                  </div>
                  {events.map((ev, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12px', marginTop: idx > 0 ? '3px' : 0, color: ev.isIncome ? 'var(--color-income)' : 'var(--color-expense)' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.vendor}</span>
                      <span style={{ fontWeight: 600, flexShrink: 0 }}>
                        {ev.amount > 0 ? `${currencySymbol}${ev.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '14px', marginTop: '10px', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--color-text-muted)' }}>
          <div style={{ width: '10px', height: '10px', outline: '2px solid var(--color-expense)', borderRadius: '2px' }} />
          Expense
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--color-text-muted)' }}>
          <span style={{ color: 'var(--color-income)', fontWeight: 700, fontSize: '12px', lineHeight: 1 }}>8</span>
          Income
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--color-text-muted)' }}>
          <div style={{ width: '10px', height: '10px', background: 'rgba(34,195,166,0.1)', borderRadius: '2px' }} />
          Today
        </div>
      </div>
    </div>
  )
}
