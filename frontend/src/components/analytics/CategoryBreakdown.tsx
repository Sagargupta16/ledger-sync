import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { useCategoryBreakdown } from '@/hooks/api/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { formatCurrency } from '@/lib/formatters'
import { CHART_COLORS } from '@/constants/chartColors'
import EmptyState from '@/components/shared/EmptyState'
import Sparkline from '@/components/shared/Sparkline'

import { buildCategories, buildMonthlyHistoryByCategory } from './categoryBreakdownUtils'

interface CategoryBreakdownProps {
  readonly transactionType: 'income' | 'expense'
  readonly dateRange?: { start_date?: string | null; end_date?: string | null }
  readonly headerIcon: LucideIcon
  readonly headerIconColor: string
  readonly headerTitle: string
  readonly colorMap?: Record<string, string>
  readonly defaultColors?: readonly string[]
  readonly emptyIcon: LucideIcon
  readonly emptyTitle: string
  readonly emptyDescription: string
  readonly emptyActionLabel?: string
  readonly emptyActionHref?: string
  /**
   * When set, only this category is rendered (others hidden) and the
   * row is auto-expanded to show subcategories. Used by deep-link flows
   * like ``/spending?category=Food`` where the user wants to drill into
   * a single category's composition without seeing the full breakdown.
   */
  readonly categoryFilter?: string | null
}

