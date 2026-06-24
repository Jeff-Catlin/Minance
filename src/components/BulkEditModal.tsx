import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Account, Category } from '../types'

const NO_CHANGE = '__no_change__'
const CLEAR     = '__clear__'

interface BulkEditModalProps {
  selectedIds: string[]
  categories: Category[]
  accounts: Account[]
  onSave: () => void
  onClose: () => void
}

export default function BulkEditModal({ selectedIds, categories, accounts, onSave, onClose }: BulkEditModalProps) {
  const [vendor,      setVendor]      = useState('')
  const [description, setDescription] = useState('')
  const [categoryVal, setCategoryVal] = useState(NO_CHANGE)
  const [accountVal,  setAccountVal]  = useState(NO_CHANGE)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  const parents      = categories.filter(c => c.parent_id === null)
  const categoryOpts = parents.flatMap(p => [
    { id: p.id, label: p.name, indent: false },
    ...categories.filter(c => c.parent_id === p.id).map(c => ({ id: c.id, label: c.name, indent: true })),
  ])

  async function handleSave() {
    const payload: Record<string, unknown> = {}
    if (vendor.trim())                payload.vendor      = vendor.trim()
    if (description.trim())           payload.description = description.trim()
    if (categoryVal !== NO_CHANGE)    payload.category_id = categoryVal === CLEAR ? null : categoryVal
    if (accountVal  !== NO_CHANGE)    payload.account_id  = accountVal  === CLEAR ? null : accountVal

    if (Object.keys(payload).length === 0) {
      setError('No changes entered — fill in at least one field.')
      return
    }

    setSaving(true)
    // Supabase .update().in() handles multiple IDs in one request
    const BATCH = 200
    for (let i = 0; i < selectedIds.length; i += BATCH) {
      const { error: err } = await supabase
        .from('transactions')
        .update(payload)
        .in('id', selectedIds.slice(i, i + BATCH))
      if (err) { setError(err.message); setSaving(false); return }
    }
    setSaving(false)
    onSave()
  }

  const inputStyle: React.CSSProperties = {
    fontFamily: 'inherit', fontSize: '14px', padding: '8px 12px',
    borderRadius: '8px', border: '1px solid var(--color-border)',
    background: 'var(--color-bg)', color: 'var(--color-text)',
    outline: 'none', width: '100%', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '13px', fontWeight: 500,
    color: 'var(--color-text-muted)', marginBottom: '6px', marginTop: '16px',
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '28px', width: '460px', maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <p style={{ fontSize: '17px', fontWeight: 600, color: 'var(--color-text)', margin: '0 0 4px 0' }}>
          Bulk Edit
        </p>
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: '0 0 4px 0' }}>
          Editing {selectedIds.length} transaction{selectedIds.length !== 1 ? 's' : ''}. Leave a field blank or set to "No change" to skip it.
        </p>

        <label style={labelStyle}>Vendor <span style={{ fontWeight: 400 }}>(optional)</span></label>
        <input style={inputStyle} value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Leave blank to skip" />

        <label style={labelStyle}>Description <span style={{ fontWeight: 400 }}>(optional)</span></label>
        <input style={inputStyle} value={description} onChange={e => setDescription(e.target.value)} placeholder="Leave blank to skip" />

        <label style={labelStyle}>Category <span style={{ fontWeight: 400 }}>(optional)</span></label>
        <select style={{ ...inputStyle, cursor: 'pointer' }} value={categoryVal} onChange={e => setCategoryVal(e.target.value)}>
          <option value={NO_CHANGE}>— No change —</option>
          <option value={CLEAR}>Remove category (uncategorized)</option>
          {categoryOpts.map(opt => (
            <option key={opt.id} value={opt.id}>{opt.indent ? `  ${opt.label}` : opt.label}</option>
          ))}
        </select>

        <label style={labelStyle}>Account <span style={{ fontWeight: 400 }}>(optional)</span></label>
        <select style={{ ...inputStyle, cursor: 'pointer' }} value={accountVal} onChange={e => setAccountVal(e.target.value)}>
          <option value={NO_CHANGE}>— No change —</option>
          <option value={CLEAR}>Remove account</option>
          {accounts.filter(a => a.is_active).map(a => (
            <option key={a.id} value={a.id}>
              {a.name}{a.last_four ? ` ••••${a.last_four}` : ''}
            </option>
          ))}
        </select>

        {error && (
          <div style={{ marginTop: '12px', fontSize: '13px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(224,107,107,0.1)', color: 'var(--color-expense)', border: '1px solid var(--color-expense)' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button onClick={onClose} style={{ fontFamily: 'inherit', fontSize: '13px', padding: '6px 16px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} style={{ fontFamily: 'inherit', fontSize: '13px', padding: '6px 16px', borderRadius: '8px', border: 'none', background: 'var(--color-primary-text)', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>
            {saving ? 'Saving…' : `Apply to ${selectedIds.length} transaction${selectedIds.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
