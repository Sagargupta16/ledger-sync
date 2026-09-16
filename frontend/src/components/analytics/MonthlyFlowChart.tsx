/**
 * Income vs spending, one grouped bar pair per complete month.
 *
 * The Dashboard's two pies answer "what share of my money went where"; this
 * answers "is it getting better or worse", which a share-of-total chart cannot
 * show at all. Bars rather than an area/line because the comparison being made
 * is income against spending WITHIN a month, not a continuous trend.
 */

import { TrendingUp } from 'lucide-react'

import StandardBarChart from '@/components/analytics/StandardBarChart'
import EmptyState from '@/components/shared/EmptyState'
import { SEMANTIC_COLORS } from '@/constants/chartColors'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import ChartRangeControls from '@/components/ui/ChartRangeControls'
import { useChartRange } from '@/components/ui/useChartRange'
import { formatChartDate, formatChartPeriod } from '@/lib/chartDateLabels'
import type { MonthlyFlowDatum } from '@/hooks/useDashboardMetrics'

interface Props {
  readonly data: readonly MonthlyFlowDatum[]
  /** Named in the footnote when a month was excluded for being in progress. */
  readonly partialMonthLabel: string | null
}

export default function MonthlyFlowChart({ data, partialMonthLabel }: Props) {
  const range = useChartRange(data.map((row) => row.month))
  const showBrush = data.length > 6
  const income = data.reduce((sum, month) => sum + month.income, 0)
  const spending = data.reduce((sum, month) => sum + month.expense, 0)
  const net = income - spending
  const coveredMonths = data.filter((month) => month.income >= month.expense).length
  const netClass = net < 0 ? 'text-app-red' : 'text-foreground'

  return (
    <section className="@container ledger-panel min-w-0 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Income vs spending</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Totals for the selected period; complete months only.
          </p>
        </div>
        {data.length > 0 && (
          <span className="pt-1 font-mono text-[10px] tabular-nums text-muted-foreground">
            {data.length} {data.length === 1 ? 'month' : 'months'}
          </span>
        )}
      </div>

      {data.length > 0 ? (
        <>
          <dl className="mb-5 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border/60 py-4 @[28rem]:grid-cols-3">
            <div>
              <dt className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="h-0.5 w-3 rounded-full bg-app-green" aria-hidden="true" />
                <span>Income</span>
              </dt>
              <dd className="break-words font-mono text-lg font-medium tabular-nums text-app-green">
                {formatCurrency(income)}
              </dd>
            </div>
            <div>
              <dt className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="h-0.5 w-3 rounded-full bg-app-red" aria-hidden="true" />
                <span>Spending</span>
              </dt>
              <dd className="break-words font-mono text-lg font-medium tabular-nums text-app-red">
                {formatCurrency(spending)}
              </dd>
            </div>
            <div className="col-span-2 flex items-baseline justify-between gap-4 border-t border-border/60 pt-3 @[28rem]:col-span-1 @[28rem]:block @[28rem]:border-0 @[28rem]:pt-0">
              <dt className="mb-1 text-xs text-muted-foreground">Net cash flow</dt>
              <dd className={`break-words font-mono text-lg font-medium tabular-nums ${netClass}`}>
                {formatCurrency(net)}
              </dd>
            </div>
          </dl>
          {showBrush && <ChartRangeControls range={range} label="Monthly chart range" />}
          <StandardBarChart
            data={data}
            dataKey="month"
            xTickFormatter={(value) => formatChartPeriod(String(value))}
            tooltipLabelFormatter={formatChartDate}
            height={showBrush ? 280 : 240}
            showLegend={false}
            brush={showBrush ? {
              startIndex: range.startIndex,
              endIndex: range.endIndex,
              onChange: range.setRange,
            } : undefined}
            bars={[
              { key: 'income', color: SEMANTIC_COLORS.income, label: 'Income' },
              { key: 'expense', color: SEMANTIC_COLORS.expense, label: 'Spending' },
            ]}
            ariaLabel="Monthly income versus spending bar chart"
            yTickFormatter={(v) => formatCurrencyShort(Number(v))}
          />
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Income covered spending in <span className="font-mono tabular-nums text-foreground">{coveredMonths} of {data.length}</span> complete {data.length === 1 ? 'month' : 'months'}.
          </p>
          {partialMonthLabel && (
            <p className="mt-3 border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground">
              {partialMonthLabel} is still in progress and is not charted. A partial
              month pairs incomplete income against near-full fixed costs.
            </p>
          )}
        </>
      ) : (
        <EmptyState
          icon={TrendingUp}
          title="Not enough complete months"
          description="This chart needs at least one finished calendar month in the selected period."
          variant="compact"
        />
      )}
    </section>
  )
}
