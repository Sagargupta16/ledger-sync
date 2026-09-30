import { TrendingDown } from 'lucide-react'

import { Money } from '@/components/ui'
import { getActiveLocale } from '@/lib/formatters'
import type { CapitalLossCandidate } from '@/services/api/analyticsV2DataHealth'

import type { ClassificationFailure, ClassifiedLossKey } from '../useCapitalLossClassification'

interface CapitalLossPanelProps {
  readonly candidates: readonly CapitalLossCandidate[]
  readonly classified: readonly ClassifiedLossKey[]
  readonly pendingKey: string | null
  readonly isBusy: boolean
  /** False until the saved set has loaded; every save replaces the whole set. */
  readonly canEdit: boolean
  readonly failure: ClassificationFailure | null
  readonly onClassify: (candidate: CapitalLossCandidate) => void
  readonly onUnclassify: (key: string) => void
  readonly onRetryRefresh: () => void
}

const BUTTON_CLASS =
  'inline-flex min-h-11 shrink-0 items-center rounded-lg border border-[var(--hairline-2)] px-3 text-xs font-medium text-foreground transition-colors duration-150 hover:bg-[var(--overlay-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60 lg:pointer-fine:min-h-8'

function taxonomyLabel(category: string | null, subcategory: string | null): string {
  const parts = [category, subcategory].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(' / ') : 'Uncategorised'
}

function FailureNotice({
  failure,
  onRetryRefresh,
  isBusy,
}: {
  readonly failure: ClassificationFailure
  readonly onRetryRefresh: () => void
  readonly isBusy: boolean
}) {
  if (failure === 'save') {
    return (
      <p className="text-xs text-app-red" role="alert">
        That did not save. Nothing changed -- your totals are exactly as before. Try again.
      </p>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2" role="alert">
      <p className="min-w-0 flex-1 text-xs text-app-red">
        Saved, but the analytics did not recompute, so some totals still show the old split.
      </p>
      <button type="button" onClick={onRetryRefresh} disabled={isBusy} className={BUTTON_CLASS}>
        Recompute now
      </button>
    </div>
  )
}

/**
 * Suggested realised investment losses, with one-click classification.
 *
 * A trading loss has to be booked as an Expense for a cashbook to balance, but
 * it bought nothing, so until it is classified it inflates every spending
 * total, category ranking and savings-rate denominator. The server only
 * SUGGESTS these (name detection); classifying is the user's call because it
 * moves their historical spending figures.
 */
export default function CapitalLossPanel({
  candidates,
  classified,
  pendingKey,
  isBusy,
  canEdit,
  failure,
  onClassify,
  onUnclassify,
  onRetryRefresh,
}: CapitalLossPanelProps) {
  if (candidates.length === 0 && classified.length === 0) return null
  const locale = getActiveLocale()
  const actionsDisabled = isBusy || !canEdit

  return (
    <section className="ledger-panel space-y-4 p-4" aria-labelledby="capital-loss-heading">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <TrendingDown className="size-4 shrink-0 text-app-orange" aria-hidden />
          <h2 id="capital-loss-heading" className="text-sm font-semibold text-foreground">
            Realised investment losses
          </h2>
        </div>
        <p className="text-xs leading-5 text-text-tertiary">
          A classified loss leaves every spending total and category ranking, but still reduces
          what you saved, because the money did leave your account.
        </p>
      </div>

      {candidates.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">
            These look like realised investment losses and are counted as spending right now.
          </p>
          <ul className="divide-y divide-[var(--hairline-1)]">
            {candidates.map((candidate) => (
              <li key={candidate.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium text-foreground">
                    {taxonomyLabel(candidate.category, candidate.subcategory)}
                  </p>
                  <p className="text-xs tabular-nums text-text-tertiary">
                    {candidate.transaction_count.toLocaleString(locale)}{' '}
                    {candidate.transaction_count === 1 ? 'transaction' : 'transactions'}
                  </p>
                </div>
                <Money value={candidate.total_amount} />
                <button
                  type="button"
                  onClick={() => onClassify(candidate)}
                  disabled={actionsDisabled}
                  className={BUTTON_CLASS}
                  aria-label={`Classify ${taxonomyLabel(candidate.category, candidate.subcategory)} as a realised loss`}
                >
                  {pendingKey === candidate.key ? 'Classifying...' : 'Classify'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {classified.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">Classified as realised losses</p>
          <ul className="divide-y divide-[var(--hairline-1)]">
            {classified.map((entry) => (
              <li key={entry.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                <p className="min-w-0 flex-1 break-words text-sm text-foreground">
                  {taxonomyLabel(entry.category, entry.subcategory)}
                </p>
                <button
                  type="button"
                  onClick={() => onUnclassify(entry.key)}
                  disabled={actionsDisabled}
                  className={BUTTON_CLASS}
                  aria-label={`Count ${taxonomyLabel(entry.category, entry.subcategory)} as spending again`}
                >
                  {pendingKey === entry.key ? 'Updating...' : 'Un-classify'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {failure && !isBusy && (
        <FailureNotice failure={failure} onRetryRefresh={onRetryRefresh} isBusy={isBusy} />
      )}
    </section>
  )
}
