import { useMemo } from 'react'

import StandardBarChart from '@/components/analytics/StandardBarChart'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { SEMANTIC_COLORS } from '@/constants'
import { usePaletteSnapshot } from '@/hooks/usePaletteSnapshot'
import type { AdminStats } from '@/services/api/admin'

import { formatCount, formatUsd } from '../adminFormat'

/** Model calls per UTC day for the last 30 days, every account and funding source together. */
export default function AdminAiChart({ daily }: Readonly<{ daily: AdminStats['ai']['daily'] }>) {
  const semantic = usePaletteSnapshot(SEMANTIC_COLORS)
  const total = useMemo(() => daily.reduce((sum, day) => sum + day.calls, 0), [daily])
  const spend = useMemo(() => daily.reduce((sum, day) => sum + day.cost_usd, 0), [daily])

  return (
    <section aria-labelledby="admin-ai-daily" className="ledger-panel space-y-3 p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="admin-ai-daily" className="text-sm font-semibold text-foreground">
          AI calls per day
        </h2>
        <p className="text-xs text-muted-foreground">
          {formatCount(total)} calls, about {formatUsd(spend)} over 30 UTC days
        </p>
      </header>
      {total === 0 ? (
        <ChartEmptyState height={240} />
      ) : (
        <StandardBarChart
          data={daily}
          dataKey="date"
          height={260}
          bars={[{ key: 'calls', label: 'AI calls', color: semantic.investment }]}
          tooltipFormatter={formatCount}
          yTickFormatter={(value) => formatCount(Number(value))}
          rowHeaderLabel="Day (UTC)"
          ariaLabel="Bar chart of AI model calls per UTC day over the last 30 days, all accounts"
        />
      )}
    </section>
  )
}
