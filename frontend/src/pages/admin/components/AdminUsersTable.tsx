import { useMemo } from 'react'

import { DataTable, type DataTableColumn } from '@/components/ui'
import type { AdminAccount, AdminStats } from '@/services/api/admin'

import { PROVIDER_LABELS, formatCount, formatDay, timeValue } from '../adminFormat'

const COLUMNS: DataTableColumn<AdminAccount>[] = [
  {
    key: 'email',
    header: 'Account',
    align: 'left',
    sortable: true,
    sortType: 'text',
    mobilePrimary: true,
    mobileLabel: '',
    cell: (row) => (
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-foreground">{row.email}</span>
        <span className="text-xs text-muted-foreground">{PROVIDER_LABELS[row.provider] ?? row.provider}</span>
      </span>
    ),
  },
  {
    key: 'last_active',
    header: 'Last active',
    align: 'left',
    sortable: true,
    sortValue: (row) => timeValue(row.last_active),
    cell: (row) => formatDay(row.last_active),
  },
  {
    key: 'created_at',
    header: 'Joined',
    align: 'left',
    sortable: true,
    sortValue: (row) => timeValue(row.created_at),
    cell: (row) => formatDay(row.created_at),
  },
  {
    key: 'transactions',
    header: 'Transactions',
    align: 'right',
    sortable: true,
    cell: (row) => formatCount(row.transactions),
  },
  { key: 'imports', header: 'Imports', align: 'right', sortable: true, cell: (row) => formatCount(row.imports) },
  {
    key: 'ai_calls_30d',
    header: 'AI calls, 30 days',
    align: 'right',
    sortable: true,
    cell: (row) => formatCount(row.ai_calls_30d),
  },
]

/**
 * Every account, most recently active first: a masked email, how it signs in,
 * and activity counts. No names, amounts or transactions.
 */
export default function AdminUsersTable({ users }: Readonly<{ users: AdminStats['users'] }>) {
  const shown = useMemo(() => users.list, [users.list])
  return (
    <section aria-labelledby="admin-users" className="ledger-panel space-y-3 p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="admin-users" className="text-sm font-semibold text-foreground">
          Accounts
        </h2>
        <p className="text-xs text-muted-foreground">
          {formatCount(users.active_30d)} active in 30 days, {formatCount(users.active_7d)} in 7.
          {users.total > shown.length && ` Showing the ${formatCount(shown.length)} most recent.`}
        </p>
      </header>
      <DataTable
        columns={COLUMNS}
        rows={shown}
        rowKey={(row) => String(row.id)}
        initialSort={{ key: 'last_active', dir: 'desc' }}
        ariaLabel="Accounts with masked emails and activity counts"
        stickyHeader
        maxHeightClass="max-h-[28rem]"
        mobileCards
        emptyState={<p className="py-6 text-center text-sm text-muted-foreground">No accounts yet.</p>}
      />
      <p className="text-xs text-muted-foreground">
        Active means a sign-in, an import or an AI call. Emails are masked; no account&apos;s
        transactions or amounts are shown.
      </p>
    </section>
  )
}
