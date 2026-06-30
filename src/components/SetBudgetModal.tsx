import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Category } from '../types'
import { useSettings } from '../context/SettingsContext'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CategoryBudget {
  id: string
  category_id: string
  year: number
  mode: 'flat' | 'variable' | 'cadence'
  monthly_amount: number | null
  monthly_amounts: number[] | null
  variable_rollover_source: 'budget' | 'actuals' | null
  cadence: string | null
  reference_date: string | null
  amount_per_occurrence: number | null
  linked_recurring_id: string | null
}

// ── Budget helpers ─────────────────────────────────────────────────────────────

export function computeCadenceMonthlyAmounts(
  cadence: string,
  referenceDateStr: string,
  amountPerOccurrence: number,
  year: number,
): number[] {
  const amounts = new Array(12).fill(0)
  const ref = new Date(referenceDateStr + 'T12:00:00')
  const MS = 86400000

  if (cadence === 'weekly' || cadence === 'biweekly') {
    const step = cadence === 'weekly' ? 7 : 14
    const yearStart = new Date(year, 0, 1).getTime()
    const yearEnd   = new Date(year, 11, 31, 23, 59, 59).getTime()
    const refTime   = ref.getTime()
    const stepsNeeded = Math.ceil((yearStart - refTime) / (step * MS))
    let cur = refTime + stepsNeeded * step * MS
    while (cur <= yearEnd) {
      const d = new Date(cur)
      if (d.getFullYear() === year) amounts[d.getMonth()] += amountPerOccurrence
      cur += step * MS
    }
  } else if (cadence === 'monthly') {
    for (let m = 0; m < 12; m++) amounts[m] = amountPerOccurrence
  } else if (cadence === 'quarterly') {
    const start = ref.getMonth()
    for (let q = 0; q < 4; q++) amounts[(start + q * 3) % 12] += amountPerOccurrence
  } else if (cadence === 'biannually') {
    const m = ref.getMonth()
    amounts[m] += amountPerOccurrence
    amounts[(m + 6) % 12] += amountPerOccurrence
  } else if (cadence === 'annually') {
    amounts[ref.getMonth()] = amountPerOccurrence
  }

  return amounts
}

export function getBudgetForMonth(
  budget: CategoryBudget | null,
  month: number,
  year: number,
): number | null {
  if (!budget) return null
  if (budget.mode === 'flat') return budget.monthly_amount
  if (budget.mode === 'variable') return budget.monthly_amounts?.[month] ?? null
  if (budget.mode === 'cadence') {
    if (!budget.cadence || !budget.reference_date || budget.amount_per_occurrence === null) return null
    return computeCadenceMonthlyAmounts(budget.cadence, budget.reference_date, budget.amount_per_occurrence, year)[month]
  }
  return null
}

export function getAnnualBudgetTotal(budget: CategoryBudget | null, year: number): number | null {
  if (!budget) return null
  if (budget.mode === 'flat') return budget.monthly_amount !== null ? budget.monthly_amount * 12 : null
  if (budget.mode === 'variable') return budget.monthly_amounts ? budget.monthly_amounts.reduce((s, a) => s + a, 0) : null
  if (budget.mode === 'cadence') {
    if (!budget.cadence || !budget.reference_date || budget.amount_per_occurrence === null) return null
    return computeCadenceMonthlyAmounts(budget.cadence, budget.reference_date, budget.amount_per_occurrence, year).reduce((s, a) => s + a, 0)
  }
  return null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const CADENCES = [
  { value: 'weekly',     label: 'Weekly'     },
  { value: 'biweekly',  label: 'Biweekly'   },
  { value: 'monthly',   label: 'Monthly'    },
  { value: 'quarterly', label: 'Quarterly'  },
  { value: 'biannually',label: 'Biannually' },
  { value: 'annually',  label: 'Annually'   },
]

// ── Styles ────────────────────────────────────────────────────────────────────

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
}

