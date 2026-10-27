import { Sparkles } from 'lucide-react'

import { cn } from '@/lib/cn'
import {
  formatSuggestionLabel,
  type CategorySuggestion,
} from '@/services/api/categorySuggestions'

interface CategorySuggestionChipsProps {
  readonly suggestions: readonly CategorySuggestion[]
}

/** Whole percent for a chip, kept within 1 to 99: the model makes a guess, never a certainty. */
function percent(confidence: number): number {
  return Math.min(99, Math.max(1, Math.round(confidence * 100)))
}

/**
 * The model's best label first, then its runner-up, each with its probability.
 * Read-only; renders nothing when the model abstained (an empty list).
 */
export default function CategorySuggestionChips({ suggestions }: CategorySuggestionChipsProps) {
  if (suggestions.length === 0) return null

  return (
    <ul className="flex flex-wrap gap-2" aria-label="Suggested categories">
      {suggestions.map((suggestion, index) => {
        const label = formatSuggestionLabel(suggestion)
        const likely = percent(suggestion.confidence)
        return (
          <li
            key={label}
            title={`${likely}% likely, from your categorized history`}
            className={cn(
              'inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
              index === 0
                ? 'border-primary/30 bg-primary/10 text-foreground'
                : 'border-[var(--hairline-3)] text-muted-foreground',
            )}
          >
            {index === 0 && <Sparkles className="size-3.5 shrink-0 text-primary" aria-hidden="true" />}
            <span className="min-w-0 truncate">{label}</span>
            <span className="shrink-0 font-mono tabular-nums opacity-80">
              {likely}%<span className="sr-only"> likely</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
