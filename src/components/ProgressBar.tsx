import { useSettings, EXPENSE_BAR_DEFAULTS, SAVINGS_BAR_DEFAULTS } from '../context/SettingsContext'

// Bar geometry: zero marker at 5%, goal marker at 88%
const ZERO_PCT  = 5
const GOAL_PCT  = 88
const FILL_SPAN = GOAL_PCT - ZERO_PCT   // 83

const GOAL_MARKER_COLOR_EXPENSE = '#374151'
const GOAL_MARKER_COLOR_SAVINGS = '#F59E0B'
const NEGATIVE_FILL_EXPENSE     = 'var(--color-income)'  // credit = good
const NEGATIVE_FILL_SAVINGS     = 'var(--color-expense)' // withdrawal = bad

interface ProgressBarProps {
  value: number
  target: number | null
  type: 'expense' | 'savings'
  height?: number
  baseColor?: string  // goal-type brand color used in savings standard mode
}

export default function ProgressBar({ value, target, type, height = 6, baseColor }: ProgressBarProps) {
  const { settings } = useSettings()
  const cfg = type === 'expense'
    ? { ...EXPENSE_BAR_DEFAULTS, ...settings.expenseBarDisplay }
    : { ...SAVINGS_BAR_DEFAULTS, ...settings.savingsBarDisplay }

  const hasBudget = target !== null && target > 0
  if (!hasBudget) return null

  const normalized = value / target!
  const tipPct     = ZERO_PCT + normalized * FILL_SPAN
  const clampedTip = Math.max(0, Math.min(100, tipPct))

  // Single fill color — whole bar is one color, no split at goal marker
  function getFillColor(): string {
    if (normalized < 0) {
      return type === 'expense' ? NEGATIVE_FILL_EXPENSE : NEGATIVE_FILL_SAVINGS
    }
    if (cfg.mode === 'standard') {
      if (normalized <= 1) return baseColor ?? '#22C55E'
      return type === 'savings' ? '#10B981' : '#EF4444'
    }
    // custom mode
    if (normalized <= 1) return cfg.colorUnder
    const overPct = (normalized - 1) * 100
    const sorted  = [...(cfg.overStops ?? [])].sort((a, b) => a.threshold - b.threshold)
    let matched: string | null = null
    for (const stop of sorted) {
      if (overPct >= stop.threshold) matched = stop.color
    }
    return matched ?? cfg.colorUnder
  }

  const fillColor = getFillColor()

  // Fill runs from ZERO_PCT to clampedTip (positive) or clampedTip to ZERO_PCT (negative)
  const fillLeft  = normalized >= 0 ? ZERO_PCT : Math.max(0, clampedTip)
  const fillWidth = normalized >= 0
    ? Math.max(0, clampedTip - ZERO_PCT)
    : Math.max(0, ZERO_PCT - Math.max(0, clampedTip))

  const goalMarkerColor = type === 'savings' ? GOAL_MARKER_COLOR_SAVINGS : GOAL_MARKER_COLOR_EXPENSE

  const track: React.CSSProperties = {
    position: 'relative',
    height: `${height}px`,
    background: 'var(--color-border)',
    borderRadius: `${height}px`,
  }

  const fill: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: `${fillLeft}%`,
    width: `${fillWidth}%`,
    height: '100%',
    background: fillColor,
    borderRadius: `${height}px`,
  }

  const tick = (left: number, color: string, opacity: number): React.CSSProperties => ({
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
      {fillWidth > 0 && <div style={fill} />}
      {/* Zero marker */}
      <div style={tick(ZERO_PCT, 'var(--color-text-muted)', 0.35)} />
      {/* Goal marker */}
      <div style={tick(GOAL_PCT, goalMarkerColor, 0.75)} />
    </div>
  )
}
