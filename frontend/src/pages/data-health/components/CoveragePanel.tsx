import { CalendarRange } from 'lucide-react'

import ProgressBar from '@/components/shared/ProgressBar'
import { rawColors } from '@/constants/colors'
import { formatDate, getActiveLocale } from '@/lib/formatters'

import type { CoverageSummary } from '../types'

interface CoveragePanelProps {
  readonly coverage: CoverageSummary
}

/**
 * How much of the ledger's own timeline is actually filled in.
 *
 * The fill is the covered span; the empty tail is the gap between the newest row
 * and today. Reading it as a bar makes the missing stretch a visible quantity
 * rather than a date the user has to subtract in their head.
 */
export default function CoveragePanel({ coverage }: CoveragePanelProps) {
  const locale = getActiveLocale()
  const coveredPct = coverage.totalDays > 0 ? (coverage.coveredDays / coverage.totalDays) * 100 : 0
  const isComplete = coverage.gapDays === 0
  const fillColor = isComplete ? rawColors.app.green : rawColors.app.orange

  return (
    <section className="ledger-panel space-y-3 p-4">
      <div className="flex items-center gap-2">
        <CalendarRange className="size-4 shrink-0 text-app-indigo" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">Timeline coverage</h2>
        <span className="ml-auto text-xs font-medium tabular-nums text-text-tertiary">
          {coveredPct.toFixed(1)}% filled
        </span>
      </div>

      <ProgressBar
        value={coverage.coveredDays}
        max={coverage.totalDays}
        color={fillColor}
        height={10}
        ariaLabel={`${coverage.coveredDays} of ${coverage.totalDays} days covered by imported transactions`}
      />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-text-tertiary">First transaction</dt>
          <dd className="truncate font-medium text-foreground">
            {formatDate(coverage.earliestDate)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-text-tertiary">Last transaction</dt>
          <dd className="truncate font-medium text-foreground">
            {formatDate(coverage.latestDate)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-text-tertiary">Days covered / missing</dt>
          <dd className="truncate font-medium tabular-nums text-foreground">
            {coverage.coveredDays.toLocaleString(locale)} /{' '}
            <span className={isComplete ? 'text-app-green' : 'text-app-orange'}>
              {coverage.gapDays.toLocaleString(locale)}
            </span>
          </dd>
        </div>
      </dl>
    </section>
  )
}
