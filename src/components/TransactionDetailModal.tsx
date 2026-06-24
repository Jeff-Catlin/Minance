import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useSettings } from '../context/SettingsContext'
import type { Account, Transaction } from '../types'

interface TransactionDetailModalProps {
  transaction: Transaction & { categoryName?: string | null }
  account?: Account
  onEdit: () => void
  onDeleted: () => void
  onClose: () => void
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y}`
}

function formatAmount(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function TransactionDetailModal({ transaction: t, account, onEdit, onDeleted, onClose }: TransactionDetailModalProps) {
  const { currencySymbol } = useSettings()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onOut(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [menuOpen])

  const isCredit = (t.type === 'expense' && t.amount < 0) || (t.type === 'income' && t.amount >= 0)
  const amountColor = t.type === 'card_payment' ? 'var(--color-text-muted)' : isCredit ? 'var(--color-income)' : 'var(--color-expense)'
  const prefix = t.type === 'card_payment' ? '' : isCredit ? '+' : '−'
  const canDelete = t.source !== 'sync'

  async function handleDelete() {
    setDeleting(true)
    await supabase.from('transaction_splits').delete().eq('transaction_id', t.id)
    await supabase.from('transactions').delete().eq('id', t.id)
    setDeleting(false)
    onDeleted()
  }

  const row = (label: string, value: string | null | undefined) =>
    value ? (
      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', marginBottom: '3px' }}>
          {label}
        </div>
        <div style={{ fontSize: '14px', color: 'var(--color-text)' }}>{value}</div>
      </div>
    ) : null

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '14px', padding: '24px', width: '420px', maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text)', marginBottom: '3px' }}>
              {t.vendor}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              {formatDate(t.date)} · {t.type === 'card_payment' ? 'Card Payment' : t.type.charAt(0).toUpperCase() + t.type.slice(1)}
            </div>
          </div>

          {/* ⋮ menu */}
          <div style={{ position: 'relative' }} ref={menuRef}>
            <button
              onClick={() => setMenuOpen(o => !o)}
              style={{ fontFamily: 'inherit', fontSize: '18px', padding: '2px 8px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: '6px', cursor: 'pointer', color: 'var(--color-text-muted)', lineHeight: 1 }}
            >⋮</button>
            {menuOpen && (
              <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: '4px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 10, minWidth: '160px', overflow: 'hidden' }}>
                <button onClick={() => { setMenuOpen(false); onEdit() }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: '13px', fontFamily: 'inherit', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text)' }}>
                  Edit transaction
                </button>
                {canDelete && (
                  <button onClick={() => { setMenuOpen(false); setConfirmDelete(true) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: '13px', fontFamily: 'inherit', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-expense)' }}>
                    Delete transaction
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Amount */}
        <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--color-bg)', borderRadius: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', fontWeight: 700, color: amountColor, fontVariantNumeric: 'tabular-nums' }}>
            {prefix}{currencySymbol}{formatAmount(Math.abs(t.amount))}
          </div>
          {t.is_split && (
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Split transaction</div>
          )}
        </div>

        {/* Fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
          {row('Category', t.categoryName ?? (t.is_split ? 'Split — see transactions' : 'Uncategorized'))}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', marginBottom: '3px' }}>Account</div>
            {account ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: account.color ?? '#A8A29E', flexShrink: 0 }} />
                <span style={{ fontSize: '14px', color: 'var(--color-text)' }}>
                  {account.name}{account.last_four ? ` ••••${account.last_four}` : ''}
                </span>
              </div>
            ) : t.account ? (
              <div style={{ fontSize: '14px', color: 'var(--color-text)' }}>{t.account}</div>
            ) : (
              <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>—</div>
            )}
          </div>
        </div>
        {row('Description', t.description)}

        {/* Delete confirmation */}
        {confirmDelete && (
          <div style={{ marginTop: '4px', padding: '12px 14px', borderRadius: '8px', background: 'rgba(224,107,107,0.08)', border: '1px solid var(--color-expense)' }}>
            <p style={{ fontSize: '13px', color: 'var(--color-text)', margin: '0 0 10px 0' }}>
              Delete this transaction? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ fontFamily: 'inherit', fontSize: '12px', padding: '5px 14px', borderRadius: '6px', border: 'none', background: 'var(--color-expense)', color: '#fff', cursor: 'pointer', fontWeight: 500 }}
              >
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{ fontFamily: 'inherit', fontSize: '12px', padding: '5px 14px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
          <button
            onClick={onClose}
            style={{ fontFamily: 'inherit', fontSize: '13px', padding: '6px 20px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
