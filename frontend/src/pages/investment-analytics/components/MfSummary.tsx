import { Coins, Percent, RefreshCw, TrendingUp, Wallet } from 'lucide-react'

import MetricCard from '@/components/shared/MetricCard'
import { Button } from '@/components/ui'
import { formatCurrency, formatDate, formatPercent } from '@/lib/formatters'
import type { MfHoldingsResponse } from '@/services/api/cas'

import { describeImport, partialCoverage } from '../mfHoldingsUtils'

interface MfSummaryProps {
  readonly data: MfHoldingsResponse
  readonly isRefreshing: boolean
  readonly onRefresh: () => void
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatCurrency(value)}`
}

export function MfSummary({ data, isRefreshing, onRefresh }: MfSummaryProps) {
  const { summary, nav, imports } = data
  const gainUp = (summary.gain ?? 0) >= 0
  // Market value skips schemes with no NAV, and Cost and Gain skip those with no cost
  // or no NAV, so say so rather than let the three cards read as one set of schemes.
  const priced = partialCoverage(summary.holdings - summary.unpriced_schemes, summary.holdings)
  const costed = partialCoverage(summary.cost_schemes, summary.holdings)
  let costSubtitle = 'What the units still held cost'
  if (summary.cost === null) costSubtitle = 'Cost not on the statement'
  else if (costed) costSubtitle = `${costed} have a cost`
  const xirrScope =
    summary.xirr_schemes > 0
      ? `Over ${summary.xirr_schemes} scheme${summary.xirr_schemes === 1 ? '' : 's'} with a full history`
      : 'Needs a Detailed CAS from your first purchase'
  const checked = nav.checked_at
    ? formatDate(new Date(nav.checked_at), {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata',
      })
    : null

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <MetricCard
          title="Market value"
          value={formatCurrency(summary.current_value)}
          subtitle={
            priced
              ? `${priced} have a NAV`
              : `${summary.holdings} scheme${summary.holdings === 1 ? '' : 's'} at the latest NAV`
          }
          icon={TrendingUp}
          color="green"
        />
        <MetricCard
          title="Cost"
          value={summary.cost === null ? '-' : formatCurrency(summary.cost)}
          subtitle={costSubtitle}
          icon={Wallet}
          color="blue"
        />
        <MetricCard
          title="Gain"
          value={summary.gain === null ? '-' : signed(summary.gain)}
          subtitle={
            summary.gain_pct === null
              ? 'Cost not on the statement'
              : `${formatPercent(summary.gain_pct, true)} on cost${costed ? ` (${costed})` : ''}`
          }
          icon={Coins}
          color={gainUp ? 'green' : 'red'}
        />
        <MetricCard
          title="XIRR"
          value={summary.xirr === null ? '-' : `${formatPercent(summary.xirr, true)} p.a.`}
          subtitle={xirrScope}
          icon={Percent}
          color="purple"
          titleInfo="Annualised return from the statement's dated purchases, redemptions and payouts, with today's value as the last flow, on a 365-day year like Excel's XIRR. Redeemed schemes count too."
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>
          {nav.newest_nav_date
            ? `NAV as of ${formatDate(nav.newest_nav_date)} from AMFI`
            : 'No AMFI NAV yet; values use the statement NAV'}
          {checked ? `, checked ${checked} IST.` : '.'} NAVs refresh once a day after 10:30 IST.
        </p>
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw className="size-3.5" aria-hidden="true" />}
          isLoading={isRefreshing}
          onClick={onRefresh}
        >
          Check for new NAVs
        </Button>
      </div>
      {nav.message && (
        <p role="status" className="rounded-md border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-warning">
          {nav.message}
        </p>
      )}
      {imports.length > 0 && (
        <ul className="space-y-0.5 text-xs text-text-tertiary" aria-label="Imported statements">
          {imports.map((info) => (
            <li key={info.source}>{describeImport(info)}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
