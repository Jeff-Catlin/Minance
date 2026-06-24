import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useSettings } from '../context/SettingsContext'
import type { Category, Transaction } from '../types'

// ── Types ─────────────────────────────────────────────────────────────────────

type TrackingMode = 'annual_contribution' | 'balance_target' | 'one_time_target'

interface SavingsGoal {
  id: string
  name: string
  goal_type: string
  tracking_mode: TrackingMode
  target_amount: number
  year: number | null
  linked_category_id: string | null
  notes: string | null
  created_at: string
}

interface SavingsEntry {
  id: string
  goal_id: string
  date: string
  amount: number
  note: string | null
  created_at: string
}

// ── Goal type config ──────────────────────────────────────────────────────────

const GOAL_TYPES: Record<string, { label: string; color: string; defaultMode: TrackingMode }> = {
  roth_ira:        { label: 'Roth IRA',         color: '#8B5CF6', defaultMode: 'annual_contribution' },
  traditional_ira: { label: 'Traditional IRA',  color: '#6366F1', defaultMode: 'annual_contribution' },
  '401k':          { label: '401(k)',            color: '#0EA5E9', defaultMode: 'annual_contribution' },
  roth_401k:       { label: 'Roth 401(k)',       color: '#06B6D4', defaultMode: 'annual_contribution' },
  hsa_individual:  { label: 'HSA (Individual)', color: '#10B981', defaultMode: 'annual_contribution' },
  hsa_family:      { label: 'HSA (Family)',      color: '#059669', defaultMode: 'annual_contribution' },
  '529':           { label: '529 Plan',           color: '#F59E0B', defaultMode: 'annual_contribution' },
  emergency_fund:  { label: 'Emergency Fund',   color: '#EF4444', defaultMode: 'balance_target'      },
  vacation:        { label: 'Vacation Fund',     color: '#EC4899', defaultMode: 'one_time_target'     },
  custom:          { label: 'Custom',             color: '#6B7280', defaultMode: 'one_time_target'     },
}

const TRACKING_LABELS: Record<TrackingMode, string> = {
  annual_contribution: 'Annual Contribution',
  balance_target:      'Balance Target',
  one_time_target:     'One-Time Goal',
}

