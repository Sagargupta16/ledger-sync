import { motion } from 'motion/react'
import { CheckCircle2, Undo2 } from 'lucide-react'
import { Link } from 'react-router'

import { Button, Spinner } from '@/components/ui'
import { ROUTES } from '@/constants'
import { DURATION, EASING } from '@/constants/animations'

interface ReviewEndStateProps {
  readonly kept: number
  readonly changed: number
  readonly windowDays: number
  readonly isRefreshing: boolean
  readonly isDemoMode: boolean
  readonly canUndo: boolean
  readonly onUndo: () => void
}

function summary(kept: number, changed: number): string {
  if (kept + changed === 0) return 'Nothing is waiting for a review.'
  const noun = (count: number) => `${count} transaction${count === 1 ? '' : 's'}`
  return `This visit you kept ${noun(kept)} and moved ${noun(changed)} to another category.`
}

/** Shown once every row of the window carries a decision. */
export default function ReviewEndState({
  kept,
  changed,
  windowDays,
  isRefreshing,
  isDemoMode,
  canUndo,
  onUndo,
}: ReviewEndStateProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: DURATION.slow, ease: EASING.cinematic }}
      aria-labelledby="review-done-title"
      className="ledger-panel mx-auto flex w-full max-w-md flex-col items-center gap-3 px-6 py-10 text-center"
    >
      <motion.span
        initial={{ scale: 0.4, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.1 }}
        className="flex size-14 items-center justify-center rounded-full border border-app-green/40 bg-app-green/10"
      >
        <CheckCircle2 className="size-7 text-app-green" aria-hidden="true" />
      </motion.span>
      <h2 id="review-done-title" className="text-lg font-semibold text-foreground">
        All caught up
      </h2>
      <p className="max-w-xs text-sm text-text-tertiary">
        Every income and expense row from the last {windowDays} days has a review. {summary(kept, changed)}
      </p>
      {isDemoMode && changed + kept > 0 && (
        <p className="text-xs text-text-tertiary">Demo reviews are not saved.</p>
      )}
      {isRefreshing && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner size="sm" /> Updating your insights
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {canUndo && (
          <Button variant="ghost" size="lg" icon={<Undo2 className="size-4" />} onClick={onUndo} aria-keyshortcuts="U">
            Undo last
          </Button>
        )}
        <Link
          to={ROUTES.TRANSACTIONS}
          className="ledger-control inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium text-foreground"
        >
          Open transactions
        </Link>
      </div>
    </motion.section>
  )
}
