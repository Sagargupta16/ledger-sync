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

/** Faded variant of the deducted-bar colour (app blue #4a9eff), for future months. */
const EXPECTED_FILL = 'rgba(74, 158, 255, 0.35)'

interface Props {
  readonly schedule: readonly TdsMonthRow[]
  /** Months of salary already received -- these bars are "deducted", the rest "expected". */
  readonly monthsPaid: number
}

/**
 * Tax deducted (and expected) per month across the fiscal year. Months already
 * paid show TDS actually deducted (solid); remaining months show the expected
 * deduction (faded). A bonus/RSU month spikes with the extra tax on that income.
 */
export default function TdsScheduleChart({ schedule, monthsPaid }: Props) {
  if (schedule.length === 0) return null

  const totalTds = schedule.at(-1)?.cumulativeTds ?? 0
  const paidSoFar = schedule
    .slice(0, Math.max(0, monthsPaid))
    .reduce((sum, r) => sum + r.monthlyTds, 0)
  const expectedRest = totalTds - paidSoFar

  return (
    <div className="rounded-2xl border border-border bg-white/[0.02] p-4 sm:p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 rounded-lg bg-app-blue/10">
          <Receipt className="w-4 h-4 text-app-blue" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">Tax Deducted</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Deducted so far (solid) and expected for the rest of the year (faded),
            month by month. Bonus / RSU months spike with the extra tax on that income.
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
            formatter={(value, _name, item) => [
              typeof value === 'number' ? formatCurrency(value) : '',
              (item?.payload as TdsMonthRow | undefined)?.monthIndex !== undefined
                && (item.payload as TdsMonthRow).monthIndex < monthsPaid
                ? 'Deducted'
                : 'Expected',
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
            {schedule.map((r) => {
              // Past months = solid blue (deducted); future = faded blue (expected).
              const isPaid = r.monthIndex < monthsPaid
              return (
                <Cell
                  key={r.month}
                  fill={isPaid ? rawColors.app.blue : EXPECTED_FILL}
                />
              )
            })}
          </Bar>
        </BarChart>
      </ChartContainer>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: rawColors.app.blue }} />
            <span className="text-muted-foreground">Deducted ({formatCurrency(paidSoFar)})</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: EXPECTED_FILL }} />
            <span className="text-muted-foreground">Expected ({formatCurrency(expectedRest)})</span>
          </span>
        </div>
        <span className="text-muted-foreground">
          Full-year tax:{' '}
          <span className="font-semibold text-foreground">{formatCurrency(totalTds)}</span>
        </span>
      </div>
    </div>
  )
}
