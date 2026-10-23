import { useMemo } from 'react'
import { CategoryAxis, ValueAxis } from '@/components/charts/Axis'
import Bars from '@/components/charts/Bars'
import CartesianChart, { type SeriesSpec } from '@/components/charts/CartesianChart'
import CartesianTooltip, { type TooltipSeries } from '@/components/charts/CartesianTooltip'
import type { ChartRow } from '@/components/charts/chartContext'
import Grid from '@/components/charts/Grid'
import { formatCurrency } from '@/lib/formatters'
import { formatMonthKey } from '@/lib/dateUtils'
import { summarizePayrollSchedule } from '@/lib/finance/payrollPlanning'
import { BAR_RADIUS } from '@/components/ui'
import ChartSeriesLegend from '@/components/ui/ChartSeriesLegend'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { colors } from '@/constants/colors'
import type { TaxPaidTillDate, TdsMonthRow } from '@/lib/tdsScheduleCalculator'

interface Props {
  schedule: readonly TdsMonthRow[]
  paidMonthIndices: readonly number[]
  paidEstimate: TaxPaidTillDate | null
}

/** Cash payroll TDS at the base of each month's stack, shares withheld for tax on top. */
const CASH_SERIES: readonly SeriesSpec[] = [{ key: 'cashTds', stackId: 'withholding' }]
const SHARE_SERIES: readonly SeriesSpec[] = [...CASH_SERIES, { key: 'rsuWithholding', stackId: 'withholding' }]
const CASH_STACK = ['cashTds'] as const
const SHARE_STACK = ['cashTds', 'rsuWithholding'] as const
const CASH_TIP: TooltipSeries = { key: 'cashTds', label: 'Projected cash payroll TDS', color: colors.app.blue }
const CASH_TIPS: readonly TooltipSeries[] = [CASH_TIP]
const SHARE_TIPS: readonly TooltipSeries[] = [
  CASH_TIP,
  { key: 'rsuWithholding', label: 'Share tax withholding', color: colors.app.purple },
]
const BAR_SIZE = 40

/** The tooltip's closing line: everything withheld that month, cash and shares together. */
function MonthTotal({ row }: Readonly<{ row: ChartRow }>) {
  const total = typeof row.withheld === 'number' ? row.withheld : 0
  return (
    <div className="flex items-baseline justify-between gap-x-5">
      <span>Month total</span>
      <span className="font-mono font-semibold tabular-nums text-foreground">{formatCurrency(total)}</span>
    </div>
  )
}

const monthTotal = (row: ChartRow) => <MonthTotal row={row} />

/** Projections and estimates from recorded receipts retain separate labels. */
export default function TdsScheduleChart({ schedule, paidMonthIndices, paidEstimate }: Readonly<Props>) {
  const bars = useMemo(() => {
    const salaryMonths = new Set(paidMonthIndices)
    return schedule.map((row) => ({
      ...row,
      // Raw `YYYY-MM` period (the short month when a row has none); the axis and tooltip format it.
      periodKey: row.period ?? row.month,
      displayMonth: row.period ? formatMonthKey(row.period, { month: 'short', year: '2-digit' }) : row.month,
      fillOpacity: salaryMonths.has(row.monthIndex) ? 1 : 0.45,
      status: salaryMonths.has(row.monthIndex) ? 'Salary recorded; values projected' : 'Projection',
      withheld: row.cashTds + row.rsuWithholding,
    }))
  }, [schedule, paidMonthIndices])
  if (schedule.length === 0) return null

  const summary = summarizePayrollSchedule(schedule)
  const extraShareCredit = schedule.at(-1)?.excessShareWithholding ?? 0
  const hasShares = summary.shareWithholding > 0
  const stack = hasShares ? SHARE_STACK : CASH_STACK
  // Months with salary recorded stay solid; the rest of the year fades.
  const opacityAt = (_row: ChartRow, index: number) => bars[index].fillOpacity

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
          { key: 'cash', label: 'Cash payroll TDS', color: colors.app.blue, value: formatCurrency(summary.cashTds) },
          ...(hasShares
            ? [{ key: 'shares', label: 'Share withholding', color: colors.app.purple, value: formatCurrency(summary.shareWithholding) }]
            : []),
        ]}
        caption={`${bars[0].displayMonth} to ${bars.at(-1)?.displayMonth}`}
      />
      <CartesianChart
        data={bars}
        categoryKey="periodKey"
        categoryKind="band"
        series={hasShares ? SHARE_SERIES : CASH_SERIES}
        height={320}
        mobileHeight={260}
        ariaLabel="Projected monthly cash payroll TDS and tax withheld in RSU shares"
        tooltip={<CartesianTooltip series={hasShares ? SHARE_TIPS : CASH_TIPS} hideZero footer={monthTotal} />}
      >
        <Grid />
        <ValueAxis />
        <CategoryAxis />
        <Bars
          dataKey="cashTds"
          color={colors.app.blue}
          fillOpacity={opacityAt}
          radius={BAR_RADIUS[0]}
          stackKeys={stack}
          barSize={BAR_SIZE}
        />
        {hasShares && (
          <Bars
            dataKey="rsuWithholding"
            color={colors.app.purple}
            fillOpacity={opacityAt}
            radius={BAR_RADIUS[0]}
            stackKeys={stack}
            barSize={BAR_SIZE}
          />
        )}
      </CartesianChart>

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
          { header: 'Month', rowHeader: true, value: (row) => row.displayMonth },
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
