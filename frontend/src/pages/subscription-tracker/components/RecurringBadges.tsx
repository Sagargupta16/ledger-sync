import { CircleHelp, PencilLine } from 'lucide-react'

import { formatCurrency } from '@/lib/formatters'
import type { RecurringTransaction } from '@/hooks/api/useAnalyticsV2'

import { capitalize } from '../helpers'

const CHIP = 'px-1.5 py-0.5 rounded text-[11px] font-medium'
const MUTED_CHIP = `${CHIP} bg-[var(--overlay-5)] text-text-tertiary`

/** Status chips beside a recurring item's name. */
export function RecurringBadges({
  item,
  needsReview,
}: Readonly<{
  item: RecurringTransaction
  needsReview: boolean
}>) {
  const isIncome = item.type === 'Income'
  const isHabit = item.pattern_kind === 'habit'

  return (
    <>
      <span className={`${CHIP} ${isIncome ? 'bg-app-green/10 text-app-green' : 'bg-app-red/10 text-app-red'}`}>
        {item.type}
      </span>
      <span className={`${CHIP} bg-app-blue/10 text-app-blue`}>
        {capitalize(item.frequency)}
      </span>
      {!item.is_active && <span className={MUTED_CHIP}>Paused</span>}
      {isHabit && <span className={MUTED_CHIP}>Not a bill</span>}
      {!item.is_confirmed && !isHabit && (
        <span
          className={`${CHIP} bg-app-yellow/10 text-app-yellow`}
          title={`Detected from ${item.occurrences} matching transactions (${Math.round(item.confidence)}% confidence)`}
        >
          Detected
        </span>
      )}
      {item.amount_edited && (
        <span
          className={`${CHIP} inline-flex items-center gap-1 bg-app-indigo/10 text-app-indigo`}
          title={
            item.detected_amount == null
              ? 'You set this amount'
              : `You set this amount. Detected from history: ${formatCurrency(Math.abs(item.detected_amount))}`
          }
        >
          <PencilLine aria-hidden="true" className="h-3 w-3" />
          <span>Edited</span>
        </span>
      )}
      {needsReview && (
        <span className="inline-flex items-center gap-1 rounded bg-app-yellow/10 px-1.5 py-0.5 text-[11px] font-medium text-warning-text">
          <CircleHelp aria-hidden="true" className="h-3 w-3" />
          <span>Needs review</span>
        </span>
      )}
    </>
  )
}
