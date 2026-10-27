import { Scale } from 'lucide-react'

import { PanelSkeleton } from '@/components/shared/LoadingSkeleton'
import { Button } from '@/components/ui'
import { useBalanceChecks } from '@/hooks/api/useBalanceChecks'
import type { AccountBalanceHealth } from '@/services/api/balanceChecks'

import { STATUS_META, STATUS_ORDER } from '../balanceCheckUtils'
import BalanceAccountList from './BalanceAccountList'
import BalanceStatusDot from './BalanceStatusDot'

const HEADING_ID = 'balance-checks-heading'

function Header() {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Scale className="size-4 shrink-0 text-app-indigo" aria-hidden />
        <h2 id={HEADING_ID} className="text-sm font-semibold text-foreground">
          Balance checks
        </h2>
      </div>
      <p className="text-xs leading-5 text-text-tertiary">
        Type the balance your bank or card app shows and the ledger&apos;s own balance for that
        day is checked against it, so you know which accounts you can trust.
      </p>
    </div>
  )
}

function StatusTally({ accounts }: { readonly accounts: readonly AccountBalanceHealth[] }) {
  const counts = STATUS_ORDER.map((status) => ({
    status,
    count: accounts.filter((account) => account.status === status).length,
  })).filter((entry) => entry.count > 0)

  return (
    <ul className="flex flex-wrap gap-2" aria-label="Accounts by status">
      {counts.map(({ status, count }) => (
        <li
          key={status}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline-2)] px-2.5 py-1 text-xs text-foreground"
        >
          <BalanceStatusDot status={status} className="size-2" />
          {`${count} ${STATUS_META[status].tally}`}
        </li>
      ))}
    </ul>
  )
}

/**
 * Does each account match the bank? One row per account with a freshness dot
 * (green matched, red off by the shown amount, yellow rows added since the
 * last check, grey idle for 30 days, hollow never checked), opening to record,
 * edit or delete checks and to see which months carry rows. Idle and closed
 * accounts sit behind one toggle so the list leads with what needs attention.
 */
export default function BalanceChecksPanel() {
  const query = useBalanceChecks()

  if (query.isPending) return <PanelSkeleton blocks={3} blockClassName="h-12" />

  if (query.isError) {
    return (
      <section className="ledger-panel space-y-3 p-4" aria-labelledby={HEADING_ID}>
        <Header />
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p className="min-w-0 flex-1 text-xs text-app-red">
            Could not load your balance checks. The rest of this page is unaffected.
          </p>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      </section>
    )
  }

  const summary = query.data
  if (summary.accounts.length === 0) return null

  return (
    <section className="ledger-panel space-y-4 p-4" aria-labelledby={HEADING_ID}>
      <Header />
      <StatusTally accounts={summary.accounts} />
      <BalanceAccountList summary={summary} />
    </section>
  )
}
