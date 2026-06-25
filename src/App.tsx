import { useState } from 'react'
import { useSettings } from './context/SettingsContext'
import Dashboard from './components/Dashboard'
import TransactionsScreen from './components/TransactionsScreen'
import CategoryManager from './components/CategoryManager'
import SavingsTab from './components/SavingsTab'
import AccountsTab from './components/AccountsTab'
import SettingsPage from './components/SettingsPage'
import './App.css'

type Screen = 'dashboard' | 'transactions' | 'categories' | 'savings' | 'accounts' | 'settings'

const NAV_ITEMS: { key: Exclude<Screen, 'settings'>; label: string }[] = [
  { key: 'dashboard',    label: 'Dashboard' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'categories',   label: 'Categories' },
  { key: 'savings',      label: 'Savings' },
  { key: 'accounts',     label: 'Accounts' },
]

export default function App() {
  const { settings } = useSettings()
  const [screen, setScreen] = useState<Screen>(settings.defaultLanding)
  const [prevScreen, setPrevScreen] = useState<Exclude<Screen, 'settings'>>('dashboard')
  const [txFilter, setTxFilter] = useState<{ categoryId?: string; accountId?: string; from?: string; to?: string; type?: 'expense' | 'income' } | null>(null)
  const [txFilterKey, setTxFilterKey] = useState(0)
  const [txInitialSubTab, setTxInitialSubTab] = useState<'all' | 'uncategorized' | null>(null)

  function handleDrillDown(categoryId: string, from: string, to: string, type: 'expense' | 'income') {
    setTxFilter({ categoryId, from, to, type })
    setTxInitialSubTab('all')
    setTxFilterKey(k => k + 1)
    setScreen('transactions')
    setTimeout(() => { setTxFilter(null); setTxInitialSubTab(null) }, 100)
  }

  function handleAccountDrillDown(accountId: string) {
    setTxFilter({ accountId })
    setTxInitialSubTab('all')
    setTxFilterKey(k => k + 1)
    setScreen('transactions')
    setTimeout(() => { setTxFilter(null); setTxInitialSubTab(null) }, 100)
  }

  function handleUncatDrillDown() {
    setTxInitialSubTab('uncategorized')
    setTxFilterKey(k => k + 1)
    setScreen('transactions')
    setTimeout(() => setTxInitialSubTab(null), 100)
  }

  function openSettings() {
    if (screen !== 'settings') setPrevScreen(screen as Exclude<Screen, 'settings'>)
    setScreen('settings')
  }

  function closeSettings() {
    setScreen(prevScreen)
  }

  return (
    <div style={{ minHeight: '100vh', maxWidth: '1200px', margin: '0 auto', padding: '0 24px 48px' }}>

      {/* ── Top bar ── */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 0 0',
        marginBottom: '4px',
      }}>
        <h1
          onClick={() => setScreen(settings.defaultLanding)}
          style={{
            margin: 0, fontSize: '22px', fontWeight: 700,
            letterSpacing: '-0.5px', lineHeight: 1,
            cursor: 'pointer', userSelect: 'none',
          }}
        >
          <span style={{ color: 'var(--color-primary)' }}>Mi</span>
          <span style={{ color: 'var(--color-text)' }}>nance</span>
          {settings.displayName && (
            <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '10px' }}>
              {settings.displayName}
            </span>
          )}
        </h1>

        <button
          onClick={openSettings}
          aria-label="Open settings"
          title="Settings"
          style={{
            background: screen === 'settings' ? 'rgba(34,195,166,0.08)' : 'transparent',
            border: '1px solid',
            borderColor: screen === 'settings' ? 'var(--color-primary)' : 'var(--color-border)',
            borderRadius: '8px',
            color: screen === 'settings' ? 'var(--color-primary-text)' : 'var(--color-text-muted)',
            cursor: 'pointer',
            fontSize: '20px',
            fontFamily: 'inherit',
            padding: '2px 10px',
            lineHeight: 1,
          }}
        >
          ⚙
        </button>
      </header>

      {/* ── Nav tabs (hidden on settings screen) ── */}
      {screen !== 'settings' && (
        <nav style={{
          display: 'flex',
          gap: '2px',
          borderBottom: '1px solid var(--color-border)',
          marginBottom: '28px',
        }}>
          {NAV_ITEMS.map(item => {
            const active = screen === item.key
            return (
              <button
                key={item.key}
                onClick={() => setScreen(item.key)}
                style={{
                  fontFamily: 'inherit',
                  fontSize: '14px',
                  fontWeight: active ? 600 : 400,
                  padding: '10px 16px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
                  color: active ? 'var(--color-primary-text)' : 'var(--color-text-muted)',
                  cursor: 'pointer',
                  marginBottom: '-1px',
                  transition: 'color 0.15s',
                }}
              >
                {item.label}
              </button>
            )
          })}
        </nav>
      )}

      {/* ── Settings page header ── */}
      {screen === 'settings' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          borderBottom: '1px solid var(--color-border)',
          marginBottom: '28px',
          paddingBottom: '12px',
          marginTop: '12px',
        }}>
          <button
            onClick={closeSettings}
            style={{
              fontFamily: 'inherit',
              fontSize: '13px',
              padding: '5px 12px',
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              background: 'transparent',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
            }}
          >
            ← Back
          </button>
          <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text)' }}>Settings</span>
        </div>
      )}

      {/* ── Screen content ── */}
      <main>
        {screen === 'dashboard'    && <Dashboard onDrillDown={handleDrillDown} onUncatDrillDown={handleUncatDrillDown} />}
        {screen === 'transactions' && <TransactionsScreen initialFilter={txFilter} filterKey={txFilterKey} initialSubTab={txInitialSubTab ?? undefined} />}
        {screen === 'categories'   && <CategoryManager />}
        {screen === 'savings'      && <SavingsTab />}
        {screen === 'accounts'     && <AccountsTab onViewTransactions={handleAccountDrillDown} />}
        {screen === 'settings'     && <SettingsPage onBack={closeSettings} />}
      </main>
    </div>
  )
}
