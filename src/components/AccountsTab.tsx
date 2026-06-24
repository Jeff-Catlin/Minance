import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useSettings } from '../context/SettingsContext'
import RowMenu from './RowMenu'
import type { Account } from '../types'

// ── Constants ─────────────────────────────────────────────────────────────────

export const ACCOUNT_COLORS = [
  '#0E9F8E', '#6366F1', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#10B981', '#F97316',
  '#06B6D4', '#84CC16',
]

const ACCOUNT_TYPES = [
  { value: 'credit_card',  label: 'Credit Card' },
  { value: 'checking',     label: 'Checking' },
  { value: 'savings',      label: 'Savings' },
  { value: 'investment',   label: 'Investment / Brokerage' },
  { value: 'loan',         label: 'Loan / Mortgage' },
  { value: 'hsa',          label: 'HSA' },
  { value: 'other',        label: 'Other' },
]

const TYPE_LABELS: Record<string, string> = Object.fromEntries(ACCOUNT_TYPES.map(t => [t.value, t.label]))

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Styles ────────────────────────────────────────────────────────────────────

const sh = {
  input: {
    fontFamily: 'inherit', fontSize: '14px', padding: '8px 12px',
    borderRadius: '8px', border: '1px solid var(--color-border)',
    background: 'var(--color-bg)', color: 'var(--color-text)',
    outline: 'none', width: '100%', boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  label: {
    display: 'block', fontSize: '13px', fontWeight: 500,
    color: 'var(--color-text-muted)', marginBottom: '6px', marginTop: '16px',
  } as React.CSSProperties,
  btn: (variant: 'primary' | 'ghost' | 'small') => ({
    fontFamily: 'inherit', fontSize: '13px', fontWeight: 500,
    padding: '6px 16px', borderRadius: '8px', cursor: 'pointer', border: '1px solid',
    ...(variant === 'primary' && { background: 'var(--color-primary-text)', borderColor: 'var(--color-primary-text)', color: '#fff' }),
    ...(variant === 'ghost'   && { background: 'transparent', borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }),
    ...(variant === 'small'   && { background: 'transparent', borderColor: 'var(--color-border)', color: 'var(--color-primary-text)', fontSize: '12px', padding: '4px 12px' }),
  }) as React.CSSProperties,
}

// ── Account modal ─────────────────────────────────────────────────────────────

function AccountModal({ existing, onSave, onClose }: {
  existing?: Account
  onSave: () => void
  onClose: () => void
}) {
  const [name,        setName]        = useState(existing?.name ?? '')
  const [institution, setInstitution] = useState(existing?.institution ?? '')
  const [type,        setType]        = useState(existing?.type ?? 'credit_card')
  const [lastFour,    setLastFour]    = useState(existing?.last_four ?? '')
  const [color,       setColor]       = useState(existing?.color ?? ACCOUNT_COLORS[0])
  const [notes,       setNotes]       = useState(existing?.notes ?? '')
  const [error,       setError]       = useState('')
  const [saving,      setSaving]      = useState(false)

  async function handleSave() {
    if (!name.trim()) { setError('Account name is required.'); return }
    setSaving(true)
    const payload = {
      name: name.trim(),
      institution: institution.trim() || null,
      type,
      last_four: lastFour.replace(/\D/g, '').slice(-4) || null,
      color,
      notes: notes.trim() || null,
    }
    const { error: err } = existing
      ? await supabase.from('accounts').update(payload).eq('id', existing.id)
      : await supabase.from('accounts').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSave()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '28px', width: '460px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        <p style={{ fontSize: '17px', fontWeight: 600, color: 'var(--color-text)', margin: '0 0 4px 0' }}>
          {existing ? 'Edit Account' : 'Add Account'}
        </p>

        <label style={sh.label}>Account Name</label>
        <input style={sh.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Chase Sapphire Preferred" autoFocus />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={sh.label}>Institution</label>
            <input style={sh.input} value={institution} onChange={e => setInstitution(e.target.value)} placeholder="e.g. Chase" />
          </div>
          <div>
            <label style={sh.label}>Type</label>
            <select style={{ ...sh.input, cursor: 'pointer' }} value={type} onChange={e => setType(e.target.value)}>
              {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={sh.label}>Last Four Digits <span style={{ fontWeight: 400 }}>(optional)</span></label>
            <input style={sh.input} value={lastFour} onChange={e => setLastFour(e.target.value)} placeholder="4567" maxLength={4} />
          </div>
        </div>

        <label style={sh.label}>Color</label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {ACCOUNT_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: '28px', height: '28px', borderRadius: '50%', background: c,
                border: color === c ? '3px solid var(--color-text)' : '3px solid transparent',
                cursor: 'pointer', outline: 'none', transition: 'border 0.1s',
              }}
            />
          ))}
        </div>

        <label style={sh.label}>Notes <span style={{ fontWeight: 400 }}>(optional)</span></label>
        <input style={sh.input} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Main travel card" />

        {error && (
          <div style={{ marginTop: '12px', fontSize: '13px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(224,107,107,0.1)', color: 'var(--color-expense)', border: '1px solid var(--color-expense)' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button style={sh.btn('ghost')} onClick={onClose}>Cancel</button>
          <button style={sh.btn('primary')} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : existing ? 'Save changes' : 'Add account'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Account card ──────────────────────────────────────────────────────────────

function AccountCard({ account, balance, txCount, onEdit, onArchive, onViewTransactions }: {
  account: Account
  balance?: number
  txCount?: number
  onEdit: () => void
  onArchive: () => void
  onViewTransactions: () => void
}) {
  const { currencySymbol } = useSettings()
  const color = account.color ?? '#A8A29E'
  const hasBalance = balance !== undefined && txCount !== undefined && txCount > 0
  const balanceColor = !hasBalance ? 'var(--color-text)' : balance >= 0 ? 'var(--color-income)' : 'var(--color-expense)'

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
          <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: color, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {account.name}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              {[account.institution, TYPE_LABELS[account.type] ?? account.type, account.last_four ? `••••${account.last_four}` : null]
                .filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
        <RowMenu items={[
          { label: 'Edit', onClick: onEdit },
          { label: account.is_active ? 'Archive' : 'Restore', onClick: onArchive },
        ]} />
      </div>

      {/* Balance */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', marginBottom: '2px' }}>Balance</div>
        {hasBalance ? (
          <>
            <div style={{ fontSize: '20px', fontWeight: 700, color: balanceColor, fontVariantNumeric: 'tabular-nums' }}>
              {balance! < 0 ? '−' : ''}{currencySymbol}{Math.abs(balance!).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              From {txCount} imported transaction{txCount !== 1 ? 's' : ''}
            </div>
          </>
        ) : (
          <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
            No transactions linked yet
          </div>
        )}
      </div>

      {/* Notes */}
      {account.notes && (
        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>{account.notes}</div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--color-border)' }}>
        {!account.is_active && (
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', background: 'var(--color-border)', borderRadius: '10px', padding: '2px 8px' }}>Archived</span>
        )}
        <button
          onClick={onViewTransactions}
          style={{ ...sh.btn('small'), marginLeft: 'auto' }}
        >
          View transactions →
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface AccountsTabProps {
  onViewTransactions: (accountId: string) => void
}

export default function AccountsTab({ onViewTransactions }: AccountsTabProps) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [balanceMap, setBalanceMap] = useState<Map<string, number>>(new Map())
  const [txCounts, setTxCounts] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; existing?: Account }>({ open: false })
  const [showArchived, setShowArchived] = useState(false)

  async function load() {
    const [{ data: accts }, { data: txns }] = await Promise.all([
      supabase.from('accounts').select('*').order('created_at'),
      supabase.from('transactions').select('account_id, type, amount').not('account_id', 'is', null),
    ])
    setAccounts(accts ?? [])

    // Calculate balance per account from transactions
    // income adds to balance, expense reduces it (refunds stored negative so they add back)
    // card_payment is excluded (it's a transfer)
    const bMap = new Map<string, number>()
    const cMap = new Map<string, number>()
    for (const tx of txns ?? []) {
      if (!tx.account_id) continue
      cMap.set(tx.account_id, (cMap.get(tx.account_id) ?? 0) + 1)
      if (tx.type === 'income') {
        bMap.set(tx.account_id, (bMap.get(tx.account_id) ?? 0) + tx.amount)
      } else if (tx.type === 'expense') {
        bMap.set(tx.account_id, (bMap.get(tx.account_id) ?? 0) - tx.amount)
      }
    }
    setBalanceMap(bMap)
    setTxCounts(cMap)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleArchive(account: Account) {
    await supabase.from('accounts').update({ is_active: !account.is_active }).eq('id', account.id)
    load()
  }

  const visible = accounts.filter(a => showArchived || a.is_active)

  if (loading) return <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>Accounts</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {accounts.some(a => !a.is_active) && (
            <button
              onClick={() => setShowArchived(s => !s)}
              style={{ ...sh.btn('ghost'), fontSize: '12px', padding: '4px 12px' }}
            >
              {showArchived ? 'Hide archived' : 'Show archived'}
            </button>
          )}
          <button style={sh.btn('primary')} onClick={() => setModal({ open: true })}>
            + Add Account
          </button>
        </div>
      </div>

      {/* Empty state */}
      {visible.length === 0 && (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '48px 24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          No accounts yet — add your first card or bank account above.
        </div>
      )}

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
        {visible.map(account => (
          <AccountCard
            key={account.id}
            account={account}
            balance={balanceMap.get(account.id)}
            txCount={txCounts.get(account.id)}
            onEdit={() => setModal({ open: true, existing: account })}
            onArchive={() => handleArchive(account)}
            onViewTransactions={() => onViewTransactions(account.id)}
          />
        ))}
      </div>

      {/* Modal */}
      {modal.open && (
        <AccountModal
          existing={modal.existing}
          onSave={() => { setModal({ open: false }); load() }}
          onClose={() => setModal({ open: false })}
        />
      )}
    </div>
  )
}
