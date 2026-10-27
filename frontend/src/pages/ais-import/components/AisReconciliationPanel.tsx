import { RefreshCw } from 'lucide-react'

import { Button, DataTable, Money, Spinner, type DataTableColumn } from '@/components/ui'
import type { AisReconciliation } from '@/lib/tax/aisReconcile'
import type { ReconLedgerRow } from '@/lib/tax/aisTypes'

import { formatAisDate, HEAD_LABEL } from '../aisImportLabels'
import AisLinesTable from './AisLinesTable'

interface Props {
  readonly reconciliation: AisReconciliation | null
  readonly isLoading: boolean
  readonly isError: boolean
  readonly onRetry: () => void
}

const LEDGER_COLUMNS: DataTableColumn<ReconLedgerRow>[] = [
  {
    key: 'category',
    header: 'Ledger row',
    sortable: true,
    sortType: 'text',
    sortValue: (row) => `${row.category} ${row.subcategory}`,
    mobilePrimary: true,
    // Wrapped on a phone, where a title tooltip does not exist; one line from `sm` up.
    cell: (row) => (
      <span className="block min-w-0">
        <span className="block font-medium text-foreground [overflow-wrap:anywhere] sm:truncate">
          {[row.category, row.subcategory].filter(Boolean).join(' · ')}
        </span>
        <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere] sm:truncate" title={row.note}>
          {[row.account, row.note].filter(Boolean).join(' · ')}
        </span>
      </span>
    ),
  },
  {
    key: 'kind',
    header: 'Head',
    sortable: true,
    sortType: 'text',
    sortValue: (row) => (row.kind ? HEAD_LABEL[row.kind] : 'Classified income'),
    cell: (row) => (row.kind ? HEAD_LABEL[row.kind] : 'Classified income'),
  },
  {
    key: 'date',
    header: 'Date',
    sortable: true,
    sortType: 'text',
    sortValue: (row) => row.date,
    cell: (row) => <span className="whitespace-nowrap">{formatAisDate(row.date)}</span>,
  },
  { key: 'amount', header: 'Amount', align: 'right', sortable: true, sortValue: (row) => row.amount, cell: (row) => <Money value={row.amount} /> },
]

const total = (amounts: readonly number[]) => amounts.reduce((sum, amount) => sum + amount, 0)

export default function AisReconciliationPanel({ reconciliation, isLoading, isError, onRetry }: Props) {
  return (
    <section aria-labelledby="ais-recon-title" className="ledger-panel space-y-5 p-4 sm:p-5">
      <div>
        <h2 id="ais-recon-title" className="text-base font-semibold">Statement against your ledger</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Salary matches by date (the ledger holds take-home pay). Other lines match a credit equal to
          the gross, or the gross less TDS, within 10 days; an annual interest figure matches one
          account&apos;s credits that add up to it. A computation aid: review each line yourself.
        </p>
      </div>

      {isLoading && <Spinner label="Reading this year's ledger income..." />}
      {isError && (
        <div role="alert" className="flex flex-col gap-3 text-sm text-app-red sm:flex-row sm:items-center">
          <span>The ledger income for this year could not be loaded.</span>
          <Button variant="secondary" size="sm" icon={<RefreshCw className="size-4" aria-hidden="true" />} onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}

      {reconciliation && (
        <>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              In the AIS, not in your ledger
              <span className="ml-2 font-normal text-muted-foreground">
                {reconciliation.aisUnmatched.length} of {reconciliation.aisCount} lines,{' '}
                <Money value={total(reconciliation.aisUnmatched.map((line) => line.amount))} />
              </span>
            </h3>
            <p className="text-xs leading-5 text-muted-foreground">
              Income the tax department knows about that the ledger may have missed, such as interest
              on a deposit that is never paid out.
            </p>
            <AisLinesTable
              lines={reconciliation.aisUnmatched}
              ariaLabel="AIS lines with no matching ledger income"
              emptyText="Every AIS income line has a matching ledger credit."
              showTax
              showHead
            />
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              In your ledger, not in the AIS
              <span className="ml-2 font-normal text-muted-foreground">
                {reconciliation.ledgerUnmatched.length} of {reconciliation.ledgerCount} rows,{' '}
                <Money value={total(reconciliation.ledgerUnmatched.map((row) => row.amount))} />
              </span>
            </h3>
            <p className="text-xs leading-5 text-muted-foreground">
              Salary, interest, dividend, rent and gain rows, plus rows you classified as taxable or
              investment income. Income here still belongs in your return.
            </p>
            <DataTable
              columns={LEDGER_COLUMNS}
              rows={reconciliation.ledgerUnmatched}
              rowKey={(row) => row.id}
              ariaLabel="Ledger income with no AIS line"
              initialSort={{ key: 'date', dir: 'asc' }}
              mobileCards
              stickyHeader
              maxHeightClass="max-h-[28rem]"
              emptyState={<p className="py-6 text-center text-sm text-muted-foreground">Every reportable ledger row has an AIS line.</p>}
            />
          </div>

          {reconciliation.heads.length > 0 && (
            <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-3 lg:grid-cols-4">
              {reconciliation.heads.map((head) => (
                <div key={head.head} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{HEAD_LABEL[head.head]}</dt>
                  <dd className="mt-1 text-sm">AIS <Money value={head.ais} /></dd>
                  <dd className="text-xs text-muted-foreground">Ledger <Money value={head.ledger} /></dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </section>
  )
}
