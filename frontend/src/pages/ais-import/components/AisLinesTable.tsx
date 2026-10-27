import { DataTable, Money, type DataTableColumn } from '@/components/ui'
import type { AisLine } from '@/lib/tax/aisTypes'

import { formatAisDate, HEAD_LABEL } from '../aisImportLabels'

interface Props {
  readonly lines: readonly AisLine[]
  readonly ariaLabel: string
  readonly emptyText: string
  readonly showTax?: boolean
  readonly showHead?: boolean
  readonly showQuantity?: boolean
}

export default function AisLinesTable({ lines, ariaLabel, emptyText, showTax, showHead, showQuantity }: Props) {
  const columns: DataTableColumn<AisLine>[] = [
    {
      key: 'source',
      header: 'Source',
      sortable: true,
      sortType: 'text',
      sortValue: (line) => line.source,
      mobilePrimary: true,
      // Wrapped on a phone, where a title tooltip does not exist; one line from `sm` up.
      cell: (line) => (
        <span className="block min-w-0">
          <span className="block font-medium text-foreground [overflow-wrap:anywhere] sm:truncate" title={line.source}>{line.source}</span>
          <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere] sm:truncate" title={line.description}>
            {[line.code, line.description].filter(Boolean).join(' · ')}
          </span>
        </span>
      ),
    },
    ...(showHead
      ? [{ key: 'head', header: 'Head', sortable: true, sortType: 'text' as const, sortValue: (line: AisLine) => HEAD_LABEL[line.head], cell: (line: AisLine) => HEAD_LABEL[line.head] }]
      : []),
    {
      key: 'date',
      header: 'Date',
      sortable: true,
      sortType: 'text',
      // An undated line (an annual figure) sorts after every dated one in the default ascending view.
      sortValue: (line) => line.date ?? '9999-12-31',
      cell: (line) => <span className="whitespace-nowrap">{formatAisDate(line.date)}</span>,
    },
    ...(showQuantity
      ? [{ key: 'quantity', header: 'Units', align: 'right' as const, sortable: true, sortValue: (line: AisLine) => line.quantity ?? 0, cell: (line: AisLine) => line.quantity ?? '--' }]
      : []),
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sortable: true,
      sortValue: (line) => line.amount,
      cell: (line) => <Money value={line.amount} />,
    },
    ...(showTax
      ? [{
          key: 'tax',
          header: 'Tax',
          align: 'right' as const,
          sortable: true,
          sortValue: (line: AisLine) => line.tax ?? 0,
          cell: (line: AisLine) => (line.tax === null ? '--' : <Money value={line.tax} />),
        }]
      : []),
  ]

  return (
    <DataTable
      columns={columns}
      rows={lines}
      rowKey={(line) => line.key}
      ariaLabel={ariaLabel}
      initialSort={{ key: 'date', dir: 'asc' }}
      mobileCards
      stickyHeader
      maxHeightClass="max-h-[28rem]"
      emptyState={<p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>}
    />
  )
}
