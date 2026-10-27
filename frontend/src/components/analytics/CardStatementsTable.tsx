import { DataTable, Money, type DataTableColumn } from '@/components/ui'
import { formatCurrency } from '@/lib/formatters'
import type { CardCycleCard } from '@/services/api/cardCycles'

import { dueInLabel, isUnpaid, shortDate, STATUS_LABEL, STATUS_TONE } from './cardCyclesSummary'

function StatusBadge({ card }: Readonly<{ card: CardCycleCard }>) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[card.status]}`}
    >
      {STATUS_LABEL[card.status]}
    </span>
  )
}

/** When the latest statement was settled, or how long until (or since) it is due. */
function dueHint(card: CardCycleCard): string {
  if (card.status === 'nothing_due') return 'Nothing to pay'
  if (card.status !== 'paid') return dueInLabel(card.days_to_due)
  if (!card.paid_on) return 'Paid'
  const late = card.paid_on > card.due_date ? ', late' : ''
  const elsewhere =
    card.paying_account && !card.paid_from_paying_account ? `, not from ${card.paying_account}` : ''
  return `Paid ${shortDate(card.paid_on)}${late}${elsewhere}`
}

const COLUMNS: readonly DataTableColumn<CardCycleCard>[] = [
  {
    key: 'name',
    header: 'Card',
    sortable: true,
    sortType: 'text',
    mobilePrimary: true,
    cell: (card) => (
      <div className="min-w-0">
        <p className="font-medium text-foreground sm:truncate" title={card.name}>
          {card.name}
        </p>
        <p className="text-[11px] text-text-tertiary">
          {card.paying_account ? `Paid from ${card.paying_account}` : 'No paying account set'}
        </p>
      </div>
    ),
  },
  {
    key: 'statement',
    header: 'Statement',
    mobileLabel: 'Statement period',
    cell: (card) => (
      <span className="whitespace-nowrap">
        {shortDate(card.cycles[1].period_start)} - {shortDate(card.last_statement_date)}
      </span>
    ),
  },
  {
    key: 'due_date',
    header: 'Due',
    sortable: true,
    sortType: 'text',
    sortValue: (card) => card.due_date,
    cell: (card) => (
      <span className="inline-flex flex-col items-end sm:items-start">
        <span className="whitespace-nowrap">{shortDate(card.due_date)}</span>
        <span className="text-[11px] text-text-tertiary">{dueHint(card)}</span>
      </span>
    ),
  },
  {
    key: 'billed_amount',
    header: 'Billed',
    align: 'right',
    sortable: true,
    cell: (card) => (
      <span className="inline-flex flex-col items-end">
        <Money value={card.billed_amount} />
        {isUnpaid(card.status) && card.paid_amount > 0 && (
          <span className="text-[11px] text-text-tertiary">
            {formatCurrency(card.due_amount)} left
          </span>
        )}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    cell: (card) => <StatusBadge card={card} />,
  },
  {
    key: 'unbilled_amount',
    header: 'Unbilled',
    align: 'right',
    sortable: true,
    mobileLabel: 'Unbilled so far',
    cell: (card) => (
      <span className="inline-flex flex-col items-end">
        <Money value={card.unbilled_amount} muted />
        <span className="text-[11px] text-text-tertiary">
          Billed {shortDate(card.next_statement_date)}, due {shortDate(card.next_due_date)}
        </span>
      </span>
    ),
  },
]

/** One row per card with cycles; below `sm` each row is a stacked card. */
export default function CardStatementsTable({ cards }: Readonly<{ cards: readonly CardCycleCard[] }>) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={cards}
      rowKey={(card) => String(card.account_id)}
      initialSort={{ key: 'due_date', dir: 'asc' }}
      ariaLabel="Credit card statements"
      mobileCards
    />
  )
}
