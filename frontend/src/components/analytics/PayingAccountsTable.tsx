import { DataTable, Money, type DataTableColumn } from '@/components/ui'
import type { PayingAccountCash } from '@/services/api/cardCycles'

const COLUMNS: readonly DataTableColumn<PayingAccountCash>[] = [
  {
    key: 'name',
    header: 'Paying account',
    sortable: true,
    sortType: 'text',
    mobilePrimary: true,
    cell: (account) => (
      <div className="min-w-0">
        <p className="font-medium text-foreground sm:truncate" title={account.name}>
          {account.name}
        </p>
        <p className="text-[11px] text-text-tertiary">Pays {account.cards.join(', ')}</p>
      </div>
    ),
  },
  {
    key: 'balance',
    header: 'Balance',
    align: 'right',
    sortable: true,
    cell: (account) => <Money value={account.balance} />,
  },
  {
    key: 'upcoming_dues',
    header: 'Card dues',
    align: 'right',
    sortable: true,
    mobileLabel: 'Unpaid statements',
    cell: (account) => <Money value={account.upcoming_dues} />,
  },
  {
    key: 'cash_after_dues',
    header: 'After dues',
    align: 'right',
    sortable: true,
    mobileLabel: 'Cash after dues',
    cell: (account) => (
      <Money
        value={account.cash_after_dues}
        bold
        className={account.cash_after_dues < 0 ? 'text-app-red' : undefined}
      />
    ),
  },
  {
    key: 'unbilled',
    header: 'Unbilled',
    align: 'right',
    sortable: true,
    mobileLabel: 'Unbilled, not yet due',
    cell: (account) => <Money value={account.unbilled} muted />,
  },
]

/** Cash in each account that pays cards, before and after its cards' unpaid statements. */
export default function PayingAccountsTable({
  accounts,
}: Readonly<{ accounts: readonly PayingAccountCash[] }>) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={accounts}
      rowKey={(account) => String(account.account_id)}
      ariaLabel="Cash in paying accounts after card dues"
      mobileCards
    />
  )
}
