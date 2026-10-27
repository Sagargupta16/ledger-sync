import { useId } from 'react'

import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { Money } from '@/components/ui'
import { DISCLOSURE_TRANSITION } from '@/constants/animations'
import { cn } from '@/lib/cn'
import type { AccountBalanceHealth } from '@/services/api/balanceChecks'

import { formatInr, formatInrShort } from '../balanceCheckInput'
import { STATUS_META, statusLine } from '../balanceCheckUtils'
import type { BalanceCheckActions } from '../useBalanceCheckActions'
import BalanceAccountDetails from './BalanceAccountDetails'
import BalanceStatusDot from './BalanceStatusDot'

interface BalanceAccountRowProps {
  readonly health: AccountBalanceHealth
  readonly tolerance: number
  readonly asOf: string
  readonly owedByDefault: boolean
  readonly isOpen: boolean
  readonly onToggle: () => void
  readonly actions: BalanceCheckActions
}

/**
 * One account: its dot, its verdict in words and its ledger balance today.
 * Tapping it opens the check form, the recorded checks and the month grid.
 */
export default function BalanceAccountRow({
  health,
  tolerance,
  asOf,
  owedByDefault,
  isOpen,
  onToggle,
  actions,
}: BalanceAccountRowProps) {
  const detailsId = useId()

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={isOpen ? detailsId : undefined}
        className="flex min-h-14 w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors duration-150 hover:bg-[var(--overlay-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        <BalanceStatusDot status={health.status} />
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-medium text-foreground">
            {health.account}
            {health.is_closed && (
              <span className="ml-2 rounded-full bg-[var(--overlay-3)] px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary">
                Closed
              </span>
            )}
          </span>
          <span className={cn('block text-xs', STATUS_META[health.status].text)}>
            {statusLine(health, asOf)}
          </span>
        </span>
        {/* Short figure on phones keeps room for the name; exact amounts sit in the checks.
            Two spans rather than `compactBelowSm`, whose short figure ignores `formatter`. */}
        <Money value={health.ledger_balance} formatter={formatInrShort} className="text-sm sm:hidden" />
        <Money value={health.ledger_balance} formatter={formatInr} className="hidden text-sm sm:inline" />
        <ChevronDown
          aria-hidden
          className={cn(
            'size-4 shrink-0 text-text-tertiary transition-transform duration-200',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      <AnimatePresence initial={false} mode="popLayout">
        {isOpen && (
          <motion.div
            id={detailsId}
            {...DISCLOSURE_TRANSITION}
            layoutDependency={isOpen}
            className="overflow-hidden"
          >
            <BalanceAccountDetails
              health={health}
              tolerance={tolerance}
              asOf={asOf}
              owedByDefault={owedByDefault}
              actions={actions}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}
