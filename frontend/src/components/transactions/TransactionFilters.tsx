import { useState, useCallback, useEffect, useRef } from 'react'
import { Search, Filter, X, Calendar } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePreferencesStore } from '@/store/preferencesStore'

interface TransactionFiltersProps {
  onFilterChange: (filters: FilterValues) => void
  categories: string[]
  accounts: string[]
}

export interface FilterValues {
  query?: string
  category?: string
  account?: string
  type?: string
  start_date?: string
  end_date?: string
  min_amount?: number
  max_amount?: number
}

const TRANSACTION_TYPES = ['Income', 'Expense', 'Transfer']

// Custom debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

export default function TransactionFilters({ onFilterChange, categories, accounts }: Readonly<TransactionFiltersProps>) {
  const [filters, setFilters] = useState<FilterValues>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const isFirstRender = useRef(true)
  const onFilterChangeRef = useRef(onFilterChange)
  const currencySymbol = usePreferencesStore((state) => state.displayPreferences.currencySymbol)

  // Keep callback ref in sync
  useEffect(() => {
    onFilterChangeRef.current = onFilterChange
  }, [onFilterChange])

  // Debounce search query
  const debouncedSearchQuery = useDebounce(searchQuery, 300)

  // Handle debounced search - notify parent of filter changes
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    setFilters((prev) => {
      const newFilters = { ...prev, query: debouncedSearchQuery || undefined }
      onFilterChangeRef.current(newFilters)
      return newFilters
    })
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

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="glass rounded-xl border border-border p-4 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search transactions by note, category, or account..."
              value={searchQuery}
              onChange={(e) => handleFilterChange('query', e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-transparent border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
              aria-label="Search transactions"
            />
          </div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${showAdvanced
                ? 'bg-primary text-white shadow-lg shadow-primary/30'
                : 'bg-white/5 hover:bg-white/10 border border-border'
              }`}
            aria-expanded={showAdvanced}
            aria-controls="advanced-filters"
            aria-label={showAdvanced ? 'Hide filters' : 'Show filters'}
          >
            <Filter className="w-4 h-4" aria-hidden="true" />
            <span className="text-sm font-medium">Filters</span>
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-ios-red/20 text-ios-red hover:bg-ios-red/30 transition-colors"
              aria-label="Clear all filters"
            >
              <X className="w-4 h-4" aria-hidden="true" />
              <span className="text-sm font-medium">Clear</span>
            </button>
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
            className="glass rounded-xl border border-border p-6 shadow-lg space-y-4 overflow-hidden"
            role="region"
            aria-label="Advanced filters"
          >
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Filter className="w-5 h-5 text-primary" aria-hidden="true" />
              Advanced Filters
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Type Filter */}
              <div className="space-y-2">
                <label htmlFor="filter-type" className="text-sm font-medium text-muted-foreground">Type</label>
                <select
                  id="filter-type"
                  value={filters.type || ''}
                  onChange={(e) => handleFilterChange('type', e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors text-white"
                  aria-label="Filter by transaction type"
                >
                  <option value="" className="bg-background text-white">All Types</option>
                  {TRANSACTION_TYPES.map((type) => (
                    <option key={type} value={type} className="bg-background text-white">
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              {/* Category Filter */}
              <div className="space-y-2">
                <label htmlFor="filter-category" className="text-sm font-medium text-muted-foreground">Category</label>
                <select
                  id="filter-category"
                  value={filters.category || ''}
                  onChange={(e) => handleFilterChange('category', e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors text-white"
                >
                  <option value="" className="bg-background text-white">All Categories</option>
                  {categories.map((category) => (
                    <option key={category} value={category} className="bg-background text-white">
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              {/* Account Filter */}
              <div className="space-y-2">
                <label htmlFor="filter-account" className="text-sm font-medium text-muted-foreground">Account</label>
                <select
                  id="filter-account"
                  value={filters.account || ''}
                  onChange={(e) => handleFilterChange('account', e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors text-white"
                >
                  <option value="" className="bg-background text-white">All Accounts</option>
                  {accounts.map((account) => (
                    <option key={account} value={account} className="bg-background text-white">
                      {account}
                    </option>
                  ))}
                </select>
              </div>

              {/* Start Date */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Start Date
                </label>
                <input
                  type="date"
                  value={filters.start_date || ''}
                  onChange={(e) => handleFilterChange('start_date', e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
                />
              </div>

              {/* End Date */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  End Date
                </label>
                <input
                  type="date"
                  value={filters.end_date || ''}
                  onChange={(e) => handleFilterChange('end_date', e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
                />
              </div>

              {/* Min Amount */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Min Amount ({currencySymbol})</label>
                <input
                  type="number"
                  placeholder="0"
                  value={filters.min_amount || ''}
                  onChange={(e) => handleFilterChange('min_amount', e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full px-3 py-2 bg-white/5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
                />
              </div>

              {/* Max Amount */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Max Amount ({currencySymbol})</label>
                <input
                  type="number"
                  placeholder="∞"
                  value={filters.max_amount || ''}
                  onChange={(e) => handleFilterChange('max_amount', e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full px-3 py-2 bg-white/5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
