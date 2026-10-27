import { useMemo, useState } from 'react'

import { useAccountClassifications } from '@/hooks/api/useAccountClassifications'
import type { AccountBalanceHealth, BalanceChecksSummary } from '@/services/api/balanceChecks'

import { accountTypeLookup, groupForDisplay, startsOwed } from '../balanceCheckUtils'
import { useBalanceCheckActions } from '../useBalanceCheckActions'
import BalanceAccountRow from './BalanceAccountRow'

const QUIET_TOGGLE_CLASS =
  'inline-flex min-h-11 items-center px-2 text-xs font-medium text-app-blue hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] lg:pointer-fine:min-h-8'

interface BalanceAccountListProps {
  readonly summary: BalanceChecksSummary
}

/**
 * The account rows, one open at a time, with idle and closed accounts behind
 * one toggle. Account types come from the user's classifications and only
 * decide where the Owed switch starts; until they load it starts off.
 */
export default function BalanceAccountList({ summary }: BalanceAccountListProps) {
  const actions = useBalanceCheckActions()
  const classifications = useAccountClassifications()
  const [openAccount, setOpenAccount] = useState<string | null>(null)
  const [showQuiet, setShowQuiet] = useState(false)
  const typeOf = useMemo(() => accountTypeLookup(classifications.data), [classifications.data])
  const { primary, quiet } = groupForDisplay(summary.accounts)

  const renderRow = (health: AccountBalanceHealth) => (
    <BalanceAccountRow
      key={health.account}
      health={health}
      tolerance={summary.tolerance}
      asOf={summary.as_of}
      owedByDefault={startsOwed(health, typeOf(health.account))}
      isOpen={openAccount === health.account}
      onToggle={() =>
        setOpenAccount((current) => (current === health.account ? null : health.account))
      }
      actions={actions}
    />
  )

  return (
    <>
      {primary.length > 0 && (
        <ul className="divide-y divide-[var(--hairline-1)]">{primary.map(renderRow)}</ul>
      )}

      {quiet.length > 0 && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setShowQuiet((value) => !value)}
            aria-expanded={showQuiet}
            className={QUIET_TOGGLE_CLASS}
          >
            {showQuiet
              ? 'Hide idle and closed accounts'
              : `Show ${quiet.length} idle or closed ${quiet.length === 1 ? 'account' : 'accounts'}`}
          </button>
          {showQuiet && (
            <ul className="divide-y divide-[var(--hairline-1)]">{quiet.map(renderRow)}</ul>
          )}
        </div>
      )}
    </>
  )
}
