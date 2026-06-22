import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Category } from '../types'

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

// ── Budget input ──────────────────────────────────────────────────────────────

function BudgetInput({ category, onSave }: { category: Category; onSave: (id: string, val: number | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(category.monthly_budget !== null ? String(category.monthly_budget) : '')

  useEffect(() => {
    if (!editing) setValue(category.monthly_budget !== null ? String(category.monthly_budget) : '')
  }, [category.monthly_budget, editing])

  async function commit() {
    setEditing(false)
    const trimmed = value.trim()
    const num = trimmed === '' ? null : parseFloat(trimmed)
    if (num !== null && (isNaN(num) || num < 0)) {
      setValue(category.monthly_budget !== null ? String(category.monthly_budget) : '')
      return
    }
    if (num === category.monthly_budget) return
    await onSave(category.id, num)
  }

  if (editing) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
        $
        <input
          autoFocus
          type="number"
          min="0"
          step="1"
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') { setValue(category.monthly_budget !== null ? String(category.monthly_budget) : ''); setEditing(false) }
          }}
          style={{ width: '76px', fontSize: '12px', border: '1px solid var(--color-primary)', borderRadius: '4px', padding: '2px 5px', background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none', fontFamily: 'inherit' }}
        />
        /mo
      </span>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', padding: 0, color: category.monthly_budget !== null ? 'var(--color-primary-text)' : 'var(--color-text-muted)' }}
    >
      {category.monthly_budget !== null ? `$${formatAmount(category.monthly_budget)}/mo` : '+ Set budget'}
    </button>
  )
}

// ── Budget bar ────────────────────────────────────────────────────────────────

function BudgetBar({ spent, budget, isIncome }: { spent: number; budget: number | null; isIncome: boolean }) {
  const hasBudget = budget !== null && budget > 0
  const pct = hasBudget ? Math.min((spent / budget!) * 100, 100) : 0
  const over = hasBudget && (isIncome ? spent < budget! : spent > budget!)
  const fill = hasBudget ? (over ? 'var(--color-expense)' : 'var(--color-income)') : 'var(--color-border)'
  const diff = hasBudget ? Math.abs(budget! - spent) : null

  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ height: '5px', background: 'var(--color-border)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: fill, borderRadius: '3px', transition: 'width 0.3s' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
          ${formatAmount(spent)} spent this month
        </span>
        {hasBudget && diff !== null ? (
          <span style={{ fontSize: '11px', fontWeight: 500, color: over ? 'var(--color-expense)' : 'var(--color-income)' }}>
            {isIncome
              ? over ? `$${formatAmount(diff)} below target` : `$${formatAmount(diff)} above target`
              : over ? `$${formatAmount(diff)} over budget` : `$${formatAmount(diff)} remaining`}
          </span>
        ) : (
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>No budget set</span>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CategoryManager() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [spendMap, setSpendMap] = useState<Map<string, number>>(new Map())
  const [typeMap, setTypeMap] = useState<Map<string, 'expense' | 'income'>>(new Map())
  const [addModalFor, setAddModalFor] = useState<string | null>(null)
  const [renamingCat, setRenamingCat] = useState<Category | null>(null)
  const [messages, setMessages] = useState<Record<string, { text: string; type: 'error' | 'info' }>>({})

  async function load() {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    const from = `${y}-${String(m + 1).padStart(2, '0')}-01`
    const to = `${y}-${String(m + 1).padStart(2, '0')}-${String(new Date(y, m + 1, 0).getDate()).padStart(2, '0')}`

    const [{ data: cats }, { data: txns }] = await Promise.all([
      supabase.from('categories').select('*').eq('is_archived', false).order('name', { ascending: true }),
      supabase.from('transactions').select('*').gte('date', from).lte('date', to),
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
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function setMessage(id: string, text: string, type: 'error' | 'info') {
    setMessages(m => ({ ...m, [id]: { text, type } }))
    setTimeout(() => setMessages(m => { const n = { ...m }; delete n[id]; return n }), 4000)
  }

  // ── Budget ────────────────────────────────────────────────────────────────

  async function handleSetBudget(id: string, value: number | null) {
    await supabase.from('categories').update({ monthly_budget: value }).eq('id', id)
    setCategories(prev => prev.map(c => c.id === id ? { ...c, monthly_budget: value } : c))
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
        <h2 style={s.heading}>Categories</h2>
        <button style={s.btn('primary')} onClick={() => setAddModalFor('__top__')}>+ Add Category</button>
      </div>

      {parents.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)' }}>Nothing here yet — add your first category above.</p>
      )}

      {parents.map(parent => {
        const children = subcategories.filter(c => c.parent_id === parent.id)
        const hasChildren = children.length > 0

        // Rolled-up spend and budget for this parent
        const parentSpend = (spendMap.get(parent.id) ?? 0) + children.reduce((s, c) => s + (spendMap.get(c.id) ?? 0), 0)
        const parentBudget = hasChildren
          ? (children.some(c => c.monthly_budget !== null) ? children.reduce((s, c) => s + (c.monthly_budget ?? 0), 0) : null)
          : parent.monthly_budget
        const isIncome = typeMap.get(parent.id) === 'income' || children.some(c => typeMap.get(c.id) === 'income')

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
                  return (
                    <li key={sub.id} style={s.subItem}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={s.subName}>{sub.name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <BudgetInput category={sub} onSave={handleSetBudget} />
                          <DotsMenu items={[
                            { label: 'Rename', onClick: () => setRenamingCat(sub) },
                            { label: 'Archive', onClick: () => handleArchive(sub) },
                            { label: 'Delete', danger: true, onClick: () => handleDelete(sub) },
                          ]} />
                        </div>
                      </div>
                      <BudgetBar spent={subSpend} budget={sub.monthly_budget} isIncome={subIsIncome} />
                      {messages[sub.id] && <div style={s.notice(messages[sub.id].type)}>{messages[sub.id].text}</div>}
                    </li>
                  )
                })}
              </ul>
            )}

            {/* Budget section — editable on parent if no children, rolled-up if has children */}
            <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {hasChildren ? 'Total This Month' : 'Monthly Budget'}
                </span>
                {!hasChildren && <BudgetInput category={parent} onSave={handleSetBudget} />}
                {hasChildren && parentBudget !== null && (
                  <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    ${formatAmount(parentBudget)}/mo combined
                  </span>
                )}
              </div>
              <BudgetBar spent={parentSpend} budget={parentBudget} isIncome={isIncome} />
            </div>
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
    </div>
  )
}
