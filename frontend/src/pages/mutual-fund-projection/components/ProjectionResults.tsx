import { Money } from '@/components/ui'
import { formatCurrencyShort, formatPercent } from '@/lib/formatters'

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
    // Two-up on phones with short figures; full figures from `sm` up.
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
      <article className="ledger-panel min-w-0 p-4 sm:p-5">
        <p className="mb-1 text-sm font-medium text-muted-foreground">Total Investment</p>
        <p className="ledger-figure break-words text-xl font-semibold text-foreground">
          <Money value={invested} compactBelowSm bold className="whitespace-normal text-left text-foreground" />
        </p>
        <p className="mt-1 text-sm text-text-tertiary">
          <span className="ledger-figure">
            {projectionYears * 12} months @ {formatCurrencyShort(activeMonthlySIP)}/mo
          </span>
        </p>
      </article>

      <article className="ledger-panel min-w-0 p-4 sm:p-5">
        <p className="mb-1 text-sm font-medium text-muted-foreground">Projected Value</p>
        <p className="ledger-figure break-words text-xl font-semibold text-app-green">
          <Money value={value} compactBelowSm bold className="whitespace-normal text-left text-app-green" />
        </p>
        <p className="mt-1 text-sm text-text-tertiary">
          After <span className="ledger-figure">{projectionYears}</span> years
        </p>
      </article>

      <article className="ledger-panel col-span-2 min-w-0 p-4 sm:col-span-1 sm:p-5">
        <p className="mb-1 text-sm font-medium text-muted-foreground">Projected Returns</p>
        <p className="ledger-figure break-words text-xl font-semibold text-app-blue">
          <Money value={returns} compactBelowSm bold className="whitespace-normal text-left text-app-blue" />
        </p>
        <p className="ledger-figure mt-1 text-sm text-text-tertiary">
          {formatPercent(overallGainPercent)} overall gain
        </p>
      </article>
    </div>
  )
}
