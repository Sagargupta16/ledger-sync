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

  const currentInvestedDisplay = isLoading ? '...' : formatCurrency(totalHistoricalInvested)
  const currentValueDisplay = isLoading ? '...' : formatCurrency(currentBalance)
  const futureInvestedDisplay = isLoading ? '...' : formatCurrency(projectedInvested)
  const futureValueDisplay = isLoading ? '...' : formatCurrency(projectedValue)

  return (
    <div className="mt-4 p-4 bg-muted/30 rounded-lg border border-border">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Current Invested</p>
          <p className="text-xl font-bold text-app-blue">{currentInvestedDisplay}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Current Value</p>
          <p className="text-xl font-bold text-app-green">{currentValueDisplay}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Future Invested</p>
          <p className="text-xl font-bold text-app-blue">{futureInvestedDisplay}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Future Value</p>
          <p className="text-xl font-bold text-app-green">{futureValueDisplay}</p>
        </div>
      </div>
    </div>
  )
}
