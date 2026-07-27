import { Search } from 'lucide-react'

import { Input } from '@/components/ui'

import type { KindFilter, MerchantKindCounts } from '../types'

interface MerchantFiltersProps {
  readonly kindFilter: KindFilter
  readonly onKindFilterChange: (next: KindFilter) => void
  readonly kindCounts: MerchantKindCounts
  readonly recurringOnly: boolean
  readonly onRecurringOnlyChange: (next: boolean) => void
  readonly search: string
  readonly onSearchChange: (next: string) => void
}

const KIND_LABELS: ReadonlyArray<readonly [KindFilter, string]> = [
  ['all', 'All'],
  ['brand', 'Brands'],
  ['descriptor', 'Notes'],
  ['unclassified', 'Unclassified'],
]

/**
 * Kind / recurrence / text filters.
 *
 * The kind toggle is the honest half of this page: `brand` rows are recognised
 * payees, `descriptor` rows are the raw note. Counts are shown on the toggle so
 * a ledger whose notes never resolve to brands says so up front instead of
 * looking like a broken filter.
 */
export default function MerchantFilters({
  kindFilter,
  onKindFilterChange,
  kindCounts,
  recurringOnly,
  onRecurringOnlyChange,
  search,
  onSearchChange,
}: MerchantFiltersProps) {
  /**
   * Every count is exactly the row set its chip yields, because `filterByKind`
   * is a strict partition: Brands + Notes + Unclassified == All. A chip whose
   * number disagreed with its result was the original defect here.
   */
  const countFor = (kind: KindFilter): number => {
    if (kind === 'brand') return kindCounts.brand
    if (kind === 'descriptor') return kindCounts.descriptor
    if (kind === 'unclassified') return kindCounts.unclassified
    return kindCounts.brand + kindCounts.descriptor + kindCounts.unclassified
  }

  /**
   * Hide a kind that does not exist in this ledger, rather than offer a chip
   * that can only ever return nothing. `all` always stays: it is how a user gets
   * back, and on a single-kind ledger it is the only chip left.
   */
  const visibleKinds = KIND_LABELS.filter(
    ([kind]) => kind === 'all' || countFor(kind) > 0 || kindFilter === kind,
  )

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      {/* Native <fieldset>/<legend>, not role="group" + aria-label: the element
          carries the grouping semantics itself, so it works where the ARIA role
          has patchy support (S6819). Same shape as the button groups in
          NetWorthTrendChart and GrowthChart. */}
      <fieldset className="m-0 flex gap-1 rounded-lg border-0 bg-muted/20 p-0.5">
        <legend className="sr-only">Filter payees by label kind</legend>
        {visibleKinds.map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            onClick={() => onKindFilterChange(kind)}
            aria-pressed={kindFilter === kind}
            className={`min-h-11 rounded-md px-2.5 py-2.5 text-xs font-medium transition-colors ${
              kindFilter === kind
                ? 'bg-[var(--overlay-5)] text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
            <span className="ml-1 tabular-nums text-text-tertiary">{countFor(kind)}</span>
          </button>
        ))}
      </fieldset>

      <button
        type="button"
        onClick={() => onRecurringOnlyChange(!recurringOnly)}
        aria-pressed={recurringOnly}
        className={`min-h-11 rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors ${
          recurringOnly
            ? 'border-app-teal/40 bg-app-teal/15 text-foreground'
            : 'border-[var(--hairline-2)] text-muted-foreground hover:text-foreground'
        }`}
      >
        Recurring only
      </button>

      <div className="min-w-0 flex-1 sm:max-w-xs">
        <Input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search payee or category"
          aria-label="Search payees by name or category"
          icon={<Search className="size-4" />}
        />
      </div>
    </div>
  )
}
