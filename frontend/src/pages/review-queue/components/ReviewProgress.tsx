import ProgressBar from '@/components/shared/ProgressBar'
import { colors } from '@/constants/colors'

import type { ReviewProgressCounts } from '../types'

/** How much of the window is reviewed, this visit's decisions included. */
export default function ReviewProgress({ counts }: Readonly<{ counts: ReviewProgressCounts }>) {
  const { reviewed, total, windowDays } = counts
  return (
    <div className="mx-auto w-full max-w-md space-y-2">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{reviewed}</span> of {total} reviewed
        </span>
        <span className="ledger-meta text-text-tertiary">Last {windowDays} days</span>
      </div>
      <ProgressBar
        value={reviewed}
        max={Math.max(total, 1)}
        color={colors.app.green}
        height={6}
        ariaLabel={`${reviewed} of ${total} transactions from the last ${windowDays} days reviewed`}
      />
    </div>
  )
}
