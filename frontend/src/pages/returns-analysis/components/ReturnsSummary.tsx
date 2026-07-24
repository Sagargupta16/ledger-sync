import { motion } from 'framer-motion'
import { TrendingDown, TrendingUp } from 'lucide-react'

import { formatCurrency, formatCurrencyShort, formatPercent } from '@/lib/formatters'

interface ReturnsSummaryProps {
  readonly netProfitLoss: number
  readonly estimatedCAGR: number
  readonly roi: number
  readonly totalIncome: number
  readonly totalExpenses: number
}

export default function ReturnsSummary({
  netProfitLoss,
  estimatedCAGR,
  roi,
  totalIncome,
  totalExpenses,
}: ReturnsSummaryProps) {
  const stats = [
    {
      label: 'CAGR',
      value: formatPercent(estimatedCAGR),
      color: estimatedCAGR >= 0 ? 'text-app-green' : 'text-app-red',
    },
    {
      label: 'Monthly ROI',
      value: formatPercent(roi),
      color: roi >= 0 ? 'text-app-green' : 'text-app-red',
    },
    {
      label: 'Total Income',
      value: formatCurrencyShort(totalIncome),
      color: 'text-app-green',
    },
    {
      label: 'Total Costs',
      value: formatCurrencyShort(totalExpenses),
      color: 'text-app-red',
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border bg-[var(--overlay-2)] p-3">
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
