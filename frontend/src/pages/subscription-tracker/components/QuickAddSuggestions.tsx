import { Button } from '@/components/ui'

import { SUGGESTIONS } from '../constants'
import type { Suggestion } from '../types'

interface QuickAddSuggestionsProps {
  readonly compact: boolean
  readonly onSelect: (suggestion: Suggestion) => void
}

export default function QuickAddSuggestions({
  compact,
  onSelect,
}: QuickAddSuggestionsProps) {
  const suggestions = compact ? SUGGESTIONS.slice(0, 8) : SUGGESTIONS

  if (compact) {
    return (
      <section className="flex flex-wrap items-center gap-2" aria-label="Quick add recurring items">
        <span className="text-xs text-text-tertiary">Quick add:</span>
        {suggestions.map((suggestion) => (
          <Button
            key={suggestion.name}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSelect(suggestion)}
            className="bg-[var(--overlay-2)] text-[11px] text-muted-foreground hover:bg-[var(--overlay-5)] hover:text-foreground"
          >
            + {suggestion.name}
          </Button>
        ))}
      </section>
    )
  }

  return (
    <section className="glass space-y-3 rounded-xl border border-border p-4 sm:p-6">
      <h2 className="text-sm font-medium text-foreground">
        Quick Add -- common recurring transactions
      </h2>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <Button
            key={suggestion.name}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSelect(suggestion)}
            className={
              suggestion.type === 'Income'
                ? 'border-app-green/20 bg-app-green/5 text-app-green hover:bg-app-green/15 hover:text-app-green'
                : 'border-app-red/20 bg-app-red/5 text-app-red hover:bg-app-red/15 hover:text-app-red'
            }
          >
            {suggestion.name}
          </Button>
        ))}
      </div>
    </section>
  )
}