function getDefaultLimit(goalType: string, age: number | null): number | null {
  const n = age ?? 0
  switch (goalType) {
    case 'roth_ira':
    case 'traditional_ira':
      return n >= 50 ? 8600 : 7500
    case '401k':
    case 'roth_401k':
      if (n >= 60 && n <= 63) return 35750  // $24,500 + $11,250 super catch-up (SECURE 2.0)
      if (n >= 50)            return 32500  // $24,500 + $8,000 standard catch-up
      return 24500
    case 'hsa_individual':    return 4400
    case 'hsa_family':        return 8550
    default:                  return null
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAmount(n: number, sym: string) {
  return `${sym}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y}`
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// ── Progress calculation ──────────────────────────────────────────────────────

function calcProgress(
  goal: SavingsGoal,
  entriesByGoal: Map<string, SavingsEntry[]>,
  transactions: Transaction[],
): { total: number; fromEntries: number; fromCategory: number } {
  const entries = entriesByGoal.get(goal.id) ?? []

  let fromEntries = 0
  let fromCategory = 0

  if (goal.tracking_mode === 'annual_contribution' && goal.year) {
    const from = `${goal.year}-01-01`
    const to   = `${goal.year}-12-31`
    fromEntries  = entries.filter(e => e.date >= from && e.date <= to).reduce((s, e) => s + e.amount, 0)
    if (goal.linked_category_id) {
      fromCategory = transactions
        .filter(t => t.category_id === goal.linked_category_id && t.date >= from && t.date <= to)
        .reduce((s, t) => s + t.amount, 0)
    }
  } else {
    fromEntries  = entries.reduce((s, e) => s + e.amount, 0)
    if (goal.linked_category_id) {
      fromCategory = transactions
        .filter(t => t.category_id === goal.linked_category_id)
        .reduce((s, t) => s + t.amount, 0)
    }
  }

  return { total: fromEntries + fromCategory, fromEntries, fromCategory }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    padding: '20px 24px',
    marginBottom: '12px',
  } as React.CSSProperties,

  badge: (color: string) => ({
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '20px',
    background: `${color}18`,
    color,
    border: `1px solid ${color}40`,
    flexShrink: 0,
  }) as React.CSSProperties,

  btn: (variant: 'primary' | 'ghost' | 'small') => ({
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
    ...(variant === 'small' && {
      background: 'transparent',
      borderColor: 'var(--color-border)',
      color: 'var(--color-primary-text)',
      fontSize: '12px',
      padding: '3px 10px',
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

  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--color-text-muted)',
    marginBottom: '6px',
    marginTop: '16px',
  } as React.CSSProperties,

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
    width: '460px',
    maxWidth: '95vw',
    maxHeight: '90vh',
    overflowY: 'auto' as const,
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
  } as React.CSSProperties,
}

// ── Add Goal Modal ────────────────────────────────────────────────────────────

interface AddGoalModalProps {
  categories: Category[]
  userAge: number | null
  existingGoal?: SavingsGoal
  onSave: () => void
  onClose: () => void
}

function GoalModal({ categories, userAge, existingGoal, onSave, onClose }: AddGoalModalProps) {
  const isEdit = !!existingGoal
  const [goalType, setGoalType]     = useState(existingGoal?.goal_type ?? 'roth_ira')
  const [name, setName]             = useState(existingGoal?.name ?? GOAL_TYPES['roth_ira'].label)
  const [mode, setMode]             = useState<TrackingMode>(existingGoal?.tracking_mode ?? 'annual_contribution')
  const [target, setTarget]         = useState(existingGoal?.target_amount != null ? String(existingGoal.target_amount) : '')
  const [year, setYear]             = useState(existingGoal?.year != null ? String(existingGoal.year) : String(new Date().getFullYear()))
  const [linkedCat, setLinkedCat]   = useState(existingGoal?.linked_category_id ?? '')
  const [notes, setNotes]           = useState(existingGoal?.notes ?? '')
  const [error, setError]           = useState('')
  const [saving, setSaving]         = useState(false)

  function handleTypeChange(type: string) {
    setGoalType(type)
    const cfg = GOAL_TYPES[type]
    if (cfg) {
      setName(cfg.label)
      setMode(cfg.defaultMode)
      const limit = getDefaultLimit(type, userAge)
      if (limit) setTarget(String(limit))
      else if (cfg.defaultMode === 'annual_contribution') setTarget('')
    }
  }

  const parents = categories.filter(c => c.parent_id === null)
  const categoryOptions = parents.flatMap(p => [
    { id: p.id, label: p.name, indent: false },
    ...categories.filter(c => c.parent_id === p.id).map(c => ({ id: c.id, label: c.name, indent: true })),
  ])

  async function handleSave() {
    if (!name.trim())   { setError('Please enter a name.'); return }
    if (!target || isNaN(parseFloat(target)) || parseFloat(target) <= 0) {
      setError('Please enter a valid target amount.'); return
    }
    if (mode === 'annual_contribution' && (!year || isNaN(parseInt(year)))) {
      setError('Please enter a valid year.'); return
    }

    setSaving(true)
    const payload = {
      name: name.trim(),
      goal_type: goalType,
      tracking_mode: mode,
      target_amount: parseFloat(target),
      year: mode === 'annual_contribution' ? parseInt(year) : null,
      linked_category_id: linkedCat || null,
      notes: notes.trim() || null,
    }

    const { error: err } = isEdit
      ? await supabase.from('savings_goals').update(payload).eq('id', existingGoal!.id)
      : await supabase.from('savings_goals').insert(payload)

    setSaving(false)
    if (err) { setError(err.message); return }
    onSave()
  }

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={s.modal}>
        <p style={{ fontSize: '17px', fontWeight: 600, color: 'var(--color-text)', margin: '0 0 20px 0' }}>
          {isEdit ? 'Edit Goal' : 'Add Savings Goal'}
        </p>

        <label style={s.label}>Goal Type</label>
        <select style={s.select} value={goalType} onChange={e => handleTypeChange(e.target.value)}>
          {Object.entries(GOAL_TYPES).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>

        <label style={s.label}>Name</label>
        <input style={s.input} value={name} onChange={e => setName(e.target.value)} placeholder="Goal name" />

        <label style={s.label}>Tracking Mode</label>
        <select style={s.select} value={mode} onChange={e => setMode(e.target.value as TrackingMode)}>
          <option value="annual_contribution">Annual Contribution — track yearly contributions against a limit</option>
          <option value="balance_target">Balance Target — track total savings toward a balance goal</option>
          <option value="one_time_target">One-Time Goal — track progress toward a specific amount</option>
        </select>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <label style={s.label}>Target Amount</label>
            <input style={s.input} type="number" min="0" step="1" value={target}
              onChange={e => setTarget(e.target.value)} placeholder="0.00" />
            {getDefaultLimit(goalType, userAge) && (
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                2026 limit: ${getDefaultLimit(goalType, userAge)!.toLocaleString()}
                {userAge && (goalType === '401k' || goalType === 'roth_401k') && userAge >= 60 && userAge <= 63
                  ? ' (ages 60–63 super catch-up)'
                  : userAge && userAge >= 50
                    ? ' (catch-up)'
                    : ''}
              </div>
            )}
          </div>
          {mode === 'annual_contribution' && (
            <div style={{ width: '100px' }}>
              <label style={s.label}>Year</label>
              <input style={s.input} type="number" min="2000" max="2100" value={year}
                onChange={e => setYear(e.target.value)} />
            </div>
          )}
        </div>

        <label style={s.label}>Link to Category <span style={{ fontWeight: 400 }}>(optional)</span></label>
        <select style={s.select} value={linkedCat} onChange={e => setLinkedCat(e.target.value)}>
          <option value="">No linked category</option>
          {categoryOptions.map(opt => (
            <option key={opt.id} value={opt.id}>{opt.indent ? `  ${opt.label}` : opt.label}</option>
          ))}
        </select>
        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
          Transactions in this category will automatically count toward this goal.
        </div>

        <label style={s.label}>Notes <span style={{ fontWeight: 400 }}>(optional)</span></label>
        <input style={s.input} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes…" />

        {error && (
          <div style={{ marginTop: '12px', fontSize: '13px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(224,107,107,0.1)', color: 'var(--color-expense)', border: '1px solid var(--color-expense)' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button style={s.btn('ghost')} onClick={onClose}>Cancel</button>
          <button style={s.btn('primary')} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add goal'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add Entry Modal ───────────────────────────────────────────────────────────

interface AddEntryModalProps {
  goal: SavingsGoal
  onSave: () => void
  onClose: () => void
}

function AddEntryModal({ goal, onSave, onClose }: AddEntryModalProps) {
  const { currencySymbol } = useSettings()
  const [date, setDate]     = useState(todayISO())
  const [amount, setAmount] = useState('')
  const [note, setNote]     = useState('')
  const [error, setError]   = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!date)                           { setError('Please select a date.'); return }
    if (!amount || parseFloat(amount) <= 0) { setError('Please enter a valid amount.'); return }

    setSaving(true)
    const { error: err } = await supabase.from('savings_entries').insert({
      goal_id: goal.id,
      date,
      amount: parseFloat(amount),
      note: note.trim() || null,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    onSave()
  }

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ ...s.modal, width: '360px' }}>
        <p style={{ fontSize: '17px', fontWeight: 600, color: 'var(--color-text)', margin: '0 0 4px 0' }}>
          Add Contribution
        </p>
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: '0 0 20px 0' }}>
          {goal.name}
        </p>

        <label style={s.label}>Date</label>
        <input style={s.input} type="date" value={date} onChange={e => setDate(e.target.value)} />

        <label style={s.label}>Amount ({currencySymbol})</label>
        <input style={s.input} type="number" min="0.01" step="0.01" value={amount}
          onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus
          onKeyDown={e => e.key === 'Enter' && handleSave()} />

        <label style={s.label}>Note <span style={{ fontWeight: 400 }}>(optional)</span></label>
        <input style={s.input} value={note} onChange={e => setNote(e.target.value)}
          placeholder="e.g. Payroll deduction" />

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

export default function SavingsTab() {
  const { settings, currencySymbol } = useSettings()
  const userAge = settings.age ? parseInt(settings.age) : null

  const [goals, setGoals]           = useState<SavingsGoal[]>([])
  const [entries, setEntries]       = useState<SavingsEntry[]>([])
  const [transactions, setTxns]     = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading]       = useState(true)
  const [expanded, setExpanded]       = useState<Set<string>>(new Set())
  const [showAllGoals, setShowAllGoals] = useState<Set<string>>(new Set())

  const CONTRIBUTION_LIMIT = 10

  function toggleShowAll(goalId: string) {
    setShowAllGoals(prev => {
      const next = new Set(prev)
      next.has(goalId) ? next.delete(goalId) : next.add(goalId)
      return next
    })
  }
  const [addGoalOpen, setAddGoalOpen]     = useState(false)
  const [editGoal, setEditGoal]           = useState<SavingsGoal | null>(null)
  const [addEntryGoal, setAddEntryGoal]   = useState<SavingsGoal | null>(null)

  async function load() {
    const [{ data: g }, { data: e }, { data: t }, { data: c }] = await Promise.all([
      supabase.from('savings_goals').select('*').order('created_at'),
      supabase.from('savings_entries').select('*').order('date', { ascending: false }),
      supabase.from('transactions').select('*').order('date', { ascending: false }),
      supabase.from('categories').select('*').eq('is_archived', false),
    ])
    setGoals(g ?? [])
    setEntries(e ?? [])
    setTxns(t ?? [])
    setCategories(c ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const entriesByGoal = useMemo(() => {
    const m = new Map<string, SavingsEntry[]>()
    for (const e of entries) {
      if (!m.has(e.goal_id)) m.set(e.goal_id, [])
      m.get(e.goal_id)!.push(e)
    }
    return m
  }, [entries])

  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c.name])), [categories])

  async function deleteGoal(id: string) {
    await supabase.from('savings_goals').delete().eq('id', id)
    load()
  }

  async function deleteEntry(id: string) {
    await supabase.from('savings_entries').delete().eq('id', id)
    load()
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  if (loading) return <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>
          Savings Goals
        </h2>
        <button style={s.btn('primary')} onClick={() => setAddGoalOpen(true)}>+ Add Goal</button>
      </div>

      {/* Empty state */}
      {goals.length === 0 && (
        <div style={{ ...s.card, color: 'var(--color-text-muted)', fontSize: '14px' }}>
          No savings goals yet — add one to start tracking your progress.
        </div>
      )}

      {/* Goal cards */}
      {goals.map(goal => {
        const cfg = GOAL_TYPES[goal.goal_type] ?? GOAL_TYPES.custom
        const { total, fromEntries: fe, fromCategory: fc } = calcProgress(goal, entriesByGoal, transactions)
        const pct = goal.target_amount > 0 ? Math.min((total / goal.target_amount) * 100, 100) : 0
        const over = total > goal.target_amount
        const isOpen = expanded.has(goal.id)
        const goalEntries = entriesByGoal.get(goal.id) ?? []
        const linkedCatTxns = goal.linked_category_id
          ? transactions
              .filter(t => {
                if (t.category_id !== goal.linked_category_id) return false
                if (goal.tracking_mode === 'annual_contribution' && goal.year) {
                  return t.date >= `${goal.year}-01-01` && t.date <= `${goal.year}-12-31`
                }
                return true
              })
              .sort((a, b) => b.date.localeCompare(a.date))
          : []

        return (
          <div key={goal.id} style={s.card}>
            {/* Goal header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                  <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text)' }}>{goal.name}</span>
                  <span style={s.badge(cfg.color)}>{cfg.label}</span>
                  {goal.year && (
                    <span style={s.badge('var(--color-text-muted)')}>{goal.year}</span>
                  )}
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    {TRACKING_LABELS[goal.tracking_mode]}
                  </span>
                </div>
                {goal.linked_category_id && (
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                    Linked: {catMap.get(goal.linked_category_id) ?? 'Unknown category'}
                  </div>
                )}
                {goal.notes && (
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                    {goal.notes}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <button style={s.btn('small')} onClick={() => setAddEntryGoal(goal)}>+ Entry</button>
                <button style={s.btn('small')} onClick={() => setEditGoal(goal)}>Edit</button>
                <button
                  style={{ ...s.btn('small'), color: 'var(--color-expense)', borderColor: 'var(--color-expense)' }}
                  onClick={() => deleteGoal(goal.id)}
                >
                  Remove
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ marginTop: '12px' }}>
              <div style={{ height: '8px', background: 'var(--color-border)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: over ? 'var(--color-expense)' : cfg.color,
                  borderRadius: '4px',
                  transition: 'width 0.4s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                <span style={{ fontSize: '13px', color: 'var(--color-text)', fontWeight: 500 }}>
                  {formatAmount(total, currencySymbol)} saved
                </span>
                <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                  {pct.toFixed(1)}% of {formatAmount(goal.target_amount, currencySymbol)}
                  {over && <span style={{ color: 'var(--color-income)', marginLeft: '6px' }}>✓ Goal reached!</span>}
                </span>
              </div>
              {(fe > 0 || fc > 0) && (
                <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
                  {fe > 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      Manual: {formatAmount(fe, currencySymbol)}
                    </span>
                  )}
                  {fc > 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      Category: {formatAmount(fc, currencySymbol)}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Expand / collapse contributions */}
            {(() => {
              // Merge manual entries + linked transactions into one chronological list
              type ContribItem =
                | { kind: 'manual'; id: string; date: string; amount: number; note: string | null }
                | { kind: 'category'; id: string; date: string; amount: number; vendor: string }

              const allContribs: ContribItem[] = [
                ...goalEntries.map(e => ({ kind: 'manual' as const, id: e.id, date: e.date, amount: e.amount, note: e.note })),
                ...linkedCatTxns.map(t => ({ kind: 'category' as const, id: t.id, date: t.date, amount: t.amount, vendor: t.vendor })),
              ].sort((a, b) => b.date.localeCompare(a.date))

              const totalCount = allContribs.length
              const showingAll = showAllGoals.has(goal.id)
              const visible = showingAll ? allContribs : allContribs.slice(0, CONTRIBUTION_LIMIT)

              return (
                <>
                  <button
                    onClick={() => toggleExpand(goal.id)}
                    style={{ fontFamily: 'inherit', fontSize: '12px', color: 'var(--color-text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px 0 0' }}
                  >
                    {isOpen ? '▲ Hide contributions' : `▼ Show contributions (${totalCount})`}
                  </button>

                  {isOpen && (
                    <div style={{ marginTop: '8px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
                      {totalCount === 0 ? (
                        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: 0 }}>
                          No contributions yet — add a manual entry or link a category.
                        </p>
                      ) : (
                        <>
                          {visible.map(item => (
                            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', flexShrink: 0 }}>{formatDate(item.date)}</span>
                                {item.kind === 'manual' ? (
                                  <>
                                    <span style={{ fontSize: '11px', background: 'var(--color-border)', color: 'var(--color-text-muted)', borderRadius: '10px', padding: '1px 6px', flexShrink: 0 }}>Manual</span>
                                    {item.note && <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.note}</span>}
                                  </>
                                ) : (
                                  <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.vendor}</span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-income)', fontVariantNumeric: 'tabular-nums' }}>
                                  {formatAmount(item.amount, currencySymbol)}
                                </span>
                                {item.kind === 'manual' && (
                                  <button onClick={() => deleteEntry(item.id)} style={{ fontFamily: 'inherit', fontSize: '13px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: '0 2px', lineHeight: 1 }}>×</button>
                                )}
                              </div>
                            </div>
                          ))}

                          {totalCount > CONTRIBUTION_LIMIT && (
                            <button
                              onClick={() => toggleShowAll(goal.id)}
                              style={{ fontFamily: 'inherit', fontSize: '12px', color: 'var(--color-primary-text)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px 0 0' }}
                            >
                              {showingAll ? '▲ Show less' : `▼ Show all ${totalCount} contributions`}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )
      })}

      {/* Modals */}
      {addGoalOpen && (
        <GoalModal
          categories={categories}
          userAge={userAge}
          onSave={() => { setAddGoalOpen(false); load() }}
          onClose={() => setAddGoalOpen(false)}
        />
      )}
      {editGoal && (
        <GoalModal
          categories={categories}
          userAge={userAge}
          existingGoal={editGoal}
          onSave={() => { setEditGoal(null); load() }}
          onClose={() => setEditGoal(null)}
        />
      )}
      {addEntryGoal && (
        <AddEntryModal
          goal={addEntryGoal}
          onSave={() => { setAddEntryGoal(null); load() }}
          onClose={() => setAddEntryGoal(null)}
        />
      )}
    </div>
  )
}
