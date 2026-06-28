import LoadingSkeleton from '@/components/shared/LoadingSkeleton'
import { formatCurrency } from '@/lib/formatters'

interface ChartStatsFooterProps {
  isLoading: boolean
  totalHistoricalInvested: number
  currentBalance: number
  projectedInvested: number
  projectedValue: number
}

export function ChartStatsFooter(props: Readonly<ChartStatsFooterProps>) {
  const {
    isLoading,
    totalHistoricalInvested,
    currentBalance,
    projectedInvested,
    projectedValue,
  } = props

  const stats = [
    { label: 'Current Invested', value: totalHistoricalInvested, color: 'text-app-blue' },
    { label: 'Current Value', value: currentBalance, color: 'text-app-green' },
    { label: 'Future Invested', value: projectedInvested, color: 'text-app-blue' },
    { label: 'Future Value', value: projectedValue, color: 'text-app-green' },
  ]

  return (
    <div className="mt-4 p-4 bg-muted/30 rounded-lg border border-border">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label}>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            {isLoading ? (
              <LoadingSkeleton className="h-6 w-24 mt-1" />
            ) : (
              <p className={`text-xl font-bold tabular-nums ${stat.color}`}>
                {formatCurrency(stat.value)}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