const modal: React.CSSProperties = {
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  borderRadius: '12px', padding: '28px', width: '540px', maxWidth: '96vw',
  maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
}

const inp: React.CSSProperties = {
  fontFamily: 'inherit', fontSize: '14px', padding: '7px 10px', borderRadius: '7px',
  border: '1px solid var(--color-border)', background: 'var(--color-bg)',
  color: 'var(--color-text)', outline: 'none', width: '100%', boxSizing: 'border-box',
}

const lbl: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 500,
  color: 'var(--color-text-muted)', marginBottom: '5px', marginTop: '14px',
}

function btn(active: boolean): React.CSSProperties {
  return {
    fontFamily: 'inherit', fontSize: '13px', fontWeight: 500,
    padding: '5px 16px', borderRadius: '8px', cursor: 'pointer', border: '1px solid',
    background: active ? 'var(--color-primary-text)' : 'transparent',
    borderColor: active ? 'var(--color-primary-text)' : 'var(--color-border)',
    color: active ? '#fff' : 'var(--color-text-muted)',
  }
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface Props {
  category: Category
  existingBudget: CategoryBudget | null
  year: number
  onSave: () => void
  onClose: () => void
}

export default function SetBudgetModal({ category, existingBudget, year, onSave, onClose }: Props) {
  const { currencySymbol } = useSettings()
  const eb = existingBudget

  // ── Mode ─────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<'flat' | 'variable' | 'cadence'>(eb?.mode ?? 'flat')

  // ── Flat ──────────────────────────────────────────────────────────────────
  const [flatAmt, setFlatAmt] = useState(eb?.mode === 'flat' && eb.monthly_amount !== null ? String(eb.monthly_amount) : '')

  // ── Variable ──────────────────────────────────────────────────────────────
  const [monthAmts, setMonthAmts] = useState<string[]>(
    eb?.mode === 'variable' && eb.monthly_amounts
      ? eb.monthly_amounts.map(v => v > 0 ? String(v) : '')
      : new Array(12).fill('')
  )
  const [rolloverSrc, setRolloverSrc] = useState<'budget' | 'actuals'>(eb?.variable_rollover_source ?? 'actuals')
  const [pctStr, setPctStr] = useState('')
  const [fillLoading, setFillLoading] = useState(false)
  const [zeroConfirm, setZeroConfirm] = useState(false)

  // ── Cadence ───────────────────────────────────────────────────────────────
  const [cadence, setCadence] = useState(eb?.cadence ?? 'monthly')
  const [refDate, setRefDate] = useState(eb?.reference_date ?? '')
  const [occAmt, setOccAmt] = useState(eb?.amount_per_occurrence !== null && eb?.amount_per_occurrence !== undefined ? String(eb.amount_per_occurrence) : '')
  const [linkedRecId, setLinkedRecId] = useState<string | null>(eb?.linked_recurring_id ?? null)
  const [recurringEntries, setRecurringEntries] = useState<{ id: string; vendor: string; cadence: string }[]>([])
  const [linkLoading, setLinkLoading] = useState(false)

  // ── UI state ──────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const modeChanged = eb && eb.mode !== mode

  // ── Fetch recurring entries for this category ─────────────────────────────
  useEffect(() => {
    supabase.from('recurring_transactions').select('id, vendor, cadence').eq('category_id', category.id).then(({ data }) => {
      setRecurringEntries(data ?? [])
    })
  }, [category.id])

  // ── Cadence preview ───────────────────────────────────────────────────────
  const cadencePreview = useMemo(() => {
    const amt = parseFloat(occAmt)
    if (!refDate || !cadence || isNaN(amt) || amt <= 0) return null
    return computeCadenceMonthlyAmounts(cadence, refDate, amt, year)
  }, [cadence, refDate, occAmt, year])

  const cadenceAnnual = cadencePreview ? cadencePreview.reduce((s, a) => s + a, 0) : null

  // ── Variable totals ───────────────────────────────────────────────────────
  const variableAnnual = useMemo(
    () => monthAmts.reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [monthAmts]
  )

  // Reset zeroConfirm when amounts change
  useEffect(() => { setZeroConfirm(false) }, [monthAmts])

  // ── Fill from prior year actuals ──────────────────────────────────────────
  async function fillFromActuals() {
    setFillLoading(true)
    const now   = new Date()
    // Last 12 complete months ending last month
    const endDate   = new Date(now.getFullYear(), now.getMonth() - 1, 28)
    const startDate = new Date(endDate.getFullYear() - 1, endDate.getMonth() + 1, 1)
    const from = startDate.toISOString().slice(0, 10)
    const to   = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).toISOString().slice(0, 10)

    const { data } = await supabase
      .from('transactions')
      .select('date, amount')
      .eq('category_id', category.id)
      .gte('date', from)
      .lte('date', to)

    const totals = new Array(12).fill(0)
    for (const t of data ?? []) totals[new Date(t.date + 'T12:00:00').getMonth()] += t.amount

    setMonthAmts(totals.map(v => v > 0 ? v.toFixed(2) : ''))
    setFillLoading(false)
  }

  // ── Link to recurring entry ───────────────────────────────────────────────
  async function handleLinkEntry(id: string) {
    setLinkedRecId(id || null)
    if (!id) return
    const entry = recurringEntries.find(e => e.id === id)
    if (!entry) return
    setCadence(entry.cadence)
    setLinkLoading(true)
    const { data } = await supabase.from('transactions')
      .select('date, amount')
      .eq('vendor', entry.vendor)
      .eq('category_id', category.id)
      .order('date', { ascending: false })
      .limit(1)
    setLinkLoading(false)
    if (data && data.length > 0) {
      setRefDate(data[0].date)
      setOccAmt(String(data[0].amount))
    }
  }

  // ── Apply % ───────────────────────────────────────────────────────────────
  function applyPct() {
    const pct = parseFloat(pctStr)
    if (isNaN(pct)) return
    const factor = 1 + pct / 100
    setMonthAmts(prev => prev.map(v => {
      const n = parseFloat(v) || 0
      return n > 0 ? (n * factor).toFixed(2) : v
    }))
    setPctStr('')
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave(bypassZeroWarning = false) {
    setError('')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const record: Record<string, any> = { category_id: category.id, year, mode }

    if (mode === 'flat') {
      const n = parseFloat(flatAmt)
      if (!flatAmt || isNaN(n) || n < 0) { setError('Please enter a valid monthly amount.'); return }
      record.monthly_amount = n
      record.monthly_amounts = null
      record.variable_rollover_source = null
      record.cadence = null
      record.reference_date = null
      record.amount_per_occurrence = null
      record.linked_recurring_id = null
    } else if (mode === 'variable') {
      const amounts = monthAmts.map(v => parseFloat(v) || 0)
      const nonZero = amounts.filter(a => a > 0).length
      const zeros   = 12 - nonZero
      if (!bypassZeroWarning && nonZero > 6 && zeros > 0) {
        setZeroConfirm(true)
        return
      }
      record.monthly_amounts = amounts
      record.monthly_amount = null
      record.variable_rollover_source = rolloverSrc
      record.cadence = null
      record.reference_date = null
      record.amount_per_occurrence = null
      record.linked_recurring_id = null
    } else {
      if (!cadence || !refDate) { setError('Please enter a cadence and reference date.'); return }
      const n = parseFloat(occAmt)
      if (isNaN(n) || n <= 0) { setError('Please enter a valid amount per occurrence.'); return }
      record.cadence = cadence
      record.reference_date = refDate
      record.amount_per_occurrence = n
      record.linked_recurring_id = linkedRecId
      record.monthly_amount = null
      record.monthly_amounts = null
      record.variable_rollover_source = null
    }

    setSaving(true)
    const { error: err } = await supabase
      .from('category_budgets')
      .upsert(record, { onConflict: 'category_id,year' })
    setSaving(false)
    if (err) { setError(err.message); return }
    onSave()
  }

  function setMonth(i: number, val: string) {
    setMonthAmts(prev => { const n = [...prev]; n[i] = val; return n })
  }

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={modal}>
        {/* Title */}
        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '17px', fontWeight: 600, color: 'var(--color-text)', margin: '0 0 2px 0' }}>
            {category.name} Budget
          </p>
          <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{year}</span>
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
          {(['flat', 'variable', 'cadence'] as const).map(m => (
            <button key={m} style={btn(mode === m)} onClick={() => setMode(m)}>
              {m === 'flat' ? 'Flat' : m === 'variable' ? 'Variable' : 'Cadence-based'}
            </button>
          ))}
        </div>

        {/* Mode switch warning */}
        {modeChanged && (
          <div style={{ marginBottom: '14px', padding: '8px 12px', borderRadius: '8px', background: '#F59E0B18', border: '1px solid #F59E0B60', fontSize: '12px', color: '#B45309' }}>
            Switching modes will replace the existing budget settings when you save.
          </div>
        )}

        {/* ── Flat ─────────────────────────────────────────────────────────── */}
        {mode === 'flat' && (
          <div>
            <label style={lbl}>Monthly Amount</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>{currencySymbol}</span>
              <input style={{ ...inp, width: '140px' }} type="number" min="0" step="1"
                value={flatAmt} onChange={e => setFlatAmt(e.target.value)} autoFocus placeholder="0" />
              <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>/mo</span>
            </div>
            {flatAmt && parseFloat(flatAmt) > 0 && (
              <p style={{ margin: '10px 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>
                Annual total: <strong style={{ color: 'var(--color-text)' }}>
                  {currencySymbol}{(parseFloat(flatAmt) * 12).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </p>
            )}
          </div>
        )}

        {/* ── Variable ─────────────────────────────────────────────────────── */}
        {mode === 'variable' && (
          <div>
            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
              <button
                onClick={fillFromActuals}
                disabled={fillLoading}
                style={{ ...btn(false), fontSize: '12px', padding: '4px 12px' }}
              >
                {fillLoading ? 'Loading…' : 'Fill from prior year actuals'}
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Adjust:</span>
                <input
                  type="number" value={pctStr} onChange={e => setPctStr(e.target.value)}
                  placeholder="0"
                  style={{ ...inp, width: '60px', padding: '4px 6px', fontSize: '12px' }}
                  onKeyDown={e => e.key === 'Enter' && applyPct()}
                />
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>%</span>
                <button onClick={applyPct} style={{ ...btn(false), fontSize: '12px', padding: '4px 10px' }}>Apply to all</button>
              </div>
            </div>

            {/* 12-month grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
              {MONTHS.map((m, i) => (
                <div key={m}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '3px' }}>{m}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{currencySymbol}</span>
                    <input
                      type="number" min="0" step="1" value={monthAmts[i]}
                      onChange={e => setMonth(i, e.target.value)}
                      placeholder="0"
                      style={{ ...inp, padding: '5px 6px', fontSize: '13px' }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Annual total */}
            <p style={{ margin: '12px 0 0', fontSize: '13px', color: 'var(--color-text-muted)', textAlign: 'right' }}>
              Annual total: <strong style={{ color: 'var(--color-text)' }}>
                {currencySymbol}{variableAnnual.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
            </p>

            {/* Zero-month warning */}
            {zeroConfirm && (
              <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '8px', background: '#F59E0B18', border: '1px solid #F59E0B60', fontSize: '13px', color: '#B45309' }}>
                {monthAmts.filter(v => !parseFloat(v)).length} month{monthAmts.filter(v => !parseFloat(v)).length !== 1 ? 's are' : ' is'} $0 — is that intentional?
                <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                  <button onClick={() => setZeroConfirm(false)} style={{ ...btn(false), fontSize: '12px', padding: '3px 10px' }}>Review</button>
                  <button onClick={() => handleSave(true)} style={{ ...btn(true), fontSize: '12px', padding: '3px 10px' }}>Save anyway</button>
                </div>
              </div>
            )}

            {/* Rollover setting */}
            <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--color-border)' }}>
              <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-muted)', margin: '0 0 8px' }}>Year-over-year rollover</p>
              {(['actuals', 'budget'] as const).map(src => (
                <label key={src} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', cursor: 'pointer', fontSize: '13px', color: 'var(--color-text)' }}>
                  <input type="radio" name="rollover" checked={rolloverSrc === src} onChange={() => setRolloverSrc(src)} style={{ accentColor: 'var(--color-primary)' }} />
                  {src === 'actuals' ? 'Use prior year actuals as next year\'s baseline' : 'Copy this budget forward unchanged'}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* ── Cadence ──────────────────────────────────────────────────────── */}
        {mode === 'cadence' && (
          <div>
            {/* Recurring entry link */}
            {recurringEntries.length > 0 && (
              <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '8px', background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                <label style={{ ...lbl, marginTop: 0 }}>
                  Link to recurring entry <span style={{ fontWeight: 400 }}>(auto-fills fields below)</span>
                </label>
                <select
                  value={linkedRecId ?? ''}
                  onChange={e => handleLinkEntry(e.target.value)}
                  style={{ ...inp, cursor: 'pointer' }}
                >
                  <option value="">— Enter manually —</option>
                  {recurringEntries.map(e => (
                    <option key={e.id} value={e.id}>{e.vendor}</option>
                  ))}
                </select>
                {linkLoading && (
                  <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    Fetching latest transaction…
                  </p>
                )}
              </div>
            )}

            <label style={lbl}>Cadence</label>
            <select value={cadence} onChange={e => setCadence(e.target.value)}
              style={{ ...inp, cursor: 'pointer' }}>
              {CADENCES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>

            <label style={lbl}>Reference Date <span style={{ fontWeight: 400 }}>(most recent transaction date)</span></label>
            <input style={inp} type="date" value={refDate} onChange={e => setRefDate(e.target.value)} />

            <label style={lbl}>Amount per Occurrence</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>{currencySymbol}</span>
              <input style={{ ...inp, width: '140px' }} type="number" min="0" step="1"
                value={occAmt} onChange={e => setOccAmt(e.target.value)} placeholder="0" />
            </div>

            {/* Monthly preview */}
            {cadencePreview && (
              <div style={{ marginTop: '18px' }}>
                <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Projected monthly breakdown
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  {cadencePreview.map((amt, i) => (
                    <div key={i} style={{ textAlign: 'center', padding: '6px', borderRadius: '6px', background: amt > 0 ? 'var(--color-bg)' : 'transparent', border: '1px solid var(--color-border)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{MONTHS[i]}</div>
                      <div style={{ fontSize: '13px', fontWeight: 500, marginTop: '2px', color: amt > 0 ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
                        {amt > 0 ? `${currencySymbol}${Math.round(amt).toLocaleString()}` : '—'}
                      </div>
                    </div>
                  ))}
                </div>
                <p style={{ margin: '10px 0 0', fontSize: '13px', color: 'var(--color-text-muted)', textAlign: 'right' }}>
                  Annual total: <strong style={{ color: 'var(--color-text)' }}>
                    {currencySymbol}{cadenceAnnual!.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </p>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ marginTop: '12px', fontSize: '13px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(224,107,107,0.1)', color: 'var(--color-expense)', border: '1px solid var(--color-expense)' }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '24px' }}>
          <button style={{ ...btn(false), padding: '6px 16px' }} onClick={onClose}>Cancel</button>
          <button
            style={{ ...btn(true), padding: '6px 16px' }}
            onClick={() => handleSave()}
            disabled={saving || zeroConfirm}
          >
            {saving ? 'Saving…' : 'Save Budget'}
          </button>
        </div>
      </div>
    </div>
  )
}
