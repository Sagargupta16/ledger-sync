import { Activity, DollarSign, TrendingUp, Wallet } from 'lucide-react'

import MetricCard from '@/components/shared/MetricCard'
import Sparkline from '@/components/shared/Sparkline'
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
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-6">
      <MetricCard
        title="Total Income"
        value={formatCurrency(totalIncome)}
        icon={DollarSign}
        color="green"
      />
      <MetricCard
        title="Primary Income Type"
        value={primaryIncomeType}
        subtitle={primaryShare > 0 ? `${formatPercent(primaryShare)} of income` : undefined}
        icon={Activity}
        color="blue"
      />
      <MetricCard
        title="Growth Rate"
        value={growthRate === undefined ? '--' : formatPercent(growthRate, true)}
        subtitle={
          growthRate === undefined
            ? 'Needs two completed months'
            : 'First vs latest month'
        }
        trend={
          growthRate !== undefined && incomeSeries.length >= 2 ? (
            <Sparkline
              data={[...incomeSeries]}
              color={rawColors.app[growthColor === 'red' ? 'red' : 'green']}
              height={36}
              showTooltip={false}
            />
          ) : undefined
        }
        icon={TrendingUp}
        color={growthColor}
      />
      <MetricCard
        title="Cashbacks Earned"
        value={formatCurrency(cashbacksTotal)}
        subtitle={cashbacksTotal > 0 ? `${formatPercent(cashbackShare)} of income` : undefined}
        icon={Wallet}
        color="teal"
      />
    </div>
  )
}
