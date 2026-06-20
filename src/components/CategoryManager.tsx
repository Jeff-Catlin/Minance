import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Category } from '../types'

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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 0',
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

  // Dropdown menu
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

  // Modal
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
      <button
        style={s.btn('dots')}
        onClick={() => setOpen(o => !o)}
        aria-label="More options"
      >
        ⋮
      </button>
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

interface AddModalProps {
  title: string
  onSave: (name: string) => Promise<string | null>
  onClose: () => void
}

function AddModal({ title, onSave, onClose }: AddModalProps) {
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
    if (err) { setError(err) } else { onClose() }
  }

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={s.modal}>
        <p style={s.modalTitle}>{title}</p>
        <label style={s.modalLabel}>Name</label>
        <input
          ref={inputRef}
          style={s.input}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose() }}
          placeholder="e.g. Entertainment"
        />
        {error && <div style={s.notice('error')}>{error}</div>}
        <div style={s.modalActions}>
          <button style={s.btn('ghost')} onClick={onClose}>Cancel</button>
          <button style={s.btn('primary')} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Rename modal ──────────────────────────────────────────────────────────────

interface RenameModalProps {
  current: string
  onSave: (name: string) => Promise<string | null>
  onClose: () => void
}

function RenameModal({ current, onSave, onClose }: RenameModalProps) {
  const [name, setName] = useState(current)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) { setError('Please enter a name.'); return }
    setSaving(true)
    const err = await onSave(trimmed)
    setSaving(false)
    if (err) { setError(err) } else { onClose() }
  }

  return (
    <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={s.modal}>
        <p style={s.modalTitle}>Rename category</p>
        <label style={s.modalLabel}>Name</label>
        <input
          ref={inputRef}
          style={s.input}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose() }}
        />
        {error && <div style={s.notice('error')}>{error}</div>}
        <div style={s.modalActions}>
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

export default function CategoryManager() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  // Add modal: null = closed, '__top__' = new parent, or parent id = new subcategory
  const [addModalFor, setAddModalFor] = useState<string | null>(null)
  // Rename modal
  const [renamingCat, setRenamingCat] = useState<Category | null>(null)

  // Feedback messages per category id
  const [messages, setMessages] = useState<Record<string, { text: string; type: 'error' | 'info' }>>({})

  async function load() {
    const { data } = await supabase
      .from('categories')
      .select('*')
      .eq('is_archived', false)
      .order('created_at', { ascending: true })
    setCategories(data ?? [])
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
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', cat.id)
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
    ? categories.find(c => c.id === addModalFor)
    : null

  if (loading) return (
    <p style={{ color: 'var(--color-text-muted)' }}>Loading categories…</p>
  )

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h2 style={s.heading}>Categories</h2>
        <button style={s.btn('primary')} onClick={() => setAddModalFor('__top__')}>
          + Add Category
        </button>
      </div>

      {parents.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)' }}>
          Nothing here yet — add your first category above.
        </p>
      )}

      {parents.map(parent => {
        const children = subcategories.filter(c => c.parent_id === parent.id)
        return (
          <div key={parent.id} style={s.card}>
            {/* Card header */}
            <div style={s.cardHeader}>
              <p style={s.parentName}>{parent.name}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button style={s.btn('small')} onClick={() => setAddModalFor(parent.id)}>
                  + Add Subcategory
                </button>
                <DotsMenu items={[
                  { label: 'Rename', onClick: () => setRenamingCat(parent) },
                  { label: 'Archive', onClick: () => handleArchive(parent) },
                  { label: 'Delete', danger: true, onClick: () => handleDelete(parent) },
                ]} />
              </div>
            </div>

            {/* Parent message */}
            {messages[parent.id] && (
              <div style={s.notice(messages[parent.id].type)}>{messages[parent.id].text}</div>
            )}

            {/* Subcategories */}
            {children.length > 0 && (
              <ul style={s.subList}>
                {children.map(sub => (
                  <li key={sub.id} style={s.subItem}>
                    <span style={s.subName}>{sub.name}</span>
                    <DotsMenu items={[
                      { label: 'Rename', onClick: () => setRenamingCat(sub) },
                      { label: 'Archive', onClick: () => handleArchive(sub) },
                      { label: 'Delete', danger: true, onClick: () => handleDelete(sub) },
                    ]} />
                  </li>
                ))}
                {/* Subcategory messages */}
                {children.map(sub => messages[sub.id] && (
                  <li key={`msg-${sub.id}`}>
                    <div style={s.notice(messages[sub.id].type)}>{messages[sub.id].text}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}

      {/* Add modal */}
      {addModalFor && (
        <AddModal
          title={addModalParent ? `Add subcategory under "${addModalParent.name}"` : 'Add a parent category'}
          onSave={handleCreate}
          onClose={() => setAddModalFor(null)}
        />
      )}

      {/* Rename modal */}
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
