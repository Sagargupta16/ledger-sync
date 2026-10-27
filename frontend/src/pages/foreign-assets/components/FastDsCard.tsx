import { useId } from 'react'

import type { UseQueryResult } from '@tanstack/react-query'
import { CalendarClock, ExternalLink, Landmark } from 'lucide-react'

import MetricCard from '@/components/shared/MetricCard'
import { PanelSkeleton } from '@/components/shared/LoadingSkeleton'
import { Button, Money } from '@/components/ui'
import { formatDate } from '@/lib/formatters'
import { formatInr, formatInrWhole } from '@/lib/rsuTaxFx'
import type { FastDsReport, FastDsRow } from '@/services/api/rsuTax'

import { COMPUTATION_NOTE, flagLabels, formatShares } from '../foreignAssetsLabels'

const PORTAL_NEWS_URL = 'https://www.incometax.gov.in/iec/foportal/latest-news'
/** FAST-DS 2026 (Finance Act 2026): category 2 cap and flat fee, and category 1's share of value. */
const CATEGORY_2_CAP_INR = 50_000_000
const CATEGORY_2_FEE_INR = 100_000
const CATEGORY_1_RATE_PERCENT = 60

/** The countdown is zero on the deadline day itself and negative after it. */
function deadlineText(daysLeft: number): string | number {
  if (daysLeft > 0) return daysLeft
  return daysLeft === 0 ? 'Last day' : 'Closed'
}

function basisText(row: FastDsRow): string {
  if (row.value_inr == null) return 'Neither a cost nor a quote is available'
  if (row.market_value_inr == null) return 'Cost (no market quote for that day)'
  if (row.cost_inr == null) return 'Market value (cost unknown)'
  return row.basis === 'market' ? 'Market value: average of the high and low quote' : 'Cost, at least the market value'
}

function LotList({ report, valuedOn }: Readonly<{ report: FastDsReport; valuedOn: string }>) {
  if (report.rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No lots were held on {valuedOn}, so there is nothing to value.</p>
  }
  return (
    <ul className="divide-y divide-[var(--hairline-1)] text-sm" aria-label={`Lots valued on ${valuedOn}`}>
      {report.rows.map((row) => (
        <li key={row.lot_id} className="flex items-center justify-between gap-3 py-2">
          <span className="min-w-0 text-muted-foreground">
            {row.symbol} vest of {formatDate(row.acquired_on)}, {formatShares(row.shares)} shares
            <span className="block text-[11px] text-text-tertiary">{basisText(row)}</span>
            {row.flags.length > 0 && (
              <span className="block text-[11px] text-app-orange">{flagLabels(row.flags).join(', ')}</span>
            )}
          </span>
          {row.value_inr == null ? <span>--</span> : <Money value={row.value_inr} formatter={formatInrWhole} />}
        </li>
      ))}
    </ul>
  )
}

/** FAST-DS 2026: what the lots were worth on the valuation date, and the declaration deadline. */
export default function FastDsCard({ query }: Readonly<{ query: UseQueryResult<FastDsReport> }>) {
  const headingId = useId()
  const report = query.data
  const rate = report?.rows.find((row) => row.rate != null)
  const valuedOn = report ? formatDate(report.valuation_date) : ''
  const closesOn = report ? formatDate(report.deadline) : ''

  return (
    <section aria-labelledby={headingId} className="ledger-panel space-y-4 p-4 sm:p-5">
      <div className="space-y-1">
        <h2 id={headingId} className="text-base font-semibold">FAST-DS 2026 check</h2>
        <p className="text-xs leading-5 text-muted-foreground">
          Only relevant if an earlier return left these shares out of Schedule FA.
          {report && ` Declarations under the scheme close on ${closesOn}; holdings are valued as on ${valuedOn}.`}
        </p>
      </div>

      {query.isLoading && <PanelSkeleton blockClassName="h-24" />}
      {query.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-app-red">
          <span>The FAST-DS valuation could not be loaded.</span>
          <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>Retry</Button>
        </div>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              title={`Holdings on ${valuedOn}`}
              value={formatInrWhole(report.total_value_inr)}
              icon={Landmark}
              color="blue"
              subtitle={`${report.rows.length} ${report.rows.length === 1 ? 'lot' : 'lots'}`}
            />
            <MetricCard
              title={`Days to ${closesOn}`}
              value={deadlineText(report.days_left)}
              icon={CalendarClock}
              color={report.days_left > 30 ? 'teal' : 'orange'}
              subtitle="Declaration deadline"
            />
          </div>
          <LotList report={report} valuedOn={valuedOn} />
          {!report.complete && (
            <p className="text-xs text-app-orange">
              Some lots lack a cost or a {valuedOn} quote, so their value uses the side that is known.
            </p>
          )}
          {report.warnings.map((warning, index) => (
            <p key={`${index}-${warning}`} className="text-xs text-app-orange">{warning}</p>
          ))}
          <p className="text-xs leading-5 text-muted-foreground">
            Each lot counts at the higher of its cost and that day&apos;s average of the high and low
            quote{rate?.rate != null && <>, at {formatInr(rate.rate)} per {rate.currency}</>} ({report.rate_basis}).
            Category 2 (assets bought from income already taxed but left out of Schedule FA, up to
            {' '}{formatInrWhole(CATEGORY_2_CAP_INR)}) carries a flat {formatInrWhole(CATEGORY_2_FEE_INR)} fee;
            category 1 costs {CATEGORY_1_RATE_PERCENT}% of the value. Whether either applies is for a CA to confirm.{' '}
            <a href={PORTAL_NEWS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
              Income Tax portal news
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </p>
          <p className="text-xs font-medium text-text-secondary">{COMPUTATION_NOTE}</p>
        </>
      )}
    </section>
  )
}
