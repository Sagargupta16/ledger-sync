import { motion } from 'motion/react'

import Sparkline from '@/components/shared/Sparkline'
import { FADE_UP } from '@/constants/animations'
import { rawColors } from '@/constants/colors'
import { formatCurrency, formatPercent } from '@/lib/formatters'

interface IncomeMetricGridProps {
  readonly totalIncome: number
  readonly primaryIncomeType: string
  readonly primaryShare: number
  /** `undefined` when there is no completed-month pair to compare -- renders a dash. */
  readonly growthRate: number | undefined
  readonly incomeSeries: readonly number[]
  readonly cashbacksTotal: number
  readonly cashbackShare: number
}

export default function IncomeMetricGrid({
  totalIncome,
  primaryIncomeType,
  primaryShare,
  growthRate,
  incomeSeries,
  cashbacksTotal,
  cashbackShare,
}: IncomeMetricGridProps) {
  // An absent growth rate is a real state (nothing completed to compare against),
  // not zero: it renders as a dash in a neutral colour rather than a confident 0%.
  let growthColor: 'green' | 'red' | 'blue' = 'blue'
  if (growthRate !== undefined && growthRate > 0) growthColor = 'green'
  else if (growthRate !== undefined && growthRate < 0) growthColor = 'red'

  return (
    <motion.dl
      {...FADE_UP}
      className="grid grid-cols-1 gap-x-6 gap-y-5 border-b border-border pb-6 min-[360px]:grid-cols-2 xl:grid-cols-[1.2fr_1.1fr_1fr_0.8fr]"
      aria-label="Income summary"
    >
      <div className="min-w-0">
        <dt className="ledger-meta text-app-green">Total Income</dt>
        <dd className="mt-2 break-words font-mono text-2xl font-semibold tracking-tight tabular-nums text-foreground sm:text-3xl">
          {formatCurrency(totalIncome)}
        </dd>
        <dd className="mt-2 text-xs text-muted-foreground">Selected period</dd>
      </div>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted-foreground">Primary Income Type</dt>
        <dd className="mt-2 break-words text-lg font-semibold text-foreground">{primaryIncomeType}</dd>
        {primaryShare > 0 && (
          <dd className="mt-2 font-mono text-sm tabular-nums text-app-green">{formatPercent(primaryShare)} of income</dd>
        )}
      </div>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted-foreground">Growth Rate</dt>
        <dd
          className="mt-2 font-mono text-xl font-semibold tabular-nums"
          style={{ color: rawColors.app[growthColor] }}
        >
          {growthRate === undefined ? '--' : formatPercent(growthRate, true)}
        </dd>
        <dd className="mt-2 text-xs text-muted-foreground">
          {growthRate === undefined ? 'Needs two completed months' : 'First vs latest month'}
        </dd>
        {growthRate !== undefined && incomeSeries.length >= 2 && (
          <dd className="mt-2 max-w-40">
            <Sparkline
              data={[...incomeSeries]}
              color={rawColors.app[growthColor === 'red' ? 'red' : 'green']}
              height={32}
              showTooltip={false}
              ariaLabel="Income growth trend"
            />
          </dd>
        )}
      </div>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted-foreground">Cashbacks Earned</dt>
        <dd className="mt-2 break-words font-mono text-xl font-semibold tabular-nums text-foreground">
          {formatCurrency(cashbacksTotal)}
        </dd>
        {cashbacksTotal > 0 && (
          <dd className="mt-2 text-xs tabular-nums text-muted-foreground">{formatPercent(cashbackShare)} of income</dd>
        )}
      </div>
    </motion.dl>
  )
}
