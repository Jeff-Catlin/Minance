import { useState } from 'react'
import { useSettings, CURRENCY_SYMBOLS, EXPENSE_BAR_DEFAULTS, SAVINGS_BAR_DEFAULTS } from '../context/SettingsContext'
import type { Currency, AppSettings, TaxFilingStatus, AttainmentDisplay } from '../context/SettingsContext'
import { supabase } from '../lib/supabase'
import {
  exportCategoriesCSV, exportTransactionsCSV,
  printCategoriesPDF, printTransactionsPDF,
} from '../lib/export'
import ImportScreen from './ImportScreen'
import type { Category, Transaction, TransactionSplit } from '../types'

type Section = 'profile' | 'preferences' | 'data' | 'accounts' | 'notifications' | 'security'

const NAV: { key: Section; label: string; soon?: boolean }[] = [
  { key: 'profile',       label: 'Profile' },
  { key: 'preferences',   label: 'Preferences' },
  { key: 'data',          label: 'Data & Privacy' },
  { key: 'accounts',      label: 'Accounts',      soon: true },
  { key: 'notifications', label: 'Notifications', soon: true },
  { key: 'security',      label: 'Security',      soon: true },
]

// ── Shared styles ─────────────────────────────────────────────────────────────

const sh = {
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--color-text-muted)',
    marginBottom: '6px',
    marginTop: '20px',
  } as React.CSSProperties,

  input: {
    fontFamily: 'inherit',
    fontSize: '14px',
    padding: '9px 12px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,

  select: {
    fontFamily: 'inherit',
    fontSize: '14px',
    padding: '9px 12px',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    width: '100%',
    cursor: 'pointer',
  } as React.CSSProperties,

  btn: (variant: 'primary' | 'ghost' | 'export') => ({
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 500,
    padding: '8px 18px',
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
    ...(variant === 'export' && {
      background: 'transparent',
      borderColor: 'var(--color-border)',
      color: 'var(--color-text)',
      fontSize: '12px',
      padding: '6px 14px',
    }),
  }) as React.CSSProperties,

  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 0',
    borderBottom: '1px solid var(--color-border)',
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: 'var(--color-text)',
    margin: '0 0 4px 0',
  } as React.CSSProperties,

  sectionSub: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    margin: '0 0 24px 0',
  } as React.CSSProperties,

  divider: {
    borderTop: '1px solid var(--color-border)',
    margin: '24px 0',
  } as React.CSSProperties,
}

// ── Profile ───────────────────────────────────────────────────────────────────

