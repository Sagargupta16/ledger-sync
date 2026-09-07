import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'

interface ProjectionResultsProps {
  invested: number
  value: number
  returns: number
  projectionYears: number
  activeMonthlySIP: number
}

export function ProjectionResults(props: Readonly<ProjectionResultsProps>) {
  const { invested, value, returns, projectionYears, activeMonthlySIP } = props

  const overallGainPercent = invested > 0 ? (returns / invested) * 100 : 0

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      <article className="ledger-panel p-4 sm:p-5">
        <p className="mb-1 text-sm font-medium text-muted-foreground">Total Investment</p>
        <p className="ledger-figure break-words text-xl font-semibold text-foreground">
          {formatCurrency(invested)}
        </p>
        <p className="mt-1 text-sm text-text-tertiary">
          <span className="ledger-figure">
            {projectionYears * 12} months @ {'₹'}
            {formatCurrencyShort(activeMonthlySIP)}/mo
          </span>
        </p>
      </article>

      <article className="ledger-panel p-4 sm:p-5">
        <p className="mb-1 text-sm font-medium text-muted-foreground">Projected Value</p>
        <p className="ledger-figure break-words text-xl font-semibold text-app-green">
          {formatCurrency(value)}
        </p>
        <p className="mt-1 text-sm text-text-tertiary">
          After <span className="ledger-figure">{projectionYears}</span> years
        </p>
      </article>

      <article className="ledger-panel p-4 sm:p-5">
        <p className="mb-1 text-sm font-medium text-muted-foreground">Projected Returns</p>
        <p className="ledger-figure break-words text-xl font-semibold text-app-blue">
          {formatCurrency(returns)}
        </p>
        <p className="ledger-figure mt-1 text-sm text-text-tertiary">
          {overallGainPercent.toFixed(1)}% overall gain
        </p>
      </article>
    </div>
  )
}
