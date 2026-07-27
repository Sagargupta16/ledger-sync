import { Link } from 'react-router-dom'

import { CircleCheck, ShieldAlert, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import ProgressBar from '@/components/shared/ProgressBar'
import { ROUTES } from '@/constants'
import { rawColors } from '@/constants/colors'
import { getActiveLocale } from '@/lib/formatters'

import type { IssueSeverity, QualityIssue } from '../types'

interface QualityIssueListProps {
  readonly issues: readonly QualityIssue[]
  readonly transactionCount: number
  /** Runs the fix for an issue that carries an `actionLabel`. */
  readonly onAction?: (issueId: string) => void
  /** Id of the issue whose action is currently running, if any. */
  readonly pendingActionId?: string | null
  /**
   * Id of the issue whose action failed, so the user is told rather than left
   * guessing. Keyed by id rather than a page-level boolean: a plain flag put the
   * failure notice under every non-clean row, including the three that have no
   * action at all.
   */
  readonly failedActionId?: string | null
}

const SEVERITY_ICON: Record<IssueSeverity, LucideIcon> = {
  clean: CircleCheck,
  warning: TriangleAlert,
  critical: ShieldAlert,
}

const SEVERITY_TEXT: Record<IssueSeverity, string> = {
  clean: 'text-app-green',
  warning: 'text-warning',
  critical: 'text-app-red',
}

const SEVERITY_FILL: Record<IssueSeverity, string> = {
  clean: rawColors.app.green,
  warning: rawColors.app.orange,
  critical: rawColors.app.red,
}

/**
 * Share of the ledger a single defect can reach before the bar stops being
 * readable. Real-world defect shares sit in single digits, so scaling the bar to
 * 100% would render every one of them as an invisible sliver.
 */
const BAR_MAX_SHARE = 25

function IssueRow({
  issue,
  transactionCount,
  onAction,
  isPending,
  actionFailed,
}: {
  readonly issue: QualityIssue
  readonly transactionCount: number
  readonly onAction?: (issueId: string) => void
  readonly isPending?: boolean
  readonly actionFailed?: boolean
}) {
  const Icon = SEVERITY_ICON[issue.severity]
  const locale = getActiveLocale()
  const isClean = issue.severity === 'clean'
  // A flag issue has no meaningful row count or ledger share, so it shows a
  // verdict word and skips the bar rather than claiming to affect 0% of rows.
  const isFlag = issue.kind === 'flag'

  return (
    <li className="space-y-2 py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2.5">
        <Icon className={`mt-0.5 size-4 shrink-0 ${SEVERITY_TEXT[issue.severity]}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              {issue.label}
            </h3>
            <span className={`shrink-0 text-sm font-semibold ${isFlag ? '' : 'tabular-nums'} ${SEVERITY_TEXT[issue.severity]}`}>
              {isFlag
                ? isClean
                  ? 'Up to date'
                  : 'Out of date'
                : issue.count.toLocaleString(locale)}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-text-tertiary">{issue.explanation}</p>
        </div>
      </div>

      {!isClean && (
        <div className="space-y-1.5 pl-6.5">
          {!isFlag && (
            <ProgressBar
              value={Math.min(issue.shareOfLedger, BAR_MAX_SHARE)}
              max={BAR_MAX_SHARE}
              color={SEVERITY_FILL[issue.severity]}
              height={6}
              ariaLabel={`${issue.label}: ${issue.count} of ${transactionCount} transactions`}
            />
          )}
          <p className="text-xs text-text-tertiary">
            {!isFlag && (
              <>
                <span className="font-medium tabular-nums text-foreground">
                  {issue.shareOfLedger.toFixed(1)}%
                </span>{' '}
                of {transactionCount.toLocaleString(locale)} rows.{' '}
              </>
            )}
            {issue.guidance}
          </p>
          {issue.actionLabel && onAction && (
            <button
              type="button"
              onClick={() => onAction(issue.id)}
              disabled={isPending}
              className="inline-flex min-h-11 items-center rounded-lg border border-[var(--hairline-2)] px-3 text-xs font-medium text-foreground transition-colors duration-150 hover:bg-[var(--overlay-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60 sm:min-h-8"
            >
              {isPending ? 'Recomputing...' : issue.actionLabel}
            </button>
          )}
          {actionFailed && !isPending && (
            // Said out loud on purpose: a fix that fails quietly is the same
            // failure mode as the stale rollups themselves.
            <p className="text-xs text-app-red" role="alert">
              That did not go through. Your data is unchanged -- try again, or re-upload your
              statement.
            </p>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * The data-quality facts that exist in the database but had no surface anywhere:
 * stale rollups, placeholder notes, catch-all categories, and future-dated rows.
 * Each one is a fact the user can act on, with the share of the ledger it touches
 * so a small number is not mistaken for a big problem or vice versa.
 */
export default function QualityIssueList({
  issues,
  transactionCount,
  onAction,
  pendingActionId,
  failedActionId,
}: QualityIssueListProps) {
  const problemCount = issues.filter((i) => i.severity !== 'clean').length

  return (
    <section className="ledger-panel space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">Data quality</h2>
        <span className="text-xs text-text-tertiary">
          {problemCount === 0
            ? 'No issues detected'
            : `${problemCount} of ${issues.length} checks need attention`}
        </span>
        <Link
          to={ROUTES.SETTINGS}
          className="ml-auto inline-flex min-h-11 items-center rounded-lg border border-[var(--hairline-2)] px-3 text-xs font-medium text-foreground transition-colors duration-150 hover:bg-[var(--overlay-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] sm:min-h-8"
        >
          Categorization rules
        </Link>
      </div>

      <ul className="divide-y divide-[var(--hairline-1)]">
        {issues.map((issue) => (
          <IssueRow
            key={issue.id}
            issue={issue}
            transactionCount={transactionCount}
            onAction={onAction}
            isPending={pendingActionId === issue.id}
            actionFailed={failedActionId === issue.id}
          />
        ))}
      </ul>
    </section>
  )
}
