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
    <div className="grid grid-cols-1 gap-x-6 gap-y-5 border-b border-border pb-6 sm:grid-cols-2 lg:grid-cols-3">
      <TrendCard
        metrics={metrics.spending}
        icon={CreditCard}
        iconBgClass="bg-app-red/20"
        iconColorClass="text-app-red"
        label="Spending Trend"
        isPositiveGood={false}
        isLoading={isLoading}
      />
      <TrendCard
        metrics={metrics.income}
        icon={Wallet}
        iconBgClass="bg-app-green/20"
        iconColorClass="text-app-green"
        label="Income Trend"
        isPositiveGood
        isLoading={isLoading}
      />
      <TrendCard
        metrics={metrics.savings}
        icon={PiggyBank}
        iconBgClass="bg-app-blue/10"
        iconColorClass="text-app-blue"
        label="Savings Trend"
        isPositiveGood
        isLoading={isLoading}
        valueClassName={metrics.savings.current >= 0 ? 'text-foreground' : 'text-app-red'}
        averageClassName={metrics.savings.average >= 0 ? 'text-foreground' : 'text-app-red'}
        secondStatLabel="Best Month"
        secondStatClassName="text-app-green"
        className="sm:col-span-2 lg:col-span-1"
      />
    </div>
  )
}
