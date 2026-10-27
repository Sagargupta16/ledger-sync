import { useId, useState } from 'react'

import { Link2, Plus, Trash2 } from 'lucide-react'

import { Button, ConfirmDialog, DataTable, type DataTableColumn } from '@/components/ui'
import { useDeleteForeignAssetEvent } from '@/hooks/api/useRsuTax'
import { getApiErrorMessage } from '@/lib/errorUtils'
import { formatDate } from '@/lib/formatters'
import { formatInr, formatQuote } from '@/lib/rsuTaxFx'
import type { ForeignAssetEvent, LotLedger } from '@/services/api/rsuTax'

import { EVENT_ISSUE_LABEL, formatShares } from '../foreignAssetsLabels'
import EventForm from './EventForm'
import EventLinkForm from './EventLinkForm'

interface EventsPanelProps {
  ledger: LotLedger
  readOnly: boolean
}

interface RowActions {
  onDelete: (event: ForeignAssetEvent) => void
  onLink: (event: ForeignAssetEvent) => void
}

/** Issues a new vest or stock link fixes; an Indian stock is left out on purpose. */
const LINKABLE = new Set(['unlinked', 'before_vest', 'unknown_stock', 'no_shares_held'])

function detailText(event: ForeignAssetEvent, lotDate: Map<string, string>): string {
  if (event.kind !== 'sale') return `Dividend on ${event.symbol}`
  const from = event.lot_id ? lotDate.get(event.lot_id) : undefined
  return from ? `Sale from the vest of ${formatDate(from)}` : 'Sale with no vest linked'
}

function actionsColumn({ onDelete, onLink }: RowActions): DataTableColumn<ForeignAssetEvent> {
  return {
    key: 'actions',
    header: <span className="sr-only">Actions</span>,
    mobileLabel: '',
    align: 'right',
    cell: (event) => (
      <span className="inline-flex gap-1">
        {event.issue && LINKABLE.has(event.issue) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onLink(event)}
            aria-label={`${event.kind === 'sale' ? 'Link' : 'Change the stock of'} the ${event.kind} of ${formatDate(event.event_date)}`}
            icon={<Link2 className="size-4" aria-hidden="true" />}
          />
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(event)}
          aria-label={`Delete the ${event.kind} of ${formatDate(event.event_date)}`}
          className="text-app-red hover:bg-app-red/10 hover:text-app-red"
          icon={<Trash2 className="size-4" aria-hidden="true" />}
        />
      </span>
    ),
  }
}

function eventColumns(ledger: LotLedger, actions: RowActions | null) {
  const lotDate = new Map(ledger.lots.map((lot) => [lot.lot_id, lot.acquired_on]))
  const columns: DataTableColumn<ForeignAssetEvent>[] = [
    {
      key: 'event_date',
      header: 'Date',
      mobilePrimary: true,
      sortable: true,
      sortType: 'text',
      cell: (event) => (
        <div className="min-w-0">
          <p className="font-medium text-foreground">{formatDate(event.event_date)}</p>
          <p className="text-xs text-muted-foreground">{detailText(event, lotDate)}</p>
          {event.issue && <p className="text-[11px] text-app-orange">{EVENT_ISSUE_LABEL[event.issue]}</p>}
        </div>
      ),
    },
    { key: 'quantity', header: 'Shares', align: 'right', cell: (event) => (event.quantity == null ? '--' : formatShares(event.quantity)) },
    { key: 'gross_amount', header: 'Gross', align: 'right', cell: (event) => formatQuote(event.gross_amount, event.currency) },
    {
      key: 'tax_withheld',
      header: 'Tax withheld',
      align: 'right',
      cell: (event) => (event.tax_withheld == null ? '--' : formatQuote(event.tax_withheld, event.currency)),
    },
    {
      key: 'rate',
      header: 'Rate',
      align: 'right',
      cell: (event) => (event.fx_rate == null ? 'ECB of the day' : `${formatInr(event.fx_rate)} TTBR`),
    },
  ]
  if (actions) columns.push(actionsColumn(actions))
  return columns
}

/** Sales and dividends from the broker statement, which Schedule FA turns into rupees. */
export default function EventsPanel({ ledger, readOnly }: Readonly<EventsPanelProps>) {
  const headingId = useId()
  const [adding, setAdding] = useState(false)
  const [linking, setLinking] = useState<ForeignAssetEvent | null>(null)
  const [pending, setPending] = useState<ForeignAssetEvent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const remove = useDeleteForeignAssetEvent()
  const columns = eventColumns(ledger, readOnly ? null : { onDelete: setPending, onLink: setLinking })

  return (
    <section aria-labelledby={headingId} className="ledger-panel space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-base font-semibold">Sales and dividends</h2>
        {!readOnly && !adding && (
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)} icon={<Plus className="size-4" aria-hidden="true" />}>
            Add a sale or dividend
          </Button>
        )}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        {readOnly
          ? 'Demo mode is read-only, so records cannot be added, linked or removed here.'
          : 'Enter them from the stock-plan broker statement. A sale names the vest its shares came from; one marked as not counted can be linked again.'}
      </p>
      {adding && <EventForm ledger={ledger} onDone={() => setAdding(false)} />}
      {linking && <EventLinkForm key={linking.id} ledger={ledger} event={linking} onDone={() => setLinking(null)} />}
      {error && <p role="alert" className="text-xs text-app-red">{error}</p>}
      <DataTable
        columns={columns}
        rows={ledger.events}
        rowKey={(event) => String(event.id)}
        initialSort={{ key: 'event_date', dir: 'desc' }}
        ariaLabel="Sales and dividends"
        emptyState={<p className="py-4 text-center text-sm text-muted-foreground">No sales or dividends recorded.</p>}
        mobileCards
      />
      <ConfirmDialog
        open={pending != null}
        onOpenChange={(open) => !open && setPending(null)}
        title={`Delete this ${pending?.kind ?? 'record'}?`}
        description="It leaves the lot ledger and the Schedule FA rows. This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (!pending) return
          setError(null)
          remove.mutate(pending.id, {
            onError: (failure) => setError(getApiErrorMessage(failure, 'Could not delete. Try again.')),
          })
          setPending(null)
        }}
      />
    </section>
  )
}
