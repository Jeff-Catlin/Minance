import { useState } from 'react'
import TransactionList from './TransactionList'
import RecurringTransactions from './RecurringTransactions'

type SubTab = 'all' | 'recurring'

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'all', label: 'All Transactions' },
  { key: 'recurring', label: 'Recurring' },
]

export default function TransactionsScreen() {
  const [subTab, setSubTab] = useState<SubTab>('all')

  return (
    <div>
      <nav style={{
        display: 'flex',
        gap: '2px',
        borderBottom: '1px solid var(--color-border)',
        marginBottom: '24px',
      }}>
        {SUB_TABS.map(tab => {
          const active = subTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setSubTab(tab.key)}
              style={{
                fontFamily: 'inherit',
                fontSize: '13px',
                fontWeight: active ? 600 : 400,
                padding: '8px 14px',
                background: 'transparent',
                border: 'none',
                borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
                color: active ? 'var(--color-primary-text)' : 'var(--color-text-muted)',
                cursor: 'pointer',
                marginBottom: '-1px',
                transition: 'color 0.15s',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </nav>

      {subTab === 'all' && <TransactionList />}
      {subTab === 'recurring' && <RecurringTransactions />}
    </div>
  )
}
