import { useState, useEffect } from 'react'
import Dashboard from './components/Dashboard'
import TransactionList from './components/TransactionList'
import ImportScreen from './components/ImportScreen'
import CategoryManager from './components/CategoryManager'
import './App.css'

type Screen = 'dashboard' | 'transactions' | 'categories'

const NAV_ITEMS: { key: Screen; label: string }[] = [
  { key: 'dashboard',    label: 'Dashboard' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'categories',   label: 'Categories' },
]

// ── Settings panel ────────────────────────────────────────────────────────────

function SettingsPanel({ onClose }: { onClose: () => void }) {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          zIndex: 200,
        }}
      />

      {/* Slide-in drawer */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '560px',
        maxWidth: '95vw',
        background: 'var(--color-bg)',
        borderLeft: '1px solid var(--color-border)',
        zIndex: 201,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
      }}>
        {/* Drawer header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '17px', fontWeight: 600, color: 'var(--color-text)' }}>
            Settings
          </span>
          <button
            onClick={onClose}
            aria-label="Close settings"
            style={{
              background: 'transparent',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              fontSize: '16px',
              fontFamily: 'inherit',
              padding: '3px 10px',
              lineHeight: 1.4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Drawer content — scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          <ImportScreen />
        </div>
      </div>
    </>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const [dark, setDark] = useState(false)
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  return (
    <div style={{ minHeight: '100vh', maxWidth: '900px', margin: '0 auto', padding: '0 24px 48px' }}>

      {/* ── Top bar ── */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 0 0',
        marginBottom: '4px',
      }}>
        {/* Wordmark */}
        <h1
          onClick={() => setScreen('dashboard')}
          style={{
            margin: 0,
            fontSize: '22px',
            fontWeight: 700,
            letterSpacing: '-0.5px',
            lineHeight: 1,
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <span style={{ color: 'var(--color-primary)' }}>Mi</span>
          <span style={{ color: 'var(--color-text)' }}>nance</span>
        </h1>

        {/* Right-side controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setDark(d => !d)}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              background: 'transparent',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              fontSize: '13px',
              fontFamily: 'inherit',
              padding: '5px 12px',
            }}
          >
            {dark ? '☀ Light' : '☾ Dark'}
          </button>

          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="Open settings"
            title="Settings"
            style={{
              background: 'transparent',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              fontSize: '20px',
              fontFamily: 'inherit',
              padding: '2px 10px',
              lineHeight: 1,
            }}
          >
            ⚙
          </button>
        </div>
      </header>

      {/* ── Nav tabs ── */}
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

      {/* ── Screen content ── */}
      <main>
        {screen === 'dashboard'    && <Dashboard />}
        {screen === 'transactions' && <TransactionList />}
        {screen === 'categories'   && <CategoryManager />}
      </main>

      {/* ── Settings drawer ── */}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

export default App
