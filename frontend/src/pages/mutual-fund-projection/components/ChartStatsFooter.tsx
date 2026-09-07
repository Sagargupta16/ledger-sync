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
    <section className="border-y border-border px-1 py-4" aria-label="Projection totals">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className="text-xs text-muted-foreground">{stat.label}</dt>
            {isLoading ? (
              <LoadingSkeleton className="h-6 w-24 mt-1" />
            ) : (
              <dd className={`ledger-figure break-words text-lg font-bold sm:text-xl ${stat.color}`}>
                {formatCurrency(stat.value)}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </section>
  )
}
