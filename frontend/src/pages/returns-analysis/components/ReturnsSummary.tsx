import { TrendingDown, TrendingUp } from 'lucide-react'

import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'

interface ReturnsSummaryProps {
  readonly netProfitLoss: number
  readonly totalIncome: number
  readonly totalExpenses: number
  /** Realised investment income/cost events in the window. A count, not a rate. */
  readonly realisedEventCount: number
}

export default function ReturnsSummary({
  netProfitLoss,
  totalIncome,
  totalExpenses,
  realisedEventCount,
}: ReturnsSummaryProps) {
  // "CAGR" and "Monthly ROI" used to sit in the first two slots. Both were
  // derived from monthly TOTAL INCOME (salary), not from investments, and the
  // monthly figure was that annual rate converted to a monthly equivalent. On
  // the default FY window the pair rendered -99.99% and -54.23%, which reads as
  // "your portfolio lost nearly everything". A return needs a market value the
  // statements never carry, so the row now holds only booked cash facts.
  const stats = [
    {
      label: 'Realised Income',
      value: formatCurrencyShort(totalIncome),
      color: 'text-app-green',
    },
    {
      label: 'Realised Costs',
      value: formatCurrencyShort(totalExpenses),
      color: 'text-app-red',
    },
    {
      label: 'Booked Events',
      value: String(realisedEventCount),
      color: 'text-app-blue',
    },
  ]

  return (
    <section
      className="ledger-panel p-4 sm:p-5"
      aria-labelledby="returns-summary-title"
    >
      <div className="mb-4 flex items-center gap-3">
        <div
          className={`shrink-0 rounded-md p-3 ${
            netProfitLoss >= 0 ? 'bg-app-green/10' : 'bg-app-red/10'
          }`}
        >
          {netProfitLoss >= 0 ? (
            <TrendingUp className="size-6 text-app-green" aria-hidden="true" />
          ) : (
            <TrendingDown className="size-6 text-app-red" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0">
          <h2 id="returns-summary-title" className="text-sm text-text-tertiary">
            Net Investment P&amp;L
          </h2>
          <p
            className={`ledger-figure break-words text-2xl font-bold sm:text-4xl ${
              netProfitLoss >= 0 ? 'text-app-green' : 'text-app-red'
            }`}
          >
            {netProfitLoss >= 0 ? '+' : ''}
            {formatCurrency(netProfitLoss)}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-1 divide-y divide-border border-t border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0 py-3 sm:px-4 sm:first:pl-0 sm:last:pr-0">
            <dt className="text-xs font-medium text-text-tertiary">{stat.label}</dt>
            <dd className={`ledger-figure break-words text-lg font-bold ${stat.color}`}>
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
