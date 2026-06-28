import { useMemo } from 'react'

import { motion } from 'framer-motion'

import ChartEmptyState from '@/components/shared/ChartEmptyState'
import StandardBarChart from '@/components/analytics/StandardBarChart'
import { rawColors } from '@/constants/colors'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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
  const { data, insights } = useMemo(() => {
    const totals: Record<number, { expense: number; income: number; count: number }> = {}
    for (let i = 0; i < 7; i++) totals[i] = { expense: 0, income: 0, count: 0 }

    for (const cell of grid) {
      totals[cell.dayOfWeek].expense += cell.expense
      totals[cell.dayOfWeek].income += cell.income
      totals[cell.dayOfWeek].count++
    }

    const series = DAYS.map((d, i) => ({
      day: d,
      spending: totals[i].count > 0 ? totals[i].expense / totals[i].count : 0,
      earning: totals[i].count > 0 ? totals[i].income / totals[i].count : 0,
      dayIndex: i,
    }))

    // Insights -- compute once for the strip below the chart.
    const sortedBySpend = [...series].sort((a, b) => b.spending - a.spending)
    const top = sortedBySpend[0]
    const bottom = sortedBySpend.at(-1)
    const weekendSpend = (series[0].spending + series[6].spending) / 2 // Sun + Sat
    const weekdaySpend =
      series.slice(1, 6).reduce((sum, d) => sum + d.spending, 0) / 5 // Mon-Fri

    return {
      data: series,
      insights:
        top && top.spending > 0
          ? {
              topDay: top.day,
              topAmount: top.spending,
              bottomDay: bottom?.day,
              weekendDelta:
                weekdaySpend > 0
                  ? (weekendSpend - weekdaySpend) / weekdaySpend
                  : 0,
            }
          : null,
    }
  }, [grid])

  const hasData = grid.some((c) => c.hasTx)
  if (!hasData) return <ChartEmptyState height={260} />

  return (
    <div className="space-y-3">
      <StandardBarChart
        data={data}
        dataKey="day"
        height={260}
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
          className="grid grid-cols-2 gap-3"
        >
          <div className="px-3 py-2 rounded-lg bg-app-red/10 border border-app-red/20">
            <p className="text-[10px] uppercase tracking-widest text-text-quaternary font-semibold">
              Biggest Day
            </p>
            <p className="text-sm font-semibold text-foreground mt-0.5">
              <span className="text-app-red">{insights.topDay}</span>
              <span className="text-text-tertiary text-xs font-normal"> · {formatCurrencyShort(insights.topAmount)}/day</span>
            </p>
          </div>
          <div className="px-3 py-2 rounded-lg bg-[var(--overlay-2)] border border-border">
            <p className="text-[10px] uppercase tracking-widest text-text-quaternary font-semibold">
              Weekend vs Weekday
            </p>
            <p className="text-sm font-semibold text-foreground mt-0.5">
              {insights.weekendDelta >= 0 ? '+' : ''}
              {(insights.weekendDelta * 100).toFixed(0)}%
              <span className="text-text-tertiary text-xs font-normal"> on weekends</span>
            </p>
          </div>
        </motion.div>
      )}
    </div>
  )
}
