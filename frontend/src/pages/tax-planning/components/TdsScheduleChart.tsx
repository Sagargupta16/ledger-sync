import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts'
import { Receipt } from 'lucide-react'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import {
  ChartContainer,
  chartTooltipProps,
  GRID_DEFAULTS,
  xAxisDefaults,
  yAxisDefaults,
  shouldAnimate,
  BAR_RADIUS,
} from '@/components/ui'
import { rawColors } from '@/constants/colors'
import type { TdsMonthRow } from '@/lib/tdsScheduleCalculator'

interface Props {
  readonly schedule: readonly TdsMonthRow[]
}

/**
 * Per-month TDS deducted across the fiscal year. Regular salary produces a
 * flat baseline; the month an RSU vesting lands shows a one-off spike (the
 * marginal tax on that income), so the user can see exactly when and why more
 * tax was cut from a given month's pay.
 */
export default function TdsScheduleChart({ schedule }: Props) {
  if (schedule.length === 0) return null

  const totalTds = schedule.at(-1)?.cumulativeTds ?? 0
  const baseline = schedule[0]?.monthlyTds ?? 0
  // A month is a "spike" if its TDS is meaningfully above the flat baseline.
  const peak = Math.max(...schedule.map((r) => r.monthlyTds))
  const hasSpike = peak > baseline * 1.05

  return (
    <div className="rounded-2xl border border-border bg-white/[0.02] p-4 sm:p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 rounded-lg bg-app-blue/10">
          <Receipt className="w-4 h-4 text-app-blue" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">TDS Deducted Per Month</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Forward-looking estimate: a flat baseline on regular salary, with a spike
            the month any RSU vesting lands (the extra tax on that income).
          </p>
        </div>
      </div>

      <ChartContainer height={300}>
        <BarChart data={schedule as TdsMonthRow[]} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
          <CartesianGrid {...GRID_DEFAULTS} />
          <XAxis dataKey="month" {...xAxisDefaults(schedule.length)} />
          <YAxis {...yAxisDefaults()} tickFormatter={(v: number) => formatCurrencyShort(v)} />
          <Tooltip
            {...chartTooltipProps}
            formatter={(value) => [
              typeof value === 'number' ? formatCurrency(value) : '',
              'TDS',
            ]}
            labelFormatter={(label) => `${label}`}
          />
          <Bar
            dataKey="monthlyTds"
            radius={BAR_RADIUS}
            isAnimationActive={shouldAnimate(schedule.length)}
            animationDuration={600}
            animationEasing="ease-out"
          >
            {schedule.map((r) => (
              <Cell
                key={r.month}
                fill={r.monthlyTds > baseline * 1.05 ? rawColors.app.orange : rawColors.app.blue}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: rawColors.app.blue }} />
            <span className="text-muted-foreground">Regular salary TDS</span>
          </span>
          {hasSpike && (
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: rawColors.app.orange }} />
              <span className="text-muted-foreground">RSU / bonus month</span>
            </span>
          )}
        </div>
        <span className="text-muted-foreground">
          Total annual TDS:{' '}
          <span className="font-semibold text-foreground">{formatCurrency(totalTds)}</span>
        </span>
      </div>
    </div>
  )
}
