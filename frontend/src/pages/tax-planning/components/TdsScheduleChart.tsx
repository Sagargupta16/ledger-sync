import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import { summarizePayrollSchedule } from '@/lib/finance/payrollPlanning'
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
import { useChartPresentation } from '@/components/ui/useChartPresentation'
import { rawColors } from '@/constants/colors'
import type { TaxPaidTillDate, TdsMonthRow } from '@/lib/tdsScheduleCalculator'

interface Props {
  schedule: readonly TdsMonthRow[]
  paidMonthIndices: readonly number[]
  paidEstimate: TaxPaidTillDate | null
}

/** Projections and estimates from recorded receipts retain separate labels. */
export default function TdsScheduleChart({ schedule, paidMonthIndices, paidEstimate }: Readonly<Props>) {
  const { animate, isMobile } = useChartPresentation(schedule.length)
  const bars = useMemo(() => {
    const salaryMonths = new Set(paidMonthIndices)
    return schedule.map((row) => ({
      ...row,
      fillOpacity: salaryMonths.has(row.monthIndex) ? 1 : 0.45,
      status: salaryMonths.has(row.monthIndex) ? 'Salary recorded; values projected' : 'Projection',
    }))
  }, [schedule, paidMonthIndices])
  if (schedule.length === 0) return null

  const summary = summarizePayrollSchedule(schedule)
  const extraShareCredit = schedule.at(-1)?.excessShareWithholding ?? 0
  const labels: Record<string, string> = {
    cashTds: 'Projected cash payroll TDS',
    rsuWithholding: 'Share tax withholding',
  }

  return (
    <section aria-label="Payroll and share withholding" className="ledger-panel relative min-w-0 p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Monthly salary plan
          </p>
          <h3 className="text-xl font-semibold tracking-tight text-foreground">Payroll and share withholding</h3>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">
            Every bar is a projection. Months with salary recorded are solid; remaining months are faded.
            Cash payroll deductions and shares used for tax are shown separately.
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Projected annual tax liability</p>
          <p className="mt-1.5 break-words font-mono text-2xl font-semibold tracking-tight tabular-nums text-foreground">
            {formatCurrency(summary.totalTax)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Salary, bonus, and gross RSU vesting value</p>
        </div>
      </div>

      <ChartSeriesLegend
        items={[
          { key: 'cash', label: 'Cash payroll TDS', color: rawColors.app.blue, value: formatCurrency(summary.cashTds) },
          ...(summary.shareWithholding > 0
            ? [{ key: 'shares', label: 'Share withholding', color: rawColors.app.purple, value: formatCurrency(summary.shareWithholding) }]
            : []),
        ]}
        caption={`${schedule[0].month} to ${schedule.at(-1)?.month}`}
      />
      <ChartContainer
        height={isMobile ? 260 : 320}
        ariaLabel="Projected monthly cash payroll TDS and tax withheld in RSU shares"
      >
        <BarChart data={bars} margin={{ top: 16, right: isMobile ? 4 : 12, bottom: 8, left: 0 }} barCategoryGap="24%">
          <CartesianGrid {...GRID_DEFAULTS} />
          <XAxis dataKey="month" {...xAxisDefaults(schedule.length)} />
          <YAxis {...yAxisDefaults({ width: isMobile ? 52 : 56 })} tickFormatter={(value: number) => formatCurrencyShort(value)} />
          <Tooltip
            {...chartTooltipProps}
            formatter={(value, name) => [
              typeof value === 'number' ? formatCurrency(value) : '',
              labels[name ?? ''] ?? name,
            ]}
          />
          <Bar dataKey="cashTds" fill={rawColors.app.blue} stackId="withholding" maxBarSize={40} isAnimationActive={animate} animationDuration={520} animationEasing="ease-out" />
          {summary.shareWithholding > 0 && (
            <Bar dataKey="rsuWithholding" fill={rawColors.app.purple} stackId="withholding" radius={BAR_RADIUS} maxBarSize={40} isAnimationActive={animate} animationDuration={520} animationEasing="ease-out" />
          )}
        </BarChart>
      </ChartContainer>

      <dl className="mt-4 grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Projected cash take-home</dt>
          <dd className="mt-1 break-words font-mono text-lg font-semibold tabular-nums">{formatCurrency(summary.cashTakeHome)}</dd>
          <dd className="mt-1 text-xs text-muted-foreground">After payroll tax and employee deductions</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Projected retained shares</dt>
          <dd className="mt-1 break-words font-mono text-lg font-semibold tabular-nums">{formatCurrency(summary.netShareValue)}</dd>
          <dd className="mt-1 text-xs text-muted-foreground">Value held as shares, separate from cash</dd>
        </div>
      </dl>

      {paidEstimate && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-medium text-foreground">Estimated withholding on income received</p>
            <p className="font-mono text-sm font-medium tabular-nums">{formatCurrency(paidEstimate.taxPaid)}</p>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Cash payroll estimate {formatCurrency(paidEstimate.cashTaxPaid)}.
            {' '}Share withholding: {formatCurrency(paidEstimate.rsuRecordedWithholding)} from recorded vestings
            {' '}and {formatCurrency(paidEstimate.rsuEstimatedWithholding)} estimated.
            RSU ledger receipts are excluded from the cash estimate. Share withholding uses configured vestings; check that every receipt has a vesting entry.
          </p>
        </div>
      )}
      {extraShareCredit > 0 && (
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Share withholding exceeds the remaining planned tax by {formatCurrency(extraShareCredit)}.
          Check the credit against your payroll statement.
        </p>
      )}
      {chartDataTable(
        bars,
        [
          { header: 'Month', rowHeader: true, value: (row) => row.month },
          { header: 'Basis', value: (row) => row.status },
          { header: 'Tax liability', value: (row) => formatCurrency(row.monthlyTds) },
          { header: 'Cash payroll TDS', value: (row) => formatCurrency(row.cashTds) },
          { header: 'Share withholding', value: (row) => formatCurrency(row.rsuWithholding) },
          { header: 'Cash take-home', value: (row) => formatCurrency(row.cashTakeHome) },
          { header: 'Retained shares', value: (row) => formatCurrency(row.netShareValue) },
        ],
        'Monthly salary plan: exact amounts',
        (row) => String(row.monthIndex),
      )}
    </section>
  )
}
