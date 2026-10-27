import { Sparkles } from 'lucide-react'

import type { ReviewSuggestion } from '@/services/api/reviewQueue'

import { labelText } from '../reviewQueueUtils'
import type { CategoryLabel } from '../types'

interface PickerSuggestionsProps {
  readonly suggestions: readonly ReviewSuggestion[]
  readonly onPick: (label: CategoryLabel) => void
}

/** The suggester's picks for the row, each with how sure it is. */
export default function PickerSuggestions({ suggestions, onPick }: PickerSuggestionsProps) {
  return (
    <section aria-labelledby="review-picker-suggested" className="border-b border-[var(--hairline-2)] px-4 py-3">
      <h3 id="review-picker-suggested" className="ledger-meta mb-2 flex items-center gap-1.5 text-text-tertiary">
        <Sparkles className="size-3.5 text-app-blue" aria-hidden="true" />
        Suggested
      </h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {suggestions.map((suggestion) => (
          <button
            key={`${suggestion.category}::${suggestion.subcategory ?? ''}`}
            type="button"
            aria-label={
              suggestion.confidence === null
                ? labelText(suggestion)
                : `${labelText(suggestion)}, ${Math.round(suggestion.confidence * 100)}% likely`
            }
            onClick={() => onPick({ category: suggestion.category, subcategory: suggestion.subcategory })}
            className="ledger-control flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left focus-visible:outline-none"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">{suggestion.category}</span>
              {suggestion.subcategory && (
                <span className="block truncate text-xs text-text-tertiary">{suggestion.subcategory}</span>
              )}
            </span>
            {suggestion.confidence !== null && (
              <span className="shrink-0 text-xs tabular-nums text-app-blue">
                {Math.round(suggestion.confidence * 100)}%
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  )
}
