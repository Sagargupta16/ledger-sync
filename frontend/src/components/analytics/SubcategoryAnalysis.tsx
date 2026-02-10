import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { formatCurrency, formatCurrencyShort, formatPercent } from '@/lib/formatters'
import { CHART_COLORS, CHART_AXIS_COLOR, CHART_GRID_COLOR } from '@/constants/chartColors'
import { getCurrentYear, getCurrentMonth } from '@/lib/dateUtils'
import { chartTooltipProps } from '@/components/ui'

const COLORS = CHART_COLORS

interface SubcategoryAnalysisProps {
  categoryData: Array<{
    category: string
    amount: number
    percentage: number
    subcategories?: Record<string, number>
  }>
}

export default function SubcategoryAnalysis({ categoryData }: Readonly<SubcategoryAnalysisProps>) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [cumulative, setCumulative] = useState(true)
  const [viewMode, setViewMode] = useState<'monthly' | 'yearly' | 'all_time'>('yearly')
  const [currentYear, setCurrentYear] = useState(getCurrentYear())
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())
  const { data: transactions } = useTransactions()

  // Get subcategory details for selected category
  const subcategoryDetails = useMemo(() => {
    if (!selectedCategory || !transactions) return null

    // Filter transactions based on view mode
    let categoryTransactions = transactions.filter(
      (t) => t.type === 'Expense' && t.category === selectedCategory
    )

    if (viewMode === 'yearly') {
      categoryTransactions = categoryTransactions.filter(
        (t) => Number.parseInt(t.date.substring(0, 4)) === currentYear
      )
    } else if (viewMode === 'monthly') {
      categoryTransactions = categoryTransactions.filter(
        (t) => t.date.substring(0, 7) === currentMonth
      )
    }

    // Group by subcategory
    const subcatGroups: Record<string, { amount: number; count: number }> = {}
    categoryTransactions.forEach((tx) => {
      const subcat = tx.subcategory || 'Uncategorized'
      if (!subcatGroups[subcat]) {
        subcatGroups[subcat] = { amount: 0, count: 0 }
      }
      subcatGroups[subcat].amount += Math.abs(tx.amount)
      subcatGroups[subcat].count += 1
    })

    // Group by period for trend
    const periodGroups: Record<string, Record<string, number>> = {}
    categoryTransactions.forEach((tx) => {
      let period: string
      if (viewMode === 'monthly') {
        period = tx.date.substring(8, 10) // DD (day)
      } else if (viewMode === 'yearly') {
        period = tx.date.substring(5, 7) // MM (month)
      } else {
        // all_time: quarterly
        const year = tx.date.substring(0, 4)
        const month = Number.parseInt(tx.date.substring(5, 7))
        const quarter = Math.ceil(month / 3)
        period = `${year}-Q${quarter}`
      }
      
      const subcat = tx.subcategory || 'Uncategorized'
      
      if (!periodGroups[period]) periodGroups[period] = {}
      if (!periodGroups[period][subcat]) periodGroups[period][subcat] = 0
      
      periodGroups[period][subcat] += Math.abs(tx.amount)
    })

    // Get all periods
    let allPeriods: string[] = []
    if (viewMode === 'monthly') {
      const year = Number.parseInt(currentMonth.substring(0, 4))
      const month = Number.parseInt(currentMonth.substring(5, 7))
      const daysInMonth = new Date(year, month, 0).getDate()
      allPeriods = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'))
    } else if (viewMode === 'yearly') {
      allPeriods = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
    } else {
      allPeriods = Object.keys(periodGroups).sort((a, b) => a.localeCompare(b))
    }

    const subcatNames = Object.keys(subcatGroups)

    // Create trend data with all periods filled
    let trendData = allPeriods.map((period) => {
      let displayPeriod: string
      if (viewMode === 'yearly') {
        displayPeriod = new Date(currentYear, Number.parseInt(period) - 1).toLocaleDateString('en-US', { month: 'short' })
      } else {
        displayPeriod = period
      }
      const entry: Record<string, string | number> = {
        period,
        displayPeriod,
      }
      subcatNames.forEach((subcat) => {
        entry[subcat] = periodGroups[period]?.[subcat] || 0
      })
      return entry
    })

    // Calculate cumulative if needed
    if (cumulative) {
      const cumulativeData: Record<string, number> = {}
      subcatNames.forEach((subcat) => {
        cumulativeData[subcat] = 0
      })

      trendData = trendData.map((entry) => {
        const newEntry: Record<string, string | number> = { 
          period: entry.period,
          displayPeriod: entry.displayPeriod
        }
        subcatNames.forEach((subcat) => {
          cumulativeData[subcat] += (entry[subcat] as number) || 0
          newEntry[subcat] = cumulativeData[subcat]
        })
        return newEntry
      })
    }

    const subcategories = Object.entries(subcatGroups)
      .map(([name, data]) => ({
        name,
        amount: data.amount,
        count: data.count,
        percentage: (data.amount / categoryTransactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0)) * 100,
      }))
      .sort((a, b) => b.amount - a.amount)

    return {
      subcategories,
      trendData,
      totalAmount: categoryTransactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0),
      totalCount: categoryTransactions.length,
    }
  }, [selectedCategory, transactions, cumulative, viewMode, currentYear, currentMonth])

  const subcategoryNames = useMemo(() => {
    if (!subcategoryDetails) return []
    return subcategoryDetails.subcategories.map((s) => s.name)
  }, [subcategoryDetails])

  return (
    <motion.div
      className="glass p-6 rounded-xl border border-white/10"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7 }}
    >
      <h3 className="text-lg font-semibold text-white mb-4">Category Breakdown</h3>
      <div className="space-y-2">
        {categoryData.map((item, index) => (
          <div key={item.category}>
            <motion.button
              onClick={() => setSelectedCategory(selectedCategory === item.category ? null : item.category)}
              className="w-full flex items-center justify-between p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-all border border-white/5"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              <div className="flex items-center gap-4 flex-1">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <div className="flex-1 text-left">
                  <div className="font-medium text-white">{item.category}</div>
                  <div className="text-sm text-muted-foreground">
                    {item.subcategories && Object.keys(item.subcategories).length > 0
                      ? `${Object.keys(item.subcategories).length} subcategories`
                      : 'No subcategories'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="font-semibold text-white">
                    {formatCurrency(item.amount)}
                  </div>
                  <div className="text-sm text-muted-foreground">{formatPercent(item.percentage)}</div>
                </div>
                {selectedCategory === item.category ? (
                  <ChevronUp className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
            </motion.button>

            <AnimatePresence>
              {selectedCategory === item.category && subcategoryDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 p-4 bg-white/[0.03] rounded-lg border border-white/5">
                    {/* Filters and Navigation */}
                    <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-2">
                        {/* View Mode Dropdown */}
                        <select
                          value={viewMode}
                          onChange={(e) => setViewMode(e.target.value as 'monthly' | 'yearly' | 'all_time')}
                          className="px-3 py-1.5 bg-blue-500/20 border border-blue-500/30 rounded-lg text-blue-300 text-sm focus:outline-none"
                        >
                          <option value="monthly" className="bg-gray-800 text-gray-200">Monthly View</option>
                          <option value="yearly" className="bg-gray-800 text-gray-200">Yearly View</option>
                          <option value="all_time" className="bg-gray-800 text-gray-200">All Time</option>
                        </select>
                        
                        {/* Cumulative Toggle */}
                        <select
                          value={cumulative ? 'cumulative' : 'regular'}
                          onChange={(e) => setCumulative(e.target.value === 'cumulative')}
                          className="px-3 py-1.5 bg-gray-800/80 border border-white/10 rounded-lg text-gray-200 text-sm focus:outline-none"
                        >
                          <option value="cumulative" className="bg-gray-800 text-gray-200">Cumulative</option>
                          <option value="regular" className="bg-gray-800 text-gray-200">Regular</option>
                        </select>
                      </div>

                      {/* Navigation */}
                      {viewMode === 'monthly' && (
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              const date = new Date(currentMonth + '-01')
                              date.setMonth(date.getMonth() - 1)
                              setCurrentMonth(date.toISOString().substring(0, 7))
                            }}
                            className="p-1.5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-white transition-colors"
                            type="button"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="text-white text-sm font-medium min-w-25 text-center">
                            {new Date(currentMonth + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                          </span>
                          <button
                            onClick={() => {
                              const date = new Date(currentMonth + '-01')
                              date.setMonth(date.getMonth() + 1)
                              setCurrentMonth(date.toISOString().substring(0, 7))
                            }}
                            className="p-1.5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-white transition-colors"
                            type="button"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      {viewMode === 'yearly' && (
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setCurrentYear((prev) => prev - 1)}
                            className="p-1.5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-white transition-colors"
                            type="button"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="text-white text-sm font-medium min-w-20 text-center">Year {currentYear}</span>
                          <button
                            onClick={() => setCurrentYear((prev) => prev + 1)}
                            className="p-1.5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-white transition-colors"
                            type="button"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="p-3 bg-white/[0.04] rounded-lg">
                        <div className="text-sm text-muted-foreground mb-1">Total Spending</div>
                        <div className="text-lg font-semibold text-white">
                          {formatCurrency(subcategoryDetails.totalAmount)}
                        </div>
                      </div>
                      <div className="p-3 bg-white/[0.04] rounded-lg">
                        <div className="text-sm text-muted-foreground mb-1">Transactions</div>
                        <div className="text-lg font-semibold text-white">
                          {subcategoryDetails.totalCount}
                        </div>
                      </div>
                    </div>

                    <div className="mb-4">
                      <h4 className="text-sm font-semibold text-gray-300 mb-2">Subcategory Breakdown</h4>
                      <div className="space-y-2">
                        {subcategoryDetails.subcategories.map((subcat, idx) => (
                          <div
                            key={subcat.name}
                            className="flex items-center justify-between p-2 bg-white/[0.03] rounded"
                          >
                            <div className="flex items-center gap-2 flex-1">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: COLORS[(index + idx) % COLORS.length] }}
                              />
                              <span className="text-sm text-gray-300">{subcat.name}</span>
                              <span className="text-xs text-text-tertiary">({subcat.count} txns)</span>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium text-white">
                                {formatCurrency(subcat.amount)}
                              </div>
                              <div className="text-xs text-muted-foreground">{formatPercent(subcat.percentage)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {subcategoryDetails.trendData.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-300 mb-2">Monthly Trend</h4>
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={subcategoryDetails.trendData}>
                            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                            <XAxis
                              dataKey="displayPeriod"
                              stroke={CHART_AXIS_COLOR}
                              tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }}
                            />
                            <YAxis
                              stroke={CHART_AXIS_COLOR}
                              tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }}
                              tickFormatter={(value) => formatCurrencyShort(value)}
                            />
                            <Tooltip
                              {...chartTooltipProps}
                              formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
                            />
                            {subcategoryNames.map((name, idx) => (
                              <Line
                                key={name}
                                type="natural"
                                dataKey={name}
                                stroke={COLORS[(index + idx) % COLORS.length]}
                                strokeWidth={2}
                                dot={{ r: 3 }}
                                connectNulls
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
