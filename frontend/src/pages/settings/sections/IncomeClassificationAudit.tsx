/**
 * Income classification audit - surfaces the two silent failure modes of the
 * four exact-match `*_income_categories` preference lists:
 *
 *   1. a ledger income bucket that NO list claims (money that quietly leaves
 *      every classified total, because a stored non-empty list is honoured
 *      verbatim and the shipped defaults never gap-fill it), and
 *   2. a saved key that matches ZERO ledger rows (a drifted spelling reads as
 *      configured-and-working while summing nothing).
 */

import { AlertTriangle, Sparkles, Trash2 } from 'lucide-react'
import { Button, Money } from '@/components/ui'
import type { IncomeClassificationAudit as Audit } from '../helpers'
import type { IncomeClassificationType } from '../types'
import { INCOME_CLASSIFICATION_TYPES } from '../types'

interface Props {
  audit: Audit
  onClassify: (item: string, type: IncomeClassificationType) => void
  onApplySuggestions: () => void
  onRemoveKey: (key: string) => void
}

/** Bucket label without its leading emoji (the emoji is decorative here). */
function bucketLabel(type: IncomeClassificationType): string {
  const match = INCOME_CLASSIFICATION_TYPES.find((t) => t.value === type)
  return match ? match.label.replace(/^[^\s]+\s/, '') : type
}

export default function IncomeClassificationAudit({
  audit,
  onClassify,
  onApplySuggestions,
  onRemoveKey,
}: Readonly<Props>) {
  const suggestionCount = audit.unclassified.filter((item) => item.suggested !== null).length

  return (
    <div className="space-y-3">
      {audit.unclassified.length > 0 && (
        <div className="rounded-xl border border-app-yellow/30 bg-app-yellow/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium text-warning-text">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {audit.unclassified.length}{' '}unclassified income{' '}
                {audit.unclassified.length === 1 ? 'category' : 'categories'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                <Money value={audit.unclassifiedTotal} className="inline" /> across{' '}
                {audit.unclassifiedRows}{' '}
                {audit.unclassifiedRows === 1 ? 'transaction' : 'transactions'} is left out of every
                classified total (taxable income, cashbacks, investment returns). Pick a bucket for
                each.
              </p>
            </div>
            {suggestionCount > 0 && (
              <Button
                id="apply-income-suggestions"
                type="button"
                variant="secondary"
                size="sm"
                onClick={onApplySuggestions}
                icon={<Sparkles className="h-3.5 w-3.5" />}
              >
                Apply {suggestionCount}{' '}
                {suggestionCount === 1 ? 'suggestion' : 'suggestions'}
              </Button>
            )}
          </div>

          <ul className="mt-3 flex flex-col gap-2">
            {audit.unclassified.map((item) => (
              <li
                key={item.key}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--hairline-1)] bg-[var(--overlay-2)] p-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{item.subcategory}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {item.category} &middot; {item.count}{' '}
                    {item.count === 1 ? 'txn' : 'txns'}
                  </p>
                </div>
                <Money value={item.total} width="sm" />
                <select
                  id={`income-audit-${encodeURIComponent(item.key)}`}
                  aria-label={`Classify ${item.category} ${item.subcategory}`}
                  value=""
                  onChange={(event) => {
                    if (event.target.value) {
                      onClassify(item.key, event.target.value as IncomeClassificationType)
                    }
                  }}
                  className="ledger-control min-h-11 w-full shrink-0 rounded-lg border border-border px-2 py-2 text-xs text-foreground focus:border-primary focus:outline-none sm:w-48 lg:pointer-fine:min-h-10"
                >
                  <option value="" className="bg-background">
                    Classify as...
                  </option>
                  {INCOME_CLASSIFICATION_TYPES.map((type) => (
                    <option key={type.value} value={type.value} className="bg-background">
                      {bucketLabel(type.value)}
                      {item.suggested === type.value ? ' (suggested)' : ''}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}

      {audit.deadKeys.length > 0 && (
        <div className="rounded-xl border border-border bg-[var(--overlay-1)] p-4">
          <p className="text-sm font-medium text-foreground">
            {audit.deadKeys.length}{' '}saved{' '}
            {audit.deadKeys.length === 1 ? 'category matches' : 'categories match'} no transactions
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            These keys contribute zero to their bucket -- usually a renamed or misspelled category
            left behind after an import. Harmless, but they hide the fact that nothing is counted.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {audit.deadKeys.map((dead) => (
              <li
                key={`${dead.classification}-${dead.key}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--hairline-1)] bg-[var(--overlay-2)] p-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{dead.key.replace('::', ' / ')}</p>
                  <p className="text-[11px] text-muted-foreground">
                    in {bucketLabel(dead.classification)}
                  </p>
                </div>
                <Button
                  id={`remove-dead-income-key-${encodeURIComponent(dead.key)}`}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveKey(dead.key)}
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  aria-label={`Remove ${dead.key} from ${bucketLabel(dead.classification)}`}
                >
                  <span className="hidden sm:inline">Remove</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
