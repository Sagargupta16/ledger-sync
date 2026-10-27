import { useId } from 'react'

import type { UseQueryResult } from '@tanstack/react-query'

import EmptyState from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { Button, DataTable, Money, type DataTableColumn } from '@/components/ui'
import { formatDate } from '@/lib/formatters'
import { formatInrWhole } from '@/lib/rsuTaxFx'
import type { ScheduleFaReport, ScheduleFaRow } from '@/services/api/rsuTax'

import { COMPUTATION_NOTE, flagLabels, formatShares } from '../foreignAssetsLabels'

function rupees(value: number | null) {
  return value == null ? <span className="text-muted-foreground">--</span> : <Money value={value} formatter={formatInrWhole} />
}

const COLUMNS: readonly DataTableColumn<ScheduleFaRow>[] = [
  {
    key: 'lot',
    header: 'Lot',
    mobilePrimary: true,
    sortable: true,
    sortType: 'text',
    sortValue: (row) => row.acquired_on,
    cell: (row) => (
      <div className="min-w-0">
        <p className="font-medium text-foreground">{row.entity_name}</p>
        <p className="text-xs text-muted-foreground">
          {row.symbol}, acquired {formatDate(row.acquired_on)}, {formatShares(row.shares_at_start)} to{' '}
          {formatShares(row.shares_at_end)} shares
        </p>
        {row.flags.length > 0 && (
          <p className="text-[11px] text-app-orange">{flagLabels(row.flags).join(', ')}</p>
        )}
      </div>
    ),
  },
  { key: 'initial', header: 'Initial value', align: 'right', cell: (row) => rupees(row.initial_value_inr) },
  {
    key: 'peak',
    header: 'Peak value',
    align: 'right',
    cell: (row) => (
      <span className="inline-flex flex-col items-end">
        {rupees(row.peak_value_inr)}
        {row.peak_date && <span className="text-[11px] text-text-tertiary">{formatDate(row.peak_date)}</span>}
      </span>
    ),
  },
  { key: 'closing', header: 'Closing value', align: 'right', cell: (row) => rupees(row.closing_value_inr) },
  { key: 'paid', header: 'Dividends credited', align: 'right', cell: (row) => rupees(row.dividends_inr) },
  { key: 'proceeds', header: 'Sale proceeds', align: 'right', cell: (row) => rupees(row.sale_proceeds_inr) },
]

interface ScheduleFaSectionProps {
  query: UseQueryResult<ScheduleFaReport>
  year: number | null
}

/** Table A3 rows (foreign equity interest) for the chosen calendar year. */
export default function ScheduleFaSection({ query, year }: Readonly<ScheduleFaSectionProps>) {
  const headingId = useId()
  const report = query.data
  const stale = query.isPlaceholderData

  return (
    <section aria-labelledby={headingId} aria-busy={query.isFetching || undefined} className="ledger-panel space-y-4 p-4 sm:p-5">
      <div className="space-y-1">
        <h2 id={headingId} className="text-base font-semibold">
          Schedule FA, calendar year {year ?? ''}
        </h2>
        {report && <p className="text-xs leading-5 text-muted-foreground">{report.return_label}.</p>}
      </div>

      {query.isLoading && <TableSkeleton rows={3} />}
      {query.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-app-red">
          <span>The worksheet could not be built. The lot ledger below is unaffected.</span>
          <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>Retry</Button>
        </div>
      )}

      {report && (
        <div className={stale ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {report.warnings.map((warning, index) => (
            <p key={`${index}-${warning}`} className="mb-2 text-xs text-app-orange">{warning}</p>
          ))}
          {report.rows.length === 0 ? (
            <EmptyState
              variant="compact"
              title={`No lots held in ${report.calendar_year}`}
              description="Lots appear for every year in which any of their shares were held."
            />
          ) : (
            <DataTable
              columns={COLUMNS}
              rows={report.rows}
              rowKey={(row) => row.lot_id}
              ariaLabel={`Schedule FA rows for calendar year ${report.calendar_year}`}
              mobileCards
            />
          )}
          <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Initial value</dt>
              <dd className="mt-1">{rupees(report.totals.initial_value_inr)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Closing value</dt>
              <dd className="mt-1">{rupees(report.totals.closing_value_inr)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Dividends credited</dt>
              <dd className="mt-1">{rupees(report.totals.dividends_inr)}</dd>
              <dd className="text-[11px] text-text-tertiary">
                Foreign tax withheld {formatInrWhole(report.totals.tax_withheld_inr)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Sale proceeds</dt>
              <dd className="mt-1">{rupees(report.totals.sale_proceeds_inr)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Peak and closing values use the stock&apos;s daily closes at the {report.rate_basis},
            with share counts as on each day, so a stock split never shrinks a lot&apos;s value.
            Initial value is each lot&apos;s tax value (its cost) for the shares held. Foreign tax
            credit on dividends is claimed through Schedules FSI and TR with Form 67 for AY 2026-27
            (Form 44 from tax year 2026-27). If the shares sit in a broker account, a CA may also
            report that account in Table A2. {COMPUTATION_NOTE}
          </p>
        </div>
      )}
    </section>
  )
}
