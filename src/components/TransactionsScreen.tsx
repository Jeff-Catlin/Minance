import { useState } from 'react'
import TransactionList from './TransactionList'
import RecurringTransactions from './RecurringTransactions'
import UncategorizedTab from './UncategorizedTab'

type SubTab = 'all' | 'uncategorized' | 'recurring'

interface DrillDownFilter {
  categoryId: string
  from: string
  to: string
}

interface TransactionsScreenProps {
  initialFilter?: DrillDownFilter | null
  filterKey?: number
  initialSubTab?: SubTab
}

export default function TransactionsScreen({ initialFilter, filterKey = 0, initialSubTab }: TransactionsScreenProps) {
  const [subTab, setSubTab] = useState<SubTab>(initialSubTab ?? 'all')
  const [uncategorizedCount, setUncategorizedCount] = useState<number | null>(null)

  const SUB_TABS: { key: SubTab; label: () => string }[] = [
    { key: 'all', label: () => 'All Transactions' },
    {
      key: 'uncategorized',
      label: () => uncategorizedCount !== null && uncategorizedCount > 0
        ? `Uncategorized (${uncategorizedCount})`
        : 'Uncategorized',
    },
    { key: 'recurring', label: () => 'Recurring' },
  ]

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
          const isAlert = tab.key === 'uncategorized' && uncategorizedCount !== null && uncategorizedCount > 0
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
                color: active
                  ? 'var(--color-primary-text)'
                  : isAlert
                    ? 'var(--color-expense)'
                    : 'var(--color-text-muted)',
                cursor: 'pointer',
                marginBottom: '-1px',
                transition: 'color 0.15s',
              }}
            >
              {tab.label()}
            </button>
          )
        })}
      </nav>

      {subTab === 'all' && (
        <TransactionList key={filterKey} initialFilter={initialFilter} />
      )}
      {subTab === 'uncategorized' && (
        <UncategorizedTab onCountChange={setUncategorizedCount} />
      )}
      {subTab === 'recurring' && <RecurringTransactions />}
    </div>
  )
}
