import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'

export type Currency = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'JPY'

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CAD: 'C$',
  AUD: 'A$',
  JPY: '¥',
}

export type TaxFilingStatus =
  | ''
  | 'single'
  | 'married_jointly'
  | 'married_separately'
  | 'head_of_household'
  | 'qualifying_surviving_spouse'

export interface AttainmentDisplay {
  mode: 'standard' | 'custom'
  colorUnder: string
  colorWarning: string
  leniencyPct: number
  colorOver: string
}

export const EXPENSE_BAR_DEFAULTS: AttainmentDisplay = {
  mode: 'standard',
  colorUnder:   '#22C55E',
  colorWarning: '#EAB308',
  leniencyPct:  10,
  colorOver:    '#EF4444',
}

export const SAVINGS_BAR_DEFAULTS: AttainmentDisplay = {
  mode: 'standard',
  colorUnder:   '#22C55E',
  colorWarning: '#F59E0B',
  leniencyPct:  10,
  colorOver:    '#10B981',
}

export interface AppSettings {
  displayName: string
  email: string
  age: string
  taxFilingStatus: TaxFilingStatus
  currency: Currency
  darkMode: boolean
  defaultLanding: 'dashboard' | 'transactions' | 'categories'
  defaultPeriod: 'week' | 'month' | 'year'
  expenseBarDisplay: AttainmentDisplay
  savingsBarDisplay: AttainmentDisplay
}

const DEFAULTS: AppSettings = {
  displayName: '',
  email: '',
  age: '',
  taxFilingStatus: '',
  currency: 'USD',
  darkMode: false,
  defaultLanding: 'dashboard',
  defaultPeriod: 'month',
  expenseBarDisplay: EXPENSE_BAR_DEFAULTS,
  savingsBarDisplay: SAVINGS_BAR_DEFAULTS,
}

const STORAGE_KEY = 'minance_settings'

interface SettingsContextValue {
  settings: AppSettings
  updateSettings: (partial: Partial<AppSettings>) => void
  currencySymbol: string
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULTS,
  updateSettings: () => {},
  currencySymbol: '$',
})

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? { ...DEFAULTS, ...JSON.parse(stored) } : DEFAULTS
    } catch {
      return DEFAULTS
    }
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.darkMode)
  }, [settings.darkMode])

  function updateSettings(partial: Partial<AppSettings>) {
    setSettings(prev => {
      const next = { ...prev, ...partial }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  return (
    <SettingsContext.Provider value={{
      settings,
      updateSettings,
      currencySymbol: CURRENCY_SYMBOLS[settings.currency],
    }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}
