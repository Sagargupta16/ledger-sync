import { useState } from 'react'

import type { BalanceCheckResult } from '@/services/api/balanceChecks'

import { formatInr } from '../balanceCheckInput'
import { sharedGap } from '../balanceCheckUtils'
import type { BalanceCheckActions } from '../useBalanceCheckActions'
import BalanceCheckItem from './BalanceCheckItem'

interface BalanceCheckHistoryProps {
  /** Newest first. */
  readonly checks: readonly BalanceCheckResult[]
  readonly tolerance: number
  readonly today: string
  readonly actions: BalanceCheckActions
}

/** Older checks stay one tap away; the newest few decide the dot. */
const VISIBLE_CHECKS = 3

const LINK_CLASS =
  'inline-flex min-h-11 items-center text-xs font-medium text-app-blue hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] lg:pointer-fine:min-h-8'

export default function BalanceCheckHistory({
  checks,
  tolerance,
  today,
  actions,
}: BalanceCheckHistoryProps) {
  const [showAll, setShowAll] = useState(false)
  if (checks.length === 0) return null
  const visible = showAll ? checks : checks.slice(0, VISIBLE_CHECKS)
  const hidden = checks.length - VISIBLE_CHECKS
  const gap = sharedGap(checks, tolerance)

  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold text-foreground">Recorded checks</h3>
      {gap !== null && (
        <p className="text-xs leading-5 text-warning-text">
          The gap is the same on every check, so the ledger may be missing an opening balance of{' '}
          {formatInr(gap)}.
        </p>
      )}
      <ul className="divide-y divide-[var(--hairline-1)]">
        {visible.map((check) => (
          <li key={check.id} className="py-3">
            <BalanceCheckItem check={check} tolerance={tolerance} today={today} actions={actions} />
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button type="button" onClick={() => setShowAll((value) => !value)} className={LINK_CLASS}>
          {showAll ? 'Show fewer checks' : `Show ${hidden} older ${hidden === 1 ? 'check' : 'checks'}`}
        </button>
      )}
    </div>
  )
}
