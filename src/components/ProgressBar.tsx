import { useSettings, EXPENSE_BAR_DEFAULTS, SAVINGS_BAR_DEFAULTS } from '../context/SettingsContext'

// Bar geometry: zero marker at 12%, goal marker at 88%, leaving 12% each side for under/overflow
const ZERO_PCT  = 12
const GOAL_PCT  = 88
const FILL_SPAN = GOAL_PCT - ZERO_PCT   // 76

const GOAL_MARKER_COLOR_EXPENSE = '#374151'   // dark charcoal
const GOAL_MARKER_COLOR_SAVINGS = '#F59E0B'   // gold
const NEGATIVE_FILL_EXPENSE     = 'var(--color-income)'   // credit on expense = good
const NEGATIVE_FILL_SAVINGS     = 'var(--color-expense)'  // withdrawal = bad

interface ProgressBarProps {
  value: number
  target: number | null
  type: 'expense' | 'savings'
  height?: number
  // For savings, each goal type has its own brand color for standard mode
  baseColor?: string
}

export default function ProgressBar({ value, target, type, height = 6, baseColor }: ProgressBarProps) {
  const { settings } = useSettings()
  const cfg = type === 'expense'
    ? { ...EXPENSE_BAR_DEFAULTS, ...settings.expenseBarDisplay }
    : { ...SAVINGS_BAR_DEFAULTS, ...settings.savingsBarDisplay }

  const hasBudget = target !== null && target > 0
  if (!hasBudget) return null

  const normalized = value / target!

  // Position of the "tip" of the bar along the track [0..100]
  const tipPct = ZERO_PCT + normalized * FILL_SPAN
  const clampedTip = Math.max(0, Math.min(100, tipPct))

  // For positive fills: main zone (0..target) and overflow (target..)
  const mainRight    = Math.min(clampedTip, GOAL_PCT)
  const mainWidth    = Math.max(0, mainRight - ZERO_PCT)
  const overflowWidth = normalized > 1 ? Math.min(clampedTip - GOAL_PCT, 100 - GOAL_PCT) : 0

  // For negative fills: extends left of the zero marker
  const negLeft  = clampedTip
  const negWidth = normalized < 0 ? ZERO_PCT - Math.max(0, clampedTip) : 0

  // Color selection
  const standardUnder = baseColor ?? (type === 'savings' ? '#22C55E' : '#22C55E')

  function pickFillColor(): string {
    if (cfg.mode === 'standard') return standardUnder
    return cfg.colorUnder
  }

  function pickOverflowColor(): string {
    if (cfg.mode === 'standard') {
      return type === 'savings' ? '#10B981' : '#EF4444'
    }
    const withinLeniency = normalized <= 1 + cfg.leniencyPct / 100
    return withinLeniency ? cfg.colorWarning : cfg.colorOver
  }

  const negFillColor = type === 'expense' ? NEGATIVE_FILL_EXPENSE : NEGATIVE_FILL_SAVINGS
  const goalMarkerColor = type === 'savings' ? GOAL_MARKER_COLOR_SAVINGS : GOAL_MARKER_COLOR_EXPENSE

  const track: React.CSSProperties = {
    position: 'relative',
    height: `${height}px`,
    background: 'var(--color-border)',
    borderRadius: `${height}px`,
  }

  const seg = (left: number, width: number, color: string, radius = height): React.CSSProperties => ({
    position: 'absolute',
    top: 0,
    left: `${left}%`,
    width: `${width}%`,
    height: '100%',
    background: color,
    borderRadius: `${radius}px`,
  })

  const tick = (left: number, color: string, opacity = 1): React.CSSProperties => ({
    position: 'absolute',
    top: '-1px',
    bottom: '-1px',
    left: `${left}%`,
    width: '2px',
    background: color,
    opacity,
    borderRadius: '1px',
    transform: 'translateX(-50%)',
    zIndex: 2,
  })

  return (
    <div style={track}>
      {/* Negative fill (left of zero) */}
      {negWidth > 0 && <div style={seg(negLeft, negWidth, negFillColor)} />}

      {/* Normal fill (zero → goal) */}
      {mainWidth > 0 && <div style={seg(ZERO_PCT, mainWidth, pickFillColor())} />}

      {/* Overflow fill (past goal marker) */}
      {overflowWidth > 0 && <div style={seg(GOAL_PCT, overflowWidth, pickOverflowColor())} />}

      {/* Zero marker */}
      <div style={tick(ZERO_PCT, 'var(--color-text-muted)', 0.35)} />

      {/* Goal marker */}
      <div style={tick(GOAL_PCT, goalMarkerColor, 0.75)} />
    </div>
  )
}
