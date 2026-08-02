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
import { formatCurrencyShort } from '@/lib/formatters'
import type { MonthlyFlowDatum } from '@/hooks/useDashboardMetrics'

interface Props {
  readonly data: readonly MonthlyFlowDatum[]
  /** Named in the footnote when a month was excluded for being in progress. */
  readonly partialMonthLabel: string | null
}

export default function MonthlyFlowChart({ data, partialMonthLabel }: Props) {
  return (
    <section className="ledger-panel p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <span className="flex size-7 items-center justify-center rounded-md bg-app-blue/10">
              <TrendingUp className="size-3.5 text-app-blue" />
            </span>
            <span>Income vs spending</span>
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Complete months in the selected period.
          </p>
        </div>
      </div>

      {data.length > 0 ? (
        <>
          <StandardBarChart
            data={data}
            dataKey="label"
            height={220}
            bars={[
              { key: 'income', color: SEMANTIC_COLORS.income, label: 'Income' },
              { key: 'expense', color: SEMANTIC_COLORS.expense, label: 'Spending' },
            ]}
            ariaLabel="Monthly income versus spending bar chart"
            yTickFormatter={(v) => formatCurrencyShort(Number(v))}
          />
          {partialMonthLabel && (
            <p className="mt-2 text-xs text-muted-foreground">
              {partialMonthLabel} is still in progress and is not charted -- a partial
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
