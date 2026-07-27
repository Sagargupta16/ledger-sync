import { motion } from 'motion/react'
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
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-4 sm:p-6"
      aria-labelledby="returns-summary-title"
    >
      <div className="mb-6 flex items-center gap-4">
        <div
          className={`shrink-0 rounded-2xl p-4 ${
            netProfitLoss >= 0 ? 'bg-app-green/10' : 'bg-app-red/10'
          }`}
        >
          {netProfitLoss >= 0 ? (
            <TrendingUp className="size-8 text-app-green" aria-hidden="true" />
          ) : (
            <TrendingDown className="size-8 text-app-red" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0">
          <h2 id="returns-summary-title" className="text-sm text-text-tertiary">
            Net Investment P&amp;L
          </h2>
          <p
            className={`ledger-figure text-xl font-bold sm:text-4xl ${
              netProfitLoss >= 0 ? 'text-app-green' : 'text-app-red'
            }`}
          >
            {netProfitLoss >= 0 ? '+' : ''}
            {formatCurrency(netProfitLoss)}
          </p>
        </div>
      </div>

      {/* 3 cards: on phones the third would orphan in a 2-col grid, so it spans
          both columns. sm+ lays all three out in one row. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-border bg-[var(--overlay-2)] p-3 last:col-span-2 sm:last:col-span-1"
          >
            <p className="text-[10px] font-semibold uppercase text-text-quaternary">{stat.label}</p>
            <p className={`ledger-figure text-base font-bold sm:text-lg ${stat.color}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </motion.section>
  )
}
