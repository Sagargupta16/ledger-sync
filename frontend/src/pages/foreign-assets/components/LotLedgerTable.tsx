import { useId } from 'react'

import { Link } from 'react-router'

import { DataTable, Money, type DataTableColumn } from '@/components/ui'
import { ROUTES } from '@/constants'
import { formatDate } from '@/lib/formatters'
import { FX_SOURCE_LABEL, formatInr } from '@/lib/rsuTaxFx'
import type { ForeignAssetLot } from '@/services/api/rsuTax'

import { flagLabels, formatShares, splitNote } from '../foreignAssetsLabels'

function inr(value: number | null) {
  return value == null ? <span className="text-muted-foreground">--</span> : <Money value={value} formatter={formatInr} />
}

const COLUMNS: readonly DataTableColumn<ForeignAssetLot>[] = [
  {
    key: 'acquired_on',
    header: 'Acquired',
    mobilePrimary: true,
    sortable: true,
    sortType: 'text',
    cell: (lot) => (
      <div className="min-w-0">
        <p className="font-medium text-foreground">{formatDate(lot.acquired_on)}</p>
        <p className="text-xs text-muted-foreground">
          {lot.symbol}, {FX_SOURCE_LABEL[lot.fx_source]}
        </p>
        {lot.splits.length > 0 && (
          <p className="text-[11px] text-text-tertiary">{splitNote(lot.splits)}</p>
        )}
        {lot.flags.length > 0 && (
          <p className="text-[11px] text-app-orange">{flagLabels(lot.flags).join(', ')}</p>
        )}
      </div>
    ),
  },
  {
    key: 'held_quantity',
    header: 'Shares received',
    align: 'right',
    cell: (lot) => (
      <span className="inline-flex flex-col items-end">
        <span>{formatShares(lot.held_quantity)}</span>
        <span className="text-[11px] text-text-tertiary">
          {lot.split_factor === 1
            ? `of ${formatShares(lot.gross_quantity)} vested`
            : `${formatShares(lot.held_quantity * lot.split_factor)} after splits`}
        </span>
      </span>
    ),
  },
  { key: 'sold_quantity', header: 'Sold', align: 'right', cell: (lot) => formatShares(lot.sold_quantity) },
  { key: 'remaining_quantity', header: 'Held now', align: 'right', cell: (lot) => formatShares(lot.remaining_quantity) },
  { key: 'cost_per_share_inr', header: 'Cost per vest share', align: 'right', cell: (lot) => inr(lot.cost_per_share_inr) },
  { key: 'initial_value_inr', header: 'Initial value', align: 'right', cell: (lot) => inr(lot.initial_value_inr) },
]

/** One lot per vest that has happened: what it cost in rupees and what is left of it. */
export default function LotLedgerTable({ lots }: Readonly<{ lots: ForeignAssetLot[] }>) {
  const headingId = useId()
  const estimated = lots.some((lot) => lot.quantity_estimated)
  const split = lots.some((lot) => lot.split_factor !== 1)
  return (
    <section aria-labelledby={headingId} className="ledger-panel space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={headingId} className="text-base font-semibold">Lot ledger</h2>
        <Link
          to={ROUTES.SETTINGS}
          className="inline-flex min-h-11 items-center text-xs text-primary hover:underline lg:pointer-fine:min-h-0"
        >
          Edit vests and tax rates in Settings
        </Link>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Cost per vest share is the vest&apos;s tax value: the employer&apos;s perquisite figure, else the
        SBI TT buying rate you entered, else the ECB rate (an approximation).
        {estimated && ' Lots without actual received units use the 30% tax plus 4% cess estimate until you enter them.'}
        {split && ' Sold and Held now count shares as they stand today, after the stock splits shown.'}
      </p>
      <DataTable
        columns={COLUMNS}
        rows={lots}
        rowKey={(lot) => lot.lot_id}
        initialSort={{ key: 'acquired_on', dir: 'asc' }}
        ariaLabel="RSU lots"
        mobileCards
      />
    </section>
  )
}
