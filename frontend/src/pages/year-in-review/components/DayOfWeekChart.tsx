import { useMemo } from 'react'

import { motion } from 'motion/react'

import ChartEmptyState from '@/components/shared/ChartEmptyState'
import StandardBarChart from '@/components/analytics/StandardBarChart'
import { rawColors } from '@/constants/colors'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'

import { computeDayOfWeekAverages } from '../dayOfWeekUtils'

export interface DayCell {
  date: string
  expense: number
  income: number
  net: number
  dayOfWeek: number
  weekIndex: number
  month: number
  isToday: boolean
  hasTx: boolean
}

export interface DayOfWeekChartProps {
  grid: DayCell[]
}

/**
 * Year-in-Review's spending-by-day-of-week chart.
 *
 * A grouped 7-day bar (Sun→Sat) with avg Spending and avg Earning side by
 * side. Bars compare magnitudes far more accurately than a radar -- and the
 * two series are different currencies (spend vs earn), which a radar's shared
 * area encoding would misrepresent. The insights row below calls out the
 * highest-spending day and weekend-vs-weekday delta as the plain takeaway.
 */
export default function DayOfWeekChart({ grid }: Readonly<DayOfWeekChartProps>) {
  const { data, insights } = useMemo(() => computeDayOfWeekAverages(grid), [grid])

  const hasData = grid.some((c) => c.hasTx)
  if (!hasData) return <ChartEmptyState height={260} />

  return (
    <div className="space-y-5">
      <StandardBarChart
        data={data}
        dataKey="day"
        height={300}
        bars={[
          { key: 'spending', color: rawColors.app.red, label: 'Avg Spending' },
          { key: 'earning', color: rawColors.app.green, label: 'Avg Earning' },
        ]}
        tooltipFormatter={(v) => formatCurrency(v)}
        yTickFormatter={(v) => formatCurrencyShort(v as number)}
        ariaLabel="Grouped bar chart of average spending and earning by day of the week, Sunday through Saturday"
      />

      {insights && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 gap-4 border-t border-border pt-4 min-[440px]:grid-cols-2"
        >
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              Biggest Day
            </p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              <span className="text-app-red">{insights.topDay}</span>
              <span className="font-mono text-xs font-normal tabular-nums text-muted-foreground"> · {formatCurrencyShort(insights.topAmount)}/day</span>
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              Weekend vs Weekday
            </p>
            <p className="mt-2 font-mono text-sm font-semibold tabular-nums text-foreground">
              {insights.weekendDelta >= 0 ? '+' : ''}
              {(insights.weekendDelta * 100).toFixed(0)}%
              <span className="font-sans text-xs font-normal text-muted-foreground"> on weekends</span>
            </p>
          </div>
        </motion.div>
      )}
    </div>
  )
}