function ProfileSection() {
  const { settings, updateSettings } = useSettings()
  const [form, setForm] = useState({
    displayName: settings.displayName,
    email: settings.email,
    age: settings.age,
    taxFilingStatus: settings.taxFilingStatus,
    currency: settings.currency,
  })
  const [saved, setSaved] = useState(false)

  function handleSave() {
    updateSettings(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <h2 style={sh.sectionTitle}>Profile</h2>
      <p style={sh.sectionSub}>Your personal details. Used to personalize your experience in future updates.</p>

      <label style={sh.label}>Display Name</label>
      <input style={sh.input} value={form.displayName} placeholder="e.g. Jeff"
        onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />

      <label style={sh.label}>Email</label>
      <input style={sh.input} type="email" value={form.email} placeholder="you@example.com"
        onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />

      <label style={sh.label}>Age</label>
      <input style={{ ...sh.input, maxWidth: '120px' }} type="number" min="1" max="120"
        value={form.age} placeholder="—"
        onChange={e => setForm(f => ({ ...f, age: e.target.value }))} />

      <label style={sh.label}>Tax Filing Status</label>
      <select style={{ ...sh.select, maxWidth: '280px' }} value={form.taxFilingStatus}
        onChange={e => setForm(f => ({ ...f, taxFilingStatus: e.target.value as TaxFilingStatus }))}>
        <option value="">Prefer not to say</option>
        <option value="single">Single</option>
        <option value="married_jointly">Married Filing Jointly</option>
        <option value="married_separately">Married Filing Separately</option>
        <option value="head_of_household">Head of Household</option>
        <option value="qualifying_surviving_spouse">Qualifying Surviving Spouse</option>
      </select>

      <label style={sh.label}>Currency</label>
      <select style={{ ...sh.select, maxWidth: '240px' }} value={form.currency}
        onChange={e => setForm(f => ({ ...f, currency: e.target.value as Currency }))}>
        {(Object.entries(CURRENCY_SYMBOLS) as [Currency, string][]).map(([code, sym]) => (
          <option key={code} value={code}>{sym} — {code}</option>
        ))}
      </select>

      <div style={{ marginTop: '28px' }}>
        <button style={sh.btn('primary')} onClick={handleSave}>
          {saved ? '✓ Saved' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

// ── Preferences ───────────────────────────────────────────────────────────────

const COLOR_PALETTE = [
  { label: 'Green',    value: '#22C55E' },
  { label: 'Emerald',  value: '#10B981' },
  { label: 'Teal',     value: '#14B8A6' },
  { label: 'Cyan',     value: '#06B6D4' },
  { label: 'Blue',     value: '#3B82F6' },
  { label: 'Indigo',   value: '#6366F1' },
  { label: 'Violet',   value: '#8B5CF6' },
  { label: 'Purple',   value: '#A855F7' },
  { label: 'Fuchsia',  value: '#D946EF' },
  { label: 'Pink',     value: '#EC4899' },
  { label: 'Rose',     value: '#F43F5E' },
  { label: 'Red',      value: '#EF4444' },
  { label: 'Orange',   value: '#F97316' },
  { label: 'Amber',    value: '#F59E0B' },
  { label: 'Yellow',   value: '#EAB308' },
  { label: 'Lime',     value: '#84CC16' },
  { label: 'Gray',     value: '#6B7280' },
  { label: 'Slate',    value: '#64748B' },
]

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
      {COLOR_PALETTE.map(c => (
        <button
          key={c.value}
          title={c.label}
          onClick={() => onChange(c.value)}
          style={{
            width: '22px', height: '22px', borderRadius: '50%',
            background: c.value, border: 'none', cursor: 'pointer', padding: 0,
            outline: value === c.value ? `3px solid ${c.value}` : '2px solid transparent',
            outlineOffset: '2px',
            boxShadow: value === c.value ? '0 0 0 1px var(--color-surface)' : 'none',
            transition: 'outline 0.1s',
          }}
        />
      ))}
    </div>
  )
}

function AttainmentSection({
  title,
  description,
  cfg,
  defaults,
  labels,
  onChange,
}: {
  title: string
  description: string
  cfg: AttainmentDisplay
  defaults: AttainmentDisplay
  labels: { under: string; warning: string; over: string }
  onChange: (next: AttainmentDisplay) => void
}) {
  const up = (partial: Partial<AttainmentDisplay>) => onChange({ ...cfg, ...partial })

  return (
    <div style={{ marginTop: '20px', padding: '16px', border: '1px solid var(--color-border)', borderRadius: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>{title}</div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{description}</div>
        </div>
        <select
          value={cfg.mode}
          onChange={e => up({ mode: e.target.value as AttainmentDisplay['mode'] })}
          style={{ ...sh.select, width: 'auto', minWidth: '120px', fontSize: '13px' }}
        >
          <option value="standard">Standard</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      {cfg.mode === 'custom' && (
        <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-muted)' }}>{labels.under}</div>
            <ColorPicker value={cfg.colorUnder} onChange={v => up({ colorUnder: v })} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-muted)' }}>{labels.warning}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>within</span>
                <input
                  type="number"
                  min={1} max={99}
                  value={cfg.leniencyPct}
                  onChange={e => up({ leniencyPct: Math.max(1, Math.min(99, Number(e.target.value))) })}
                  style={{ width: '54px', fontSize: '13px', padding: '3px 6px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'inherit', textAlign: 'center' }}
                />
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>%</span>
              </div>
            </div>
            <ColorPicker value={cfg.colorWarning} onChange={v => up({ colorWarning: v })} />
          </div>

          <div>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-muted)' }}>{labels.over}</div>
            <ColorPicker value={cfg.colorOver} onChange={v => up({ colorOver: v })} />
          </div>

          <button
            onClick={() => onChange(defaults)}
            style={{ ...sh.btn('export'), fontSize: '12px', alignSelf: 'flex-start', marginTop: '2px' }}
          >
            Reset to defaults
          </button>
        </div>
      )}
    </div>
  )
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: '44px', height: '24px', borderRadius: '12px', border: 'none',
        background: on ? 'var(--color-primary-text)' : 'var(--color-border)',
        cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s',
      }}
    >
      <span style={{
        position: 'absolute', top: '3px',
        left: on ? '23px' : '3px',
        width: '18px', height: '18px', borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
      }} />
    </button>
  )
}

