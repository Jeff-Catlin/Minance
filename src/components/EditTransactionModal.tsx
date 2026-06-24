import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Account, Transaction } from '../types'

interface EditTransactionModalProps {
  transaction: Transaction
  onSave: () => void
  onClose: () => void
}

export default function EditTransactionModal({ transaction, onSave, onClose }: EditTransactionModalProps) {
  const [date, setDate]               = useState(transaction.date)
  const [vendor, setVendor]           = useState(transaction.vendor)
  const [description, setDescription] = useState(transaction.description ?? '')
  const [amount, setAmount]           = useState(String(transaction.amount))
  const [accountId, setAccountId]     = useState(transaction.account_id ?? '')
  const [accounts, setAccounts]       = useState<Account[]>([])

  useEffect(() => {
    supabase.from('accounts').select('*').eq('is_active', true).order('name')
      .then(({ data }) => setAccounts(data ?? []))
  }, [])
  const [error, setError]             = useState('')
  const [saving, setSaving]           = useState(false)

  async function handleSave() {
    if (!vendor.trim())                                                        { setError('Vendor is required.'); return }
    if (!date)                                                                 { setError('Date is required.'); return }
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) === 0)     { setError('Please enter a valid amount.'); return }

    setSaving(true)
    const { error: err } = await supabase.from('transactions').update({
      date,
      vendor: vendor.trim(),
      description: description.trim() || null,
      amount: parseFloat(amount),
      account_id: accountId || null,
    }).eq('id', transaction.id)
    setSaving(false)
    if (err) { setError(err.message); return }
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
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '28px', width: '400px', maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <p style={{ fontSize: '17px', fontWeight: 600, color: 'var(--color-text)', margin: '0 0 4px 0' }}>Edit Transaction</p>
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: '0 0 4px 0' }}>
          Changes to category and type are made directly in the table.
        </p>

        <label style={labelStyle}>Date</label>
        <input style={inputStyle} type="date" value={date} onChange={e => setDate(e.target.value)} />

        <label style={labelStyle}>Vendor</label>
        <input style={inputStyle} value={vendor} onChange={e => setVendor(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()} autoFocus />

        <label style={labelStyle}>Description <span style={{ fontWeight: 400 }}>(optional)</span></label>
        <input style={inputStyle} value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Add a description…" onKeyDown={e => e.key === 'Enter' && handleSave()} />

        <label style={labelStyle}>Amount</label>
        <input style={inputStyle} type="number" step="0.01" value={amount}
          onChange={e => setAmount(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} />
        {transaction.type === 'expense' && (
          <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
            Negative = refund/return · Positive = regular expense
          </p>
        )}

        <label style={labelStyle}>Account <span style={{ fontWeight: 400 }}>(optional)</span></label>
        <select style={{ ...inputStyle, cursor: 'pointer' }} value={accountId} onChange={e => setAccountId(e.target.value)}>
          <option value="">No account</option>
          {accounts.map(a => (
            <option key={a.id} value={a.id}>
              {a.name}{a.last_four ? ` ••••${a.last_four}` : ''}
            </option>
          ))}
        </select>
        {transaction.account && !accountId && (
          <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
            Imported as: {transaction.account}
          </p>
        )}

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
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
