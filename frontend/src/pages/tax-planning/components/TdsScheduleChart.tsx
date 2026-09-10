import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import {
  ChartContainer,
  chartTooltipProps,
  GRID_DEFAULTS,
  xAxisDefaults,
  yAxisDefaults,
  BAR_RADIUS,
} from '@/components/ui'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { referenceLine } from '@/components/ui/chartDefaults'
import { useChartPresentation } from '@/components/ui/useChartPresentation'
import { rawColors } from '@/constants/colors'
import type { TdsMonthRow } from '@/lib/tdsScheduleCalculator'

/** Opacity applied to the app-blue bar/swatch for future (expected) months. */
const EXPECTED_OPACITY = 0.35

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
  const { animate, isMobile } = useChartPresentation(schedule.length)
  const barColor = rawColors.app.blue
  // Past months = solid blue (deducted); future = faded blue (expected). The
  // paint rides on the data rows because Recharts merges each row over its bar
  // rectangle props -- the supported replacement for the deprecated `<Cell>`
  // child. Memoised so `Bar` keeps a stable `data` identity: recharts mints a
  // new animation id whenever that reference changes, so a fresh array on every
  // parent re-render would replay the bar entry animation.
  const bars = useMemo(
    () =>
      schedule.map((r) => ({
        ...r,
        fill: barColor,
        fillOpacity: r.monthIndex < monthsPaid ? 1 : EXPECTED_OPACITY,
        stroke: barColor,
        strokeWidth: r.monthIndex < monthsPaid ? 0 : 1,
        strokeDasharray: r.monthIndex < monthsPaid ? undefined : '3 3',
      })),
    [schedule, monthsPaid, barColor],
  )

  if (schedule.length === 0) return null

  const totalTds = schedule.at(-1)?.cumulativeTds ?? 0
  const paidSoFar = schedule
    .slice(0, Math.max(0, monthsPaid))
    .reduce((sum, r) => sum + r.monthlyTds, 0)
  const expectedRest = totalTds - paidSoFar

  return (
    <div className="ledger-panel relative min-w-0 p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Monthly TDS schedule
          </p>
          <h3 className="text-xl font-semibold tracking-tight text-foreground">Tax Deducted</h3>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">
            Estimated deductions for paid months (solid) and the salary projection for future months (faded).
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Salary plan projection</p>
          <p className="mt-1.5 break-words font-mono text-2xl font-semibold tracking-tight tabular-nums text-foreground">
            {formatCurrency(totalTds)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Before adjustments for paid months</p>
        </div>
      </div>

      <ChartSeriesLegend
        items={[
          { key: 'paid', label: '01 / Paid months (estimated)', color: barColor, value: formatCurrency(paidSoFar) },
          { key: 'expected', label: '02 / Future projection', color: `${barColor}59` },
        ]}
        caption={schedule.length > 1 ? `${schedule[0].month} to ${schedule.at(-1)?.month}` : schedule[0].month}
      />
      <ChartContainer
        height={isMobile ? 260 : 320}
        ariaLabel="Estimated TDS for paid months in solid bars, with future salary projections in faded bars"
      >
        <BarChart data={bars} margin={{ top: 16, right: isMobile ? 4 : 12, bottom: 8, left: 0 }} barCategoryGap="24%">
          <CartesianGrid {...GRID_DEFAULTS} />
          <XAxis dataKey="month" {...xAxisDefaults(schedule.length)} />
          <YAxis {...yAxisDefaults({ width: isMobile ? 52 : 56 })} tickFormatter={(v: number) => formatCurrencyShort(v)} />
          <Tooltip
            {...chartTooltipProps}
            formatter={(value, _name, item) => [
              typeof value === 'number' ? formatCurrency(value) : '',
              (item?.payload as TdsMonthRow | undefined)?.monthIndex !== undefined
                && (item.payload as TdsMonthRow).monthIndex < monthsPaid
                ? 'Deducted'
                : 'Expected',
            ]}
          />
          {schedule.some((row) => row.monthlyTds < 0) && referenceLine({ y: 0, variant: 'zero' })}
          <Bar
            dataKey="monthlyTds"
            radius={BAR_RADIUS}
            maxBarSize={40}
            isAnimationActive={animate}
            animationDuration={520}
            animationEasing="ease-out"
          />
        </BarChart>
      </ChartContainer>

      <div className="mt-4 border-t border-border pt-4">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-medium text-foreground">Balance against salary plan</p>
          <p className="font-mono text-sm font-medium tabular-nums text-foreground">
            {formatCurrency(expectedRest)}
          </p>
        </div>
        <p className="mt-2 max-w-prose text-xs leading-relaxed text-muted-foreground">
          Salary plan projection less the estimate for paid months. Future bars retain the original
          monthly projection, including bonus / RSU tax.
        </p>
      </div>
      {chartDataTable(
        schedule,
        [
          { header: 'Month', rowHeader: true, value: (row) => row.month },
          { header: 'Status', value: (row) => row.monthIndex < monthsPaid ? 'Paid months (estimated)' : 'Future projection' },
          { header: 'TDS', value: (row) => formatCurrency(row.monthlyTds) },
        ],
        'Monthly TDS schedule: exact amounts',
        (row) => String(row.monthIndex),
      )}
    </div>
  )
}