function PreferencesSection() {
  const { settings, updateSettings } = useSettings()

  return (
    <div>
      <h2 style={sh.sectionTitle}>Preferences</h2>
      <p style={sh.sectionSub}>Customize how Minance looks and behaves.</p>

      {/* Dark mode */}
      <div style={sh.row}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text)' }}>Dark mode</div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Switch between light and dark appearance</div>
        </div>
        <Toggle on={settings.darkMode} onToggle={() => updateSettings({ darkMode: !settings.darkMode })} />
      </div>

      {/* Default landing */}
      <div style={sh.row}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text)' }}>Default landing page</div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Which screen opens when you launch the app</div>
        </div>
        <select
          style={{ ...sh.select, width: 'auto', minWidth: '160px' }}
          value={settings.defaultLanding}
          onChange={e => updateSettings({ defaultLanding: e.target.value as AppSettings['defaultLanding'] })}
        >
          <option value="dashboard">Dashboard</option>
          <option value="transactions">Transactions</option>
          <option value="categories">Categories</option>
        </select>
      </div>

      {/* Default period */}
      <div style={sh.row}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text)' }}>Default dashboard period</div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Time range shown when you open the Dashboard</div>
        </div>
        <select
          style={{ ...sh.select, width: 'auto', minWidth: '160px' }}
          value={settings.defaultPeriod}
          onChange={e => updateSettings({ defaultPeriod: e.target.value as AppSettings['defaultPeriod'] })}
        >
          <option value="week">This week</option>
          <option value="month">This month</option>
          <option value="year">This year</option>
        </select>
      </div>

      {/* Attainment display */}
      <div style={{ paddingTop: '14px', borderBottom: 'none' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>Attainment Display</div>
        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
          Control how budget and savings goal progress bars are colored.
          Standard uses green/red. Custom lets you set colors and a leniency buffer.
        </div>

        <AttainmentSection
          title="Expense Bars"
          description="Color scheme for category budget progress bars"
          cfg={{ ...EXPENSE_BAR_DEFAULTS, ...settings.expenseBarDisplay }}
          defaults={EXPENSE_BAR_DEFAULTS}
          labels={{ under: 'Under budget', warning: 'Over budget warning zone', over: 'Over threshold' }}
          onChange={next => updateSettings({ expenseBarDisplay: next })}
        />

        <AttainmentSection
          title="Savings Bars"
          description="Color scheme for savings goal progress bars"
          cfg={{ ...SAVINGS_BAR_DEFAULTS, ...settings.savingsBarDisplay }}
          defaults={SAVINGS_BAR_DEFAULTS}
          labels={{ under: 'In progress (under goal)', warning: 'Near goal / slightly over', over: 'Goal achieved / well over' }}
          onChange={next => updateSettings({ savingsBarDisplay: next })}
        />
      </div>
    </div>
  )
}

// ── Data & Privacy ────────────────────────────────────────────────────────────

function ExportRow({ label, description, onCSV, onPDF, loading }: {
  label: string
  description: string
  onCSV: () => void
  onPDF: () => void
  loading: boolean
}) {
  return (
    <div style={{ ...sh.row, alignItems: 'flex-start', paddingTop: '16px', paddingBottom: '16px' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text)' }}>{label}</div>
        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{description}</div>
      </div>
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0, marginLeft: '16px' }}>
        <button style={sh.btn('export')} onClick={onCSV} disabled={loading}>CSV</button>
        <button style={sh.btn('export')} onClick={onPDF} disabled={loading}>PDF</button>
      </div>
    </div>
  )
}

function DataPrivacySection() {
  const { currencySymbol } = useSettings()
  const [loading, setLoading] = useState(false)

  async function fetchAll() {
    setLoading(true)
    const [{ data: cats }, { data: txns }, { data: splits }] = await Promise.all([
      supabase.from('categories').select('*').eq('is_archived', false),
      supabase.from('transactions').select('*').order('date', { ascending: false }),
      supabase.from('transaction_splits').select('*'),
    ])
    setLoading(false)
    return {
      categories: (cats ?? []) as Category[],
      transactions: (txns ?? []) as Transaction[],
      splits: (splits ?? []) as TransactionSplit[],
    }
  }

  return (
    <div>
      <h2 style={sh.sectionTitle}>Data & Privacy</h2>
      <p style={sh.sectionSub}>Import your transaction data or export a copy of your records.</p>

      {/* Import */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '12px' }}>
          Import Transactions
        </div>
        <ImportScreen />
      </div>

      <div style={sh.divider} />

      {/* Exports */}
      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '4px' }}>
        Export Data
      </div>
      <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', margin: '0 0 8px 0' }}>
        CSV downloads instantly. PDF opens a print preview — choose "Save as PDF" in your browser's print dialog.
      </p>

      <ExportRow
        label="Categories"
        description="All parent and subcategories with monthly budget amounts"
        loading={loading}
        onCSV={async () => {
          const { categories } = await fetchAll()
          exportCategoriesCSV(categories)
        }}
        onPDF={async () => {
          const { categories } = await fetchAll()
          printCategoriesPDF(categories)
        }}
      />
      <ExportRow
        label="All Transactions"
        description="Complete transaction history including split line detail"
        loading={loading}
        onCSV={async () => {
          const d = await fetchAll()
          exportTransactionsCSV(d.transactions, d.splits, d.categories)
        }}
        onPDF={async () => {
          const d = await fetchAll()
          printTransactionsPDF(d.transactions, d.splits, d.categories, currencySymbol)
        }}
      />
    </div>
  )
}

