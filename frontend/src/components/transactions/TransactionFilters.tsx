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
    const newFilters = { ...filters, query: debouncedSearchQuery || undefined }
    setFilters(newFilters)
    // Notify parent after state update (not inside a setter) to avoid
    // "Cannot update a component while rendering a different component"
    onFilterChangeRef.current(newFilters)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to debounced query changes
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
      <div className="bg-white/[0.04] border border-border rounded-xl p-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search transactions by note, category, or account..."
              value={searchQuery}
              onChange={(e) => handleFilterChange('query', e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-transparent border border-white/[0.08] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors duration-150 text-white"
              aria-label="Search transactions"
            />
          </div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors duration-150 ${showAdvanced
                ? 'bg-white/[0.08] text-white'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.06]'
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
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-white/[0.06] transition-colors duration-150"
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
            className="bg-white/[0.04] border border-border rounded-xl p-6 space-y-4 overflow-hidden"
            role="region"
            aria-label="Advanced filters"
          >
            <h3 className="text-lg font-semibold flex items-center gap-2 text-zinc-300">
              <Filter className="w-5 h-5 text-zinc-400" aria-hidden="true" />
              Advanced Filters
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Type Filter */}
              <div className="space-y-2">
                <label htmlFor="filter-type" className="text-sm font-medium text-zinc-400">Type</label>
                <select
                  id="filter-type"
                  value={filters.type || ''}
                  onChange={(e) => handleFilterChange('type', e.target.value)}
                  className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors duration-150 text-white"
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
                <label htmlFor="filter-category" className="text-sm font-medium text-zinc-400">Category</label>
                <select
                  id="filter-category"
                  value={filters.category || ''}
                  onChange={(e) => handleFilterChange('category', e.target.value)}
                  className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors duration-150 text-white"
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
                <label htmlFor="filter-account" className="text-sm font-medium text-zinc-400">Account</label>
                <select
                  id="filter-account"
                  value={filters.account || ''}
                  onChange={(e) => handleFilterChange('account', e.target.value)}
                  className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors duration-150 text-white"
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
                <label className="text-sm font-medium text-zinc-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Start Date
                </label>
                <input
                  type="date"
                  value={filters.start_date || ''}
                  onChange={(e) => handleFilterChange('start_date', e.target.value)}
                  className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors duration-150 text-white"
                />
              </div>

              {/* End Date */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  End Date
                </label>
                <input
                  type="date"
                  value={filters.end_date || ''}
                  onChange={(e) => handleFilterChange('end_date', e.target.value)}
                  className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors duration-150 text-white"
                />
              </div>

              {/* Min Amount */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">Min Amount ({currencySymbol})</label>
                <input
                  type="number"
                  placeholder="0"
                  value={filters.min_amount || ''}
                  onChange={(e) => handleFilterChange('min_amount', e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors duration-150 text-white"
                />
              </div>

              {/* Max Amount */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">Max Amount ({currencySymbol})</label>
                <input
                  type="number"
                  placeholder="∞"
                  value={filters.max_amount || ''}
                  onChange={(e) => handleFilterChange('max_amount', e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors duration-150 text-white"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
