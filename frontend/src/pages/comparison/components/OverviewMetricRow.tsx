import ProgressBar from '@/components/shared/ProgressBar'
import { formatCurrency } from '@/lib/formatters'
import { pctChange } from '../utils'
import { ChangeIcon } from './ChangeIcon'

interface OverviewMetricRowProps {
  label: string
  valueA: number
  valueB: number
  labelA: string
  labelB: string
  color: string
  maxValue: number
  invertChange?: boolean
  isPercent?: boolean
}

/**
 * One row per metric (Income / Expenses / Savings / Savings Rate).
 *
 * Renders the two periods as PAIRED bars -- two thin tracks stacked within
 * the row, both anchored to the same axis (`maxValue`). Period A is the
 * faded bar, period B the solid one. Paired (rather than overlaid) so the
 * smaller period is never occluded by the larger; both extents read at a
 * glance and the change badge names the direction. The %-row pins to a
 * 0-100 scale so the savings-rate bar fills proportionally to 100%.
 */
export function OverviewMetricRow({
  label, valueA, valueB, labelA, labelB,
  color, maxValue, invertChange, isPercent,
}: Readonly<OverviewMetricRowProps>) {
  const change = isPercent ? valueB - valueA : pctChange(valueB, valueA)
  const isPositive = change >= 0
  const isGood = invertChange ? !isPositive : isPositive
  const fmtVal = (v: number) => (isPercent ? `${v.toFixed(1)}%` : formatCurrency(v))

  return (
    <div className="space-y-2">
      {/* Header: metric label + change badge */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white">{label}</span>
        <div className={`flex items-center gap-1 text-xs font-medium ${isGood ? 'text-app-green' : 'text-app-red'}`}>
          <ChangeIcon change={change} size="w-3 h-3" />
          <span>{change > 0 ? '+' : ''}{change.toFixed(1)}{isPercent ? ' pts' : '%'}</span>
        </div>
      </div>
      {/* Paired bars: A (faded) above B (solid), sharing one axis so the
          smaller period is never hidden behind the larger. */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-3">
          <span className="text-caption text-text-tertiary w-20 truncate" title={labelA}>{labelA}</span>
          <div className="flex-1">
            <ProgressBar
              value={Math.abs(valueA)}
              max={maxValue}
              color={color}
              height={10}
              className="opacity-40"
              ariaLabel={`${label} ${labelA}: ${fmtVal(valueA)}`}
            />
          </div>
          <span className="text-caption font-medium text-text-secondary tabular-nums w-24 truncate text-right">{fmtVal(valueA)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-caption text-text-tertiary w-20 truncate" title={labelB}>{labelB}</span>
          <div className="flex-1">
            <ProgressBar
              value={Math.abs(valueB)}
              max={maxValue}
              color={color}
              height={10}
              ariaLabel={`${label} ${labelB}: ${fmtVal(valueB)}`}
            />
          </div>
          <span className="text-xs font-semibold text-white tabular-nums w-24 truncate text-right">{fmtVal(valueB)}</span>
        </div>
      </div>
    </div>
  )
}
