import { formatCurrency, formatPercent } from '@/lib/formatters'

import type { BudgetTotals } from '../categoryBudgetUtils'

interface Props {
  readonly totals: BudgetTotals
  readonly activeCount: number
}

/** This month across every active budget, in the page's ledger-band style. */
export function BudgetTotalsBand({ totals, activeCount }: Props) {
  const overspent = totals.left < 0
  const cells: ReadonlyArray<{
    readonly label: string
    readonly value: string
    readonly note: string
    readonly valueClass?: string
  }> = [
    {
      label: 'Budgeted',
      value: formatCurrency(totals.limit),
      note: `${activeCount} active ${activeCount === 1 ? 'budget' : 'budgets'}`,
    },
    {
      label: 'Spent',
      value: formatCurrency(totals.spent),
      note: `${formatPercent(totals.usedPct)} of budgeted`,
    },
    {
      label: overspent ? 'Over budget' : 'Left to spend',
      value: formatCurrency(Math.abs(totals.left)),
      note: overspent ? 'Spending passed the combined limit' : 'Across active budgets',
      valueClass: overspent ? 'text-app-red' : undefined,
    },
    {
      label: 'Need attention',
      value: String(totals.needAttention),
      note: `${totals.over} at or over the limit`,
      valueClass: totals.needAttention > 0 ? 'text-app-orange' : undefined,
    },
  ]

  return (
    <dl className="ledger-band grid-cols-2 lg:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.label} className="ledger-cell p-3">
          <dt className="ledger-meta text-text-tertiary">{cell.label}</dt>
          <dd
            className={`ledger-figure mt-1 whitespace-nowrap text-sm font-semibold ${cell.valueClass ?? 'text-foreground'}`}
          >
            {cell.value}
          </dd>
          <dd className="mt-0.5 text-xs text-text-tertiary">{cell.note}</dd>
        </div>
      ))}
    </dl>
  )
}
