import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BarChart3, ChevronDown, CreditCard } from 'lucide-react'
import { useCategoryBreakdown } from '@/hooks/useAnalytics'
import { formatCurrency } from '@/lib/formatters'
import { CHART_COLORS } from '@/constants/chartColors'
import EmptyState from '@/components/shared/EmptyState'

const COLORS = CHART_COLORS

interface CategoryData {
  name: string
  total: number
  percent: number
  color: string
  subcategories: { name: string; amount: number; percent: number }[]
}

interface ExpenseTreemapProps {
  readonly dateRange?: { start_date?: string; end_date?: string }
}

export default function ExpenseTreemap({ dateRange }: ExpenseTreemapProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)

  const { data: treemapCategoryData, isLoading } = useCategoryBreakdown({
    transaction_type: 'expense',
    ...dateRange,
  })

  const { categories, grandTotal } = useMemo(() => {
    if (!treemapCategoryData?.categories) return { categories: [], grandTotal: 0 }

    const total = Object.values(treemapCategoryData.categories)
      .reduce((sum, catData: Record<string, unknown>) => sum + Math.abs(catData.total as number), 0)

    let colorIdx = 0
    const cats: CategoryData[] = Object.entries(treemapCategoryData.categories)
      .map(([category, catData]: [string, Record<string, unknown>]) => {
        const catTotal = Math.abs(catData.total as number)
        const color = COLORS[colorIdx++ % COLORS.length]

        // Build subcategory list
        const subs: CategoryData['subcategories'] = []
        if (catData.subcategories) {
          Object.entries(catData.subcategories as Record<string, number>)
            .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
            .forEach(([subcat, amount]) => {
              subs.push({
                name: subcat,
                amount: Math.abs(amount),
                percent: catTotal > 0 ? (Math.abs(amount) / catTotal) * 100 : 0,
              })
            })
        }

        return {
          name: category,
          total: catTotal,
          percent: total > 0 ? (catTotal / total) * 100 : 0,
          color,
          subcategories: subs,
        }
      })
      .sort((a, b) => b.total - a.total)

    return { categories: cats, grandTotal: total }
  }, [treemapCategoryData])

  const toggleExpand = (name: string) => {
    setExpandedCategory((prev) => (prev === name ? null : name))
  }

  if (isLoading) {
    return (
      <div className="glass p-6 rounded-xl border border-border">
        <div className="h-64 flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading breakdown...</div>
        </div>
      </div>
    )
  }

  if (categories.length === 0) {
    return (
      <div className="glass p-6 rounded-xl border border-border">
        <EmptyState
          icon={CreditCard}
          title="No expense data available"
          description="Upload your transaction data to see your expense breakdown."
          actionLabel="Upload Data"
          actionHref="/upload"
          variant="chart"
        />
      </div>
    )
  }

  return (
    <div className="glass p-6 rounded-xl border border-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-ios-purple" />
          <div>
            <h3 className="text-lg font-semibold text-white">Expense Breakdown</h3>
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
            title={`${cat.name}: ${formatCurrency(cat.total)} (${cat.percent.toFixed(1)}%)`}
          />
        ))}
      </div>

      {/* Category rows */}
      <div className="space-y-1">
        {categories.map((cat, i) => {
          const isExpanded = expandedCategory === cat.name
          const hasSubcategories = cat.subcategories.length > 0

          return (
            <div key={cat.name}>
              {/* Category row */}
              <button
                type="button"
                onClick={() => hasSubcategories && toggleExpand(cat.name)}
                className={`w-full text-left px-4 py-3 rounded-xl transition-colors group ${
                  hasSubcategories ? 'cursor-pointer' : 'cursor-default'
                } ${isExpanded ? 'bg-white/5' : 'hover:bg-white/10'}`}
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
                  <span className="text-sm font-semibold text-white tabular-nums shrink-0 w-28 text-right">
                    {formatCurrency(cat.total)}
                  </span>

                  {/* Expand chevron */}
                  {hasSubcategories && (
                    <motion.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-text-tertiary group-hover:text-foreground"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </motion.div>
                  )}
                </div>

                {/* Proportional bar */}
                <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: cat.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${cat.percent}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut', delay: i * 0.03 }}
                  />
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
                    <div className="ml-6 mr-2 py-1 space-y-0.5">
                      {cat.subcategories.map((sub, si) => (
                        <div
                          key={sub.name}
                          className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-white/10 transition-colors"
                        >
                          {/* Indent marker */}
                          <div
                            className="w-1.5 h-1.5 rounded-full shrink-0 opacity-60"
                            style={{ backgroundColor: cat.color }}
                          />

                          <span className="text-xs text-foreground flex-1 truncate">
                            {sub.name}
                          </span>

                          {/* Subcategory bar */}
                          <div className="w-20 h-1 rounded-full bg-white/5 overflow-hidden shrink-0">
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
                          <span className="text-xs font-medium text-foreground tabular-nums shrink-0 w-24 text-right">
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
