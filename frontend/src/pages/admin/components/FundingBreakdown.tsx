import type { AdminStats } from '@/services/api/admin'

import { FUNDING_LABELS, formatCount, formatUsd } from '../adminFormat'

/**
 * Who paid for the last 30 days of AI: the app's shared Bedrock key, users'
 * own keys, or calls logged before funding was recorded.
 */
export default function FundingBreakdown({
  rows,
}: Readonly<{ rows: AdminStats['ai']['by_funding_30d'] }>) {
  return (
    <section aria-labelledby="admin-ai-funding" className="ledger-panel space-y-3 p-4">
      <h2 id="admin-ai-funding" className="text-sm font-semibold text-foreground">
        AI by funding, 30 days
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No AI calls in the last 30 days.</p>
      ) : (
        <ul className="divide-y divide-[var(--hairline-1)]">
          {rows.map((row) => (
            <li key={row.funding_source} className="flex items-baseline justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate text-foreground">
                {FUNDING_LABELS[row.funding_source] ?? row.funding_source}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatCount(row.calls)} calls
                <span className="ml-3 font-medium text-foreground">{formatUsd(row.cost_usd)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Spend is estimated from recorded tokens at list prices, in US dollars.
      </p>
    </section>
  )
}
