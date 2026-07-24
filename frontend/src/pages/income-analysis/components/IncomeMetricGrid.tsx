import { Activity, DollarSign, TrendingUp, Wallet } from 'lucide-react'

import MetricCard from '@/components/shared/MetricCard'
import Sparkline from '@/components/shared/Sparkline'
import { rawColors } from '@/constants/colors'
import { formatCurrency, formatPercent } from '@/lib/formatters'

interface IncomeMetricGridProps {
  readonly totalIncome: number
  readonly primaryIncomeType: string
  readonly primaryShare: number
  readonly growthRate: number
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
  let growthColor: 'green' | 'red' | 'blue' = 'blue'
  if (growthRate > 0) growthColor = 'green'
  else if (growthRate < 0) growthColor = 'red'

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
        value={formatPercent(growthRate, true)}
        subtitle="First vs latest month"
        trend={
          incomeSeries.length >= 2 ? (
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
