import { useMemo } from 'react'

import { motion } from 'framer-motion'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  Tooltip,
} from 'recharts'

import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { ChartContainer, chartTooltipProps, shouldAnimate } from '@/components/ui'
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
 * Uses a radar polar chart instead of a flat bar chart -- it wraps Sun→Sat
 * into a closed loop which makes the weekly spending pattern visually
 * obvious (e.g. weekend-heavy spenders show a clear lobe over Fri/Sat/Sun).
 * Spending and earning overlay each other so the user can spot mismatches
 * at a glance.
 *
 * Insights row below the chart calls out the highest-spending day and
 * weekend-vs-weekday ratio so users get a clear takeaway without having
 * to hover.
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
    const bottom = sortedBySpend[sortedBySpend.length - 1]
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
              bottomDay: bottom.day,
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

  const animate = shouldAnimate(7)

  return (
    <div className="space-y-3">
      <ChartContainer height={260}>
        <RadarChart data={data} outerRadius="78%">
          <PolarGrid stroke="rgba(255,255,255,0.08)" />
          <PolarAngleAxis
            dataKey="day"
            tick={{ fill: rawColors.text.secondary, fontSize: 12, fontWeight: 500 }}
          />
          <PolarRadiusAxis
            angle={90}
            tick={{ fill: rawColors.text.tertiary, fontSize: 10 }}
            tickFormatter={(v: number) => formatCurrencyShort(v)}
            axisLine={false}
          />
          <Tooltip
            {...chartTooltipProps}
            formatter={(value: number | undefined, name: string | undefined) =>
              [
                value === undefined ? '' : formatCurrency(value),
                name === 'spending' ? 'Avg Spending' : 'Avg Earning',
              ] as never
            }
          />
          <Radar
            name="spending"
            dataKey="spending"
            stroke={rawColors.app.red}
            fill={rawColors.app.red}
            fillOpacity={0.35}
            isAnimationActive={animate}
            animationDuration={700}
          />
          <Radar
            name="earning"
            dataKey="earning"
            stroke={rawColors.app.green}
            fill={rawColors.app.green}
            fillOpacity={0.18}
            isAnimationActive={animate}
            animationDuration={700}
          />
        </RadarChart>
      </ChartContainer>

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
            <p className="text-sm font-semibold text-white mt-0.5">
              <span className="text-app-red">{insights.topDay}</span>
              <span className="text-text-tertiary text-xs font-normal"> · {formatCurrencyShort(insights.topAmount)}/day</span>
            </p>
          </div>
          <div className="px-3 py-2 rounded-lg bg-white/[0.04] border border-border">
            <p className="text-[10px] uppercase tracking-widest text-text-quaternary font-semibold">
              Weekend vs Weekday
            </p>
            <p className="text-sm font-semibold text-white mt-0.5">
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