export default function CategoryBreakdown({
  transactionType,
  dateRange,
  headerIcon: HeaderIcon,
  headerIconColor,
  headerTitle,
  colorMap,
  defaultColors = CHART_COLORS,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  emptyActionHref,
  categoryFilter,
}: CategoryBreakdownProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)

  const { data: categoryData, isLoading } = useCategoryBreakdown({
    transaction_type: transactionType,
    start_date: dateRange?.start_date ?? undefined,
    end_date: dateRange?.end_date ?? undefined,
  })

  // Pull all transactions to build the per-category 12-month sparkline.
  // useTransactions is widely cached (staleTime: Infinity, invalidated on
  // upload) so this is effectively free if any other page already mounted it.
  const { data: transactions = [] } = useTransactions()

  const monthlyHistoryByCategory = useMemo(
    () => buildMonthlyHistoryByCategory(transactions, transactionType),
    [transactions, transactionType],
  )

  const { categories, grandTotal } = useMemo(
    () => buildCategories(categoryData, colorMap, defaultColors, monthlyHistoryByCategory, categoryFilter),
    [categoryData, colorMap, defaultColors, monthlyHistoryByCategory, categoryFilter],
  )

  // Auto-expand when a single category is rendered (deep-link drill-down).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing local UI state to a URL-derived prop
    if (categoryFilter) setExpandedCategory(categoryFilter)
  }, [categoryFilter])

  const toggleExpand = (name: string) => {
    setExpandedCategory((prev) => (prev === name ? null : name))
  }

  if (isLoading) {
    return (
      <div className="bg-white/[0.04] p-6 rounded-xl border border-border">
        <div className="h-64 flex items-center justify-center">
          <div className="animate-pulse text-text-tertiary">Loading breakdown...</div>
        </div>
      </div>
    )
  }

  if (categories.length === 0) {
    return (
      <div className="bg-white/[0.04] p-6 rounded-xl border border-border">
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          description={emptyDescription}
          actionLabel={emptyActionLabel}
          actionHref={emptyActionHref}
          variant="chart"
        />
      </div>
    )
  }

  return (
    <div className="bg-white/[0.04] p-6 rounded-xl border border-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <HeaderIcon className={`w-5 h-5 ${headerIconColor}`} />
          <div>
            <h3 className="text-lg font-semibold text-white">{headerTitle}</h3>
            <p className="text-xs text-text-tertiary">{categories.length} categories &middot; {formatCurrency(grandTotal)} total</p>
          </div>
        </div>
      </div>

      {/* Stacked overview bar */}
      <div className="flex h-3 rounded-full overflow-hidden mb-6">
        {categories.map((cat) => (
          <motion.div
            key={cat.name}
            className="h-full transition-opacity hover:opacity-80 cursor-pointer"
            style={{ backgroundColor: cat.color, width: `${cat.percent}%` }}
            initial={{ width: 0 }}
            animate={{ width: `${cat.percent}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            onClick={() => toggleExpand(cat.name)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(cat.name) } }}
            role="button"
            tabIndex={0}
            aria-label={`${cat.name}: ${formatCurrency(cat.total)} (${cat.percent.toFixed(1)}%)`}
            title={`${cat.name}: ${formatCurrency(cat.total)} (${cat.percent.toFixed(1)}%)`}
          />
        ))}
      </div>

      {/* Category rows */}
      <div className="space-y-1.5">
        {categories.map((cat, i) => {
          const isExpanded = expandedCategory === cat.name
          const hasSubcategories = cat.subcategories.length > 0

          return (
            <div key={cat.name}>
              {/* Category row */}
              <button
                type="button"
                onClick={() => hasSubcategories && toggleExpand(cat.name)}
                className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-150 group ${
                  hasSubcategories ? 'cursor-pointer' : 'cursor-default'
                } ${isExpanded ? 'bg-white/[0.05] border border-white/[0.08]' : 'bg-white/[0.04] border border-border hover:bg-white/[0.05] hover:border-white/[0.10]'}`}
              >
                <div className="flex items-center gap-3">
                  {/* Color dot */}
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />

                  {/* Name */}
                  <span className="text-sm font-medium text-white flex-1 truncate">
                    {cat.name}
                  </span>

                  {/* Percentage + Amount */}
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {cat.percent.toFixed(1)}%
                  </span>
                  <span className="text-sm font-semibold text-white tabular-nums shrink-0 w-20 sm:w-28 text-right">
                    {formatCurrency(cat.total)}
                  </span>

                  {/* Expand chevron */}
                  {hasSubcategories && (
                    <motion.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-text-tertiary group-hover:text-white"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </motion.div>
                  )}
                </div>

                {/* Proportional bar + 12-month sparkline.
                    Bar answers "how much of total?", sparkline answers
                    "trending up or down across the last year?". They're
                    complementary -- bar is glanceable, sparkline adds
                    direction without taking the user to another page. */}
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: cat.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${cat.percent}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut', delay: i * 0.03 }}
                    />
                  </div>
                  {cat.monthlyHistory.length >= 2 && (
                    <Sparkline
                      variant="compact"
                      data={cat.monthlyHistory}
                      color={cat.color}
                      ariaLabel={`${cat.name} 12-month trend`}
                    />
                  )}
                </div>
              </button>

              {/* Expanded subcategories */}
              <AnimatePresence>
                {isExpanded && hasSubcategories && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="ml-3 mr-1 sm:ml-6 sm:mr-2 py-1 space-y-0.5">
                      {cat.subcategories.map((sub, si) => (
                        <div
                          key={sub.name}
                          className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-white/[0.05] transition-colors duration-150"
                        >
                          {/* Indent marker */}
                          <div
                            className="w-1.5 h-1.5 rounded-full shrink-0 opacity-60"
                            style={{ backgroundColor: cat.color }}
                          />

                          <span className="text-xs text-white flex-1 truncate">
                            {sub.name}
                          </span>

                          {/* Subcategory bar */}
                          <div className="w-12 md:w-20 h-1 rounded-full bg-white/5 overflow-hidden shrink-0">
                            <motion.div
                              className="h-full rounded-full opacity-70"
                              style={{ backgroundColor: cat.color }}
                              initial={{ width: 0 }}
                              animate={{ width: `${sub.percent}%` }}
                              transition={{ duration: 0.3, delay: si * 0.02 }}
                            />
                          </div>

                          <span className="text-xs text-text-tertiary tabular-nums shrink-0 w-10 text-right">
                            {sub.percent.toFixed(0)}%
                          </span>
                          <span className="text-xs font-medium text-white tabular-nums shrink-0 w-18 sm:w-24 text-right">
                            {formatCurrency(sub.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </div>
  )
}
