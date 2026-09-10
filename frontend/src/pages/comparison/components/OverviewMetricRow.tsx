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
    <div className="grid grid-cols-1 gap-3 py-5 first:pt-0 last:pb-0 md:grid-cols-[8rem_minmax(0,1fr)] md:gap-6">
      {/* Header: metric label + change badge */}
      <div className="flex items-center justify-between gap-3 md:block">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <div className={`flex items-center gap-1 font-mono text-xs font-medium tabular-nums md:mt-2 ${isGood ? 'text-app-green' : 'text-app-red'}`}>
          <ChangeIcon change={change} size="w-3 h-3" />
          <span>{change > 0 ? '+' : ''}{change.toFixed(1)}{isPercent ? ' pts' : '%'}</span>
        </div>
      </div>
      {/* Paired bars: A (faded) above B (solid), sharing one axis so the
          smaller period is never hidden behind the larger. */}
      <div className="min-w-0 space-y-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[5.5rem_minmax(0,1fr)_8rem]">
          <span className="text-xs text-muted-foreground">{labelA}</span>
          <div className="col-span-2 row-start-2 sm:col-span-1 sm:row-auto">
            <ProgressBar
              value={Math.abs(valueA)}
              max={maxValue}
              color={color}
              height={12}
              className="opacity-50"
              ariaLabel={`${label} ${labelA}: ${fmtVal(valueA)}`}
            />
          </div>
          <span className="text-right font-mono text-xs font-medium tabular-nums text-muted-foreground">{fmtVal(valueA)}</span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[5.5rem_minmax(0,1fr)_8rem]">
          <span className="text-xs text-muted-foreground">{labelB}</span>
          <div className="col-span-2 row-start-2 sm:col-span-1 sm:row-auto">
            <ProgressBar
              value={Math.abs(valueB)}
              max={maxValue}
              color={color}
              height={12}
              ariaLabel={`${label} ${labelB}: ${fmtVal(valueB)}`}
            />
          </div>
          <span className="text-right font-mono text-xs font-semibold tabular-nums text-foreground">{fmtVal(valueB)}</span>
        </div>
      </div>
    </div>
  )
}
