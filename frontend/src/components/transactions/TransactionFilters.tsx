import { useState, useCallback, useEffect, useEffectEvent, useRef, type ReactNode } from 'react'
import { Search, Filter, X, Calendar } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Input, Select } from '@/components/ui'
import { useDebounce } from '@/hooks/useDebounce'
import { usePreferencesStore } from '@/store/preferencesStore'
import type { TagFacet } from '@/services/api/transactions'

interface TransactionFiltersProps {
  onFilterChange: (filters: FilterValues) => void
  categories: string[]
  accounts: string[]
  /**
   * Seeds the internal filter state on mount. The parent re-seeds by
   * remounting this component via a `key` change (saved-view apply).
   */
  initialValues?: FilterValues
  tagOptions?: TagFacet[]
  /** Rendered in the search-bar row between the input and the Filters toggle. */
  savedViewsSlot?: ReactNode
}

export interface FilterValues {
  query?: string
  category?: string
  account?: string
  type?: string
  tag?: string
  start_date?: string
  end_date?: string
  min_amount?: number
  max_amount?: number
}

const TRANSACTION_TYPES = ['Income', 'Expense', 'Transfer']

export default function TransactionFilters({
  onFilterChange,
  categories,
  accounts,
  initialValues,
  tagOptions = [],
  savedViewsSlot,
}: Readonly<TransactionFiltersProps>) {
  const [filters, setFilters] = useState<FilterValues>(initialValues ?? {})
  const [searchQuery, setSearchQuery] = useState(initialValues?.query ?? '')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const isFirstRender = useRef(true)
  const currencySymbol = usePreferencesStore((state) => state.displayPreferences.currencySymbol)

  // Debounce search query
  const debouncedSearchQuery = useDebounce(searchQuery, 300)

  // Apply the debounced query to the filter set. This is an Effect Event
  // (React 19.2): it always reads the LATEST filters/onFilterChange without
  // making them effect dependencies, so the effect re-runs only when the
  // debounced query changes -- and never sees a stale filters snapshot. This
  // replaces the old onFilterChangeRef shim + exhaustive-deps suppression.
  const applyDebouncedQuery = useEffectEvent((query: string) => {
    const newFilters = { ...filters, query: query || undefined }
    setFilters(newFilters)
    // Notify the parent after the state update (not inside a setter) to avoid
    // "Cannot update a component while rendering a different component".
    onFilterChange(newFilters)
  })

  // React only to debounced query changes; skip the initial mount so we don't
  // emit an empty-query filter before the user has typed.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    applyDebouncedQuery(debouncedSearchQuery)
  }, [debouncedSearchQuery])

  const handleFilterChange = useCallback((key: keyof FilterValues, value: string | number | undefined) => {
    if (key === 'query') {
      setSearchQuery(value as string || '')
      return
    }
    const newFilters = { ...filters, [key]: value || undefined }
    setFilters(newFilters)
    onFilterChange(newFilters)
  }, [filters, onFilterChange])

  const clearFilters = useCallback(() => {
    setFilters({})
    setSearchQuery('')
    onFilterChange({})
  }, [onFilterChange])

  const hasActiveFilters = Object.values(filters).some((v) => v !== undefined && v !== '') || searchQuery !== ''
  // Count only the advanced (non-query) filters so the badge tells the user
  // what's still applied while the panel is collapsed. The search query is
  // already visible in the input above, so it's excluded.
  const advancedFilterCount = Object.entries(filters).filter(
    ([key, value]) => key !== 'query' && value !== undefined && value !== '',
  ).length

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="ledger-panel p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[12rem] flex-1">
            <Input
              type="text"
              placeholder="Search transactions by note, category, or account..."
              value={searchQuery}
              onChange={(e) => handleFilterChange('query', e.target.value)}
              icon={<Search className="size-4" />}
              className="lg:min-h-10"
              aria-label="Search transactions"
            />
          </div>
          {savedViewsSlot}
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`px-3 lg:min-h-10 ${showAdvanced
                ? 'bg-[var(--overlay-4)] text-foreground'
                : 'text-muted-foreground'
              }`}
            aria-expanded={showAdvanced}
            aria-controls="advanced-filters"
            aria-label={showAdvanced ? 'Hide filters' : 'Show filters'}
          >
            <Filter className="w-4 h-4" aria-hidden="true" />
            <span className="text-sm font-medium">Filters</span>
            {!showAdvanced && advancedFilterCount > 0 && (
              <span
                className="ml-0.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-app-blue/20 text-app-blue text-xs font-semibold tabular-nums"
                aria-label={`${advancedFilterCount} active filters`}
              >
                {advancedFilterCount}
              </span>
            )}
          </Button>
          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={clearFilters}
              className="px-3 text-app-red hover:bg-app-red/10 hover:text-app-red lg:min-h-10"
              aria-label="Clear all filters"
            >
              <X className="w-4 h-4" aria-hidden="true" />
              <span className="text-sm font-medium">Clear</span>
            </Button>
          )}
        </div>
      </div>

      {/* Advanced Filters */}
      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            id="advanced-filters"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="ledger-panel space-y-4 overflow-hidden p-4 sm:p-5"
            role="region"
            aria-label="Advanced filters"
          >
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Filter className="size-4 text-muted-foreground" aria-hidden="true" />
              Advanced Filters
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Type Filter */}
              <div className="space-y-2">
                <label htmlFor="filter-type" className="text-sm font-medium text-muted-foreground">Type</label>
                <Select
                  id="filter-type"
                  value={filters.type || ''}
                  onChange={(e) => handleFilterChange('type', e.target.value)}
                  options={[
                    { value: '', label: 'All Types' },
                    ...TRANSACTION_TYPES.map((type) => ({ value: type, label: type })),
                  ]}
                  aria-label="Filter by transaction type"
                />
              </div>

              {/* Category Filter */}
              <div className="space-y-2">
                <label htmlFor="filter-category" className="text-sm font-medium text-muted-foreground">Category</label>
                <Select
                  id="filter-category"
                  value={filters.category || ''}
                  onChange={(e) => handleFilterChange('category', e.target.value)}
                  options={[
                    { value: '', label: 'All Categories' },
                    ...categories.map((category) => ({ value: category, label: category })),
                  ]}
                />
              </div>

              {/* Account Filter */}
              <div className="space-y-2">
                <label htmlFor="filter-account" className="text-sm font-medium text-muted-foreground">Account</label>
                <Select
                  id="filter-account"
                  value={filters.account || ''}
                  onChange={(e) => handleFilterChange('account', e.target.value)}
                  options={[
                    { value: '', label: 'All Accounts' },
                    ...accounts.map((account) => ({ value: account, label: account })),
                  ]}
                />
              </div>

              {/* Tag Filter */}
              <div className="space-y-2">
                <label htmlFor="filter-tag" className="text-sm font-medium text-muted-foreground">Tag</label>
                <Select
                  id="filter-tag"
                  value={filters.tag || ''}
                  onChange={(e) => handleFilterChange('tag', e.target.value)}
                  options={[
                    { value: '', label: 'All tags' },
                    ...tagOptions.map((tag) => ({
                      value: tag.name,
                      label: `${tag.name} (${tag.count})`,
                    })),
                  ]}
                  aria-label="Filter by tag"
                />
              </div>

              {/* Start Date */}
              <div className="space-y-2">
                <label htmlFor="filter-start-date" className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Start Date
                </label>
                <Input
                  id="filter-start-date"
                  type="date"
                  value={filters.start_date || ''}
                  onChange={(e) => handleFilterChange('start_date', e.target.value)}
                />
              </div>

              {/* End Date */}
              <div className="space-y-2">
                <label htmlFor="filter-end-date" className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  End Date
                </label>
                <Input
                  id="filter-end-date"
                  type="date"
                  value={filters.end_date || ''}
                  onChange={(e) => handleFilterChange('end_date', e.target.value)}
                />
              </div>

              {/* Min Amount */}
              <div className="space-y-2">
                <label htmlFor="filter-min-amount" className="text-sm font-medium text-muted-foreground">Min Amount ({currencySymbol})</label>
                <Input
                  id="filter-min-amount"
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={filters.min_amount || ''}
                  onChange={(e) => handleFilterChange('min_amount', e.target.value ? Number(e.target.value) : undefined)}
                />
              </div>

              {/* Max Amount */}
              <div className="space-y-2">
                <label htmlFor="filter-max-amount" className="text-sm font-medium text-muted-foreground">Max Amount ({currencySymbol})</label>
                <Input
                  id="filter-max-amount"
                  type="number"
                  inputMode="decimal"
                  placeholder="∞"
                  value={filters.max_amount || ''}
                  onChange={(e) => handleFilterChange('max_amount', e.target.value ? Number(e.target.value) : undefined)}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
