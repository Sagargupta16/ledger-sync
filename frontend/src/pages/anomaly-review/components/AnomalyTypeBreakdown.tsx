import { Money } from '@/components/ui'

import { anomalyTypeLabel } from '../constants'
import type { AnomalySummaryCounts } from '../types'
import { useTypeFilterParam } from '../useAnomalyReview'

interface Props {
  byType: AnomalySummaryCounts['byType']
  fees: AnomalySummaryCounts['fees']
}

/**
 * One chip per type that has findings, each a shortcut to the type filter the
 * filter select also writes (a second press clears it), and what the flagged
 * fees and card interest cost in total.
 */
export default function AnomalyTypeBreakdown({ byType, fees }: Readonly<Props>) {
  const [active, setTypeFilter] = useTypeFilterParam()
  if (byType.length === 0) return null
  const toggle = (type: string) => setTypeFilter(active === type ? '' : type)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Findings by type">
        {byType.map(({ type, count }) => (
          <button
            key={type}
            type="button"
            onClick={() => toggle(type)}
            aria-pressed={active === type}
            className={`ledger-control inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors lg:pointer-fine:min-h-8 ${
              active === type
                ? 'border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {anomalyTypeLabel(type)}
            <span className="tabular-nums text-foreground">{count}</span>
          </button>
        ))}
      </div>
      {fees.count > 0 && (
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <Money value={fees.total} className="text-app-red" />
          <span>
            in fees and card interest across {fees.count} {fees.count === 1 ? 'charge' : 'charges'}
          </span>
        </p>
      )}
    </div>
  )
}
