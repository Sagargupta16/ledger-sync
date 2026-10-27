import { DataTable, Money, type DataTableColumn } from '@/components/ui'
import { formatCurrency, formatDate, formatPercent } from '@/lib/formatters'
import type { MfHolding } from '@/services/api/cas'

import {
  SOURCE_LABELS,
  XIRR_HINTS,
  XIRR_NOTES,
  formatNav,
  formatUnits,
  isUnderOneYear,
} from '../mfHoldingsUtils'

function SchemeCell({ holding }: Readonly<{ holding: MfHolding }>) {
  const where = [holding.amc, holding.folio ? `Folio ${holding.folio}` : 'Demat'].filter(Boolean)
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-foreground [overflow-wrap:anywhere]">{holding.scheme_name}</p>
      <p className="mt-0.5 text-xs text-text-tertiary">
        {where.join(', ')} ({SOURCE_LABELS[holding.source]})
      </p>
    </div>
  )
}

function NavCell({ holding }: Readonly<{ holding: MfHolding }>) {
  if (holding.nav === null) return <span className="text-muted-foreground">-</span>
  return (
    <div className="text-right">
      <span className="ledger-figure">{formatNav(holding.nav)}</span>
      <p className="text-xs text-text-tertiary">
        {holding.nav_date ? formatDate(holding.nav_date) : ''}
        {holding.nav_source === 'statement' ? ' (statement)' : ''}
      </p>
    </div>
  )
}

function GainCell({ holding }: Readonly<{ holding: MfHolding }>) {
  if (holding.gain === null) return <span className="text-muted-foreground">-</span>
  const tone = holding.gain >= 0 ? 'text-app-green' : 'text-app-red'
  return (
    <div className="text-right">
      <Money value={holding.gain} className={tone} formatter={(v) => `${v >= 0 ? '+' : ''}${formatCurrency(v)}`} />
      {holding.gain_pct !== null && (
        <p className={`text-xs ${tone}`}>{formatPercent(holding.gain_pct, true)}</p>
      )}
    </div>
  )
}

function XirrCell({ holding }: Readonly<{ holding: MfHolding }>) {
  if (holding.xirr === null) {
    const note = holding.xirr_note
    // The hint is visible text for phones; the tooltip carries the full reason on desktop.
    return (
      <div className="text-right" title={note ? XIRR_NOTES[note] : undefined}>
        <span className="text-muted-foreground">-</span>
        {note && <p className="text-xs text-text-tertiary">{XIRR_HINTS[note]}</p>}
      </div>
    )
  }
  const young = isUnderOneYear(holding.xirr_since, holding.nav_date)
  return (
    <div className="text-right">
      <span className={`ledger-figure ${holding.xirr >= 0 ? 'text-app-green' : 'text-app-red'}`}>
        {formatPercent(holding.xirr, true)}
      </span>
      {young && <p className="text-xs text-text-tertiary">under 1 yr</p>}
    </div>
  )
}

const COLUMNS: DataTableColumn<MfHolding>[] = [
  {
    key: 'scheme_name',
    header: 'Scheme',
    sortable: true,
    sortType: 'text',
    mobilePrimary: true,
    cell: (holding) => <SchemeCell holding={holding} />,
  },
  {
    key: 'units',
    header: 'Units',
    align: 'right',
    sortable: true,
    cell: (holding) => <span className="ledger-figure">{formatUnits(holding.units)}</span>,
  },
  {
    key: 'nav',
    header: 'NAV',
    align: 'right',
    sortable: true,
    sortValue: (holding) => holding.nav ?? 0,
    cell: (holding) => <NavCell holding={holding} />,
  },
  {
    key: 'current_value',
    header: 'Value',
    align: 'right',
    sortable: true,
    sortValue: (holding) => holding.current_value ?? 0,
    cell: (holding) =>
      holding.current_value === null ? '-' : <Money value={holding.current_value} bold />,
  },
  {
    key: 'cost',
    header: 'Cost',
    align: 'right',
    sortable: true,
    sortValue: (holding) => holding.cost ?? 0,
    cell: (holding) => (holding.cost === null ? '-' : <Money value={holding.cost} muted />),
  },
  {
    key: 'gain',
    header: 'Gain',
    align: 'right',
    sortable: true,
    sortValue: (holding) => holding.gain ?? 0,
    cell: (holding) => <GainCell holding={holding} />,
  },
  {
    key: 'xirr',
    header: 'XIRR',
    align: 'right',
    sortable: true,
    sortValue: (holding) => holding.xirr ?? Number.NEGATIVE_INFINITY,
    cell: (holding) => <XirrCell holding={holding} />,
  },
]

export function MfHoldingsTable({ holdings }: Readonly<{ holdings: MfHolding[] }>) {
  return (
    <DataTable<MfHolding>
      columns={COLUMNS}
      rows={holdings}
      rowKey={(holding) => String(holding.id)}
      initialSort={{ key: 'current_value', dir: 'desc' }}
      ariaLabel="Mutual fund holdings at the latest NAV, with cost, gain and XIRR"
      mobileCards
    />
  )
}
