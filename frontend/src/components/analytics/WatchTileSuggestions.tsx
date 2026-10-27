import { Link } from 'react-router'
import { Bookmark, Pin } from 'lucide-react'

import { Button, Money } from '@/components/ui'
import { formatMonthKey } from '@/lib/dateUtils'
import { formatCurrency } from '@/lib/formatters'
import type { WatchSuggestion } from '@/services/api/watchTiles'
import { ROUTES } from '@/constants'

interface WatchTileSuggestionsProps {
  suggestions: WatchSuggestion[]
  /** `YYYY-MM` the suggestions rank. */
  month: string | null
  readOnly: boolean
  /** The category whose pin is in flight, if any. */
  pendingCategory: string | null
  onPin: (category: string) => void
}

/** Empty watchlist: last month's top spending categories, each one tap from a tile. */
export default function WatchTileSuggestions({
  suggestions, month, readOnly, pendingCategory, onPin,
}: Readonly<WatchTileSuggestionsProps>) {
  const monthLabel = month ? formatMonthKey(month, { month: 'long', year: 'numeric' }) : ''

  return (
    <div className="ledger-panel space-y-3 p-4">
      <p className="text-sm leading-6 text-foreground">
        Pin a saved view to watch its spending here, no budget needed.
      </p>
      {month && suggestions.length > 0 && (
        <>
          <p className="text-xs leading-5 text-muted-foreground">
            Top categories in {monthLabel}. One tap pins it.
          </p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {suggestions.map((suggestion) => (
              <li key={suggestion.category} className="min-w-0 odd:last:col-span-2 sm:odd:last:col-span-1">
                <Button
                  variant="secondary"
                  size="md"
                  className="w-full justify-between text-left"
                  disabled={readOnly || pendingCategory !== null}
                  isLoading={pendingCategory === suggestion.category}
                  onClick={() => onPin(suggestion.category)}
                  aria-label={`Pin ${suggestion.category}, ${formatCurrency(suggestion.amount)} in ${monthLabel}, to the Dashboard`}
                  icon={<Pin className="size-4" />}
                >
                  <span className="min-w-0 flex-1 truncate">{suggestion.category}</span>
                  <Money value={suggestion.amount} muted compactBelowSm className="text-xs" />
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      {readOnly && (
        <p className="text-xs leading-5 text-muted-foreground">
          Demo mode is read-only; pinning needs your own account.
        </p>
      )}
      <Link
        to={ROUTES.TRANSACTIONS}
        className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        <Bookmark className="size-3.5" aria-hidden="true" />
        Save a custom view on Transactions, then pin it from Views
      </Link>
    </div>
  )
}
