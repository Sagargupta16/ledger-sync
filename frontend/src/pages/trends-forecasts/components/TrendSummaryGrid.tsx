import { CreditCard, PiggyBank, Wallet } from 'lucide-react'

import type { useTrendsForecasts } from '../useTrendsForecasts'

import TrendCard from './TrendCard'

type TrendMetrics = ReturnType<typeof useTrendsForecasts>['metrics']

interface TrendSummaryGridProps {
  readonly metrics: TrendMetrics
  readonly isLoading: boolean
}

export default function TrendSummaryGrid({
  metrics,
  isLoading,
}: TrendSummaryGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 lg:gap-6">
      <TrendCard
        metrics={metrics.spending}
        icon={CreditCard}
        iconBgClass="bg-app-red/20"
        iconColorClass="text-app-red"
        label="Spending Trend"
        isPositiveGood={false}
        delay={0}
        isLoading={isLoading}
      />
      <TrendCard
        metrics={metrics.income}
        icon={Wallet}
        iconBgClass="bg-app-green/20"
        iconColorClass="text-app-green"
        label="Income Trend"
        isPositiveGood
        delay={0.04}
        isLoading={isLoading}
      />
      <TrendCard
        metrics={metrics.savings}
        icon={PiggyBank}
        iconBgClass="bg-app-purple/20"
        iconColorClass="text-app-purple"
        label="Savings Trend"
        isPositiveGood
        delay={0.08}
        isLoading={isLoading}
        valueClassName={metrics.savings.current >= 0 ? 'text-foreground' : 'text-app-red'}
        averageClassName={metrics.savings.average >= 0 ? 'text-foreground' : 'text-app-red'}
        secondStatLabel="Best Month"
        secondStatClassName="text-app-green"
      />
    </div>
  )
}