// ── Coming soon ───────────────────────────────────────────────────────────────

const COMING_SOON: Record<string, { title: string; description: string; items: string[] }> = {
  accounts: {
    title: 'Accounts',
    description: 'Connect your bank accounts and credit cards to automatically sync transactions.',
    items: ['Link credit cards and bank accounts', 'Automatic transaction import', 'Multi-account dashboard view'],
  },
  notifications: {
    title: 'Notifications',
    description: 'Stay on top of your finances with smart alerts and reminders.',
    items: ['Large transaction alerts', 'Budget limit warnings', 'Recurring charge reminders', 'Email and push notifications'],
  },
  security: {
    title: 'Security',
    description: 'Manage your account security and authentication settings.',
    items: ['Change password', 'Two-factor authentication', 'Active sessions', 'Login history'],
  },
}

function ComingSoonSection({ section }: { section: string }) {
  const info = COMING_SOON[section]
  if (!info) return null
  return (
    <div>
      <h2 style={sh.sectionTitle}>{info.title}</h2>
      <p style={sh.sectionSub}>{info.description}</p>
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: '12px',
        padding: '24px',
      }}>
        <div style={{
          display: 'inline-block',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          background: 'rgba(250,204,21,0.15)',
          color: '#92400E',
          border: '1px solid rgba(250,204,21,0.4)',
          borderRadius: '20px',
          padding: '3px 10px',
          marginBottom: '16px',
        }}>
          Coming soon
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {info.items.map(item => (
            <li key={item} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: 'var(--color-text-muted)' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-border)', flexShrink: 0 }} />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsPage({ onBack: _onBack }: { onBack: () => void }) {
  const [section, setSection] = useState<Section>('profile')

  return (
    <div style={{ display: 'flex', gap: '0', minHeight: '600px' }}>
      {/* Sidebar */}
      <div style={{
        width: '200px',
        flexShrink: 0,
        borderRight: '1px solid var(--color-border)',
        paddingRight: '0',
        paddingTop: '4px',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ flex: 1 }}>
          {NAV.map((item, i) => {
            const active = section === item.key
            const isFirstSoon = item.soon && !NAV[i - 1]?.soon
            return (
              <div key={item.key}>
                {isFirstSoon && <div style={{ height: '1px', background: 'var(--color-border)', margin: '8px 16px 8px 0' }} />}
                <button
                  onClick={() => setSection(item.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    textAlign: 'left',
                    padding: '9px 16px 9px 0',
                    background: 'transparent',
                    border: 'none',
                    borderRight: active ? '2px solid var(--color-primary-text)' : '2px solid transparent',
                    fontFamily: 'inherit',
                    fontSize: '14px',
                    fontWeight: active ? 600 : 400,
                    color: active ? 'var(--color-primary-text)' : item.soon ? 'var(--color-text-muted)' : 'var(--color-text)',
                    cursor: 'pointer',
                    marginRight: '-1px',
                  }}
                >
                  {item.label}
                  {item.soon && (
                    <span style={{ fontSize: '10px', color: '#92400E', background: 'rgba(250,204,21,0.2)', border: '1px solid rgba(250,204,21,0.35)', borderRadius: '10px', padding: '1px 6px', fontWeight: 600 }}>
                      Soon
                    </span>
                  )}
                </button>
              </div>
            )
          })}
        </div>

        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px', marginTop: '12px' }}>
          <button
            onClick={() => supabase.auth.signOut()}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '9px 16px 9px 0',
              background: 'transparent',
              border: 'none',
              borderRight: '2px solid transparent',
              fontFamily: 'inherit',
              fontSize: '14px',
              color: 'var(--color-expense)',
              cursor: 'pointer',
              marginRight: '-1px',
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingLeft: '40px', maxWidth: section === 'data' ? 'none' : '580px' }}>
        {section === 'profile'       && <ProfileSection />}
        {section === 'preferences'   && <PreferencesSection />}
        {section === 'data'          && <DataPrivacySection />}
        {section === 'accounts'      && <ComingSoonSection section="accounts" />}
        {section === 'notifications' && <ComingSoonSection section="notifications" />}
        {section === 'security'      && <ComingSoonSection section="security" />}
      </div>
    </div>
  )
}
