import { useState, useCallback, useEffect, useRef } from 'react'
import { Search, Filter, X, Calendar } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

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

export default function TransactionFilters({ onFilterChange, categories, accounts }: TransactionFiltersProps) {
  const [filters, setFilters] = useState<FilterValues>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const isFirstRender = useRef(true)

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
    onFilterChange(newFilters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <div className="glass rounded-xl border border-white/10 p-4 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search transactions by note, category, or account..."
              value={searchQuery}
              onChange={(e) => handleFilterChange('query', e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-transparent border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            />
          </div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${showAdvanced
                ? 'bg-primary text-white shadow-lg shadow-primary/30'
                : 'bg-white/5 hover:bg-white/10 border border-white/10'
              }`}
          >
            <Filter className="w-4 h-4" />
            <span className="text-sm font-medium">Filters</span>
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 text-red-500 hover:bg-red-500/30 transition-colors"
            >
              <X className="w-4 h-4" />
              <span className="text-sm font-medium">Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Advanced Filters */}
      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass rounded-xl border border-white/10 p-6 shadow-lg space-y-4 overflow-hidden"
          >
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Filter className="w-5 h-5 text-primary" />
              Advanced Filters
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Type Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Type</label>
                <select
                  value={filters.type || ''}
                  onChange={(e) => handleFilterChange('type', e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-white"
                >
                  <option value="" className="bg-gray-900 text-white">All Types</option>
                  {TRANSACTION_TYPES.map((type) => (
                    <option key={type} value={type} className="bg-gray-900 text-white">
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              {/* Category Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Category</label>
                <select
                  value={filters.category || ''}
                  onChange={(e) => handleFilterChange('category', e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-white"
                >
                  <option value="" className="bg-gray-900 text-white">All Categories</option>
                  {categories.map((category) => (
                    <option key={category} value={category} className="bg-gray-900 text-white">
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              {/* Account Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Account</label>
                <select
                  value={filters.account || ''}
                  onChange={(e) => handleFilterChange('account', e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-white"
                >
                  <option value="" className="bg-gray-900 text-white">All Accounts</option>
                  {accounts.map((account) => (
                    <option key={account} value={account} className="bg-gray-900 text-white">
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
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
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
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
              </div>

              {/* Min Amount */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Min Amount (₹)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={filters.min_amount || ''}
                  onChange={(e) => handleFilterChange('min_amount', e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
              </div>

              {/* Max Amount */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Max Amount (₹)</label>
                <input
                  type="number"
                  placeholder="∞"
                  value={filters.max_amount || ''}
                  onChange={(e) => handleFilterChange('max_amount', e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
