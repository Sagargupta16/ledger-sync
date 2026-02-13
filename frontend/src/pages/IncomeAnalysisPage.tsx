import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, DollarSign, Activity, Wallet, Briefcase, PiggyBank, ChevronDown } from 'lucide-react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Line, ReferenceLine, PieChart, Pie, Cell } from 'recharts'
import { chartTooltipProps, PageHeader } from '@/components/ui'
import { useState, useMemo } from 'react'
import { formatCurrency, formatCurrencyShort, formatPercent } from '@/lib/formatters'
import { getCurrentYear, getCurrentMonth, getCurrentFY, getAnalyticsDateRange, getDateKey, type AnalyticsViewMode } from '@/lib/dateUtils'
import { CHART_ANIMATION_THRESHOLD } from '@/constants'
import EmptyState from '@/components/shared/EmptyState'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import { usePreferencesStore } from '@/store/preferencesStore'
import { useCategoryBreakdown } from '@/hooks/useAnalytics'
import {
  calculateIncomeByCategoryBreakdown,
  calculateCashbacksTotal,
  INCOME_CATEGORY_COLORS,
} from '@/lib/preferencesUtils'
import { CHART_COLORS } from '@/constants/chartColors'

// Icons for income categories (based on actual data categories)
const INCOME_CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'Employment Income': Briefcase,
  'Investment Income': TrendingUp,
  'Refund & Cashbacks': Wallet,
  'One-time Income': PiggyBank,
  'Other Income': DollarSign,
  'Business/Self Employment Income': Activity,
}

const BREAKDOWN_COLORS = CHART_COLORS

interface IncomeCategoryData {
  name: string
  total: number
  percent: number
  color: string
  subcategories: { name: string; amount: number; percent: number }[]
}

function IncomeSourcesBreakdown({ dateRange }: Readonly<{ dateRange: { start_date?: string; end_date?: string } }>) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)

  const { data: categoryData, isLoading } = useCategoryBreakdown({
    transaction_type: 'income',
    ...dateRange,
  })

  const { categories, grandTotal } = useMemo(() => {
    if (!categoryData?.categories) return { categories: [], grandTotal: 0 }

    const total = Object.values(categoryData.categories)
      .reduce((sum, catData: Record<string, unknown>) => sum + Math.abs(catData.total as number), 0)

    let colorIdx = 0
    const cats: IncomeCategoryData[] = Object.entries(categoryData.categories)
      .map(([category, catData]: [string, Record<string, unknown>]) => {
        const catTotal = Math.abs(catData.total as number)
        const color = INCOME_CATEGORY_COLORS[category] || BREAKDOWN_COLORS[colorIdx % BREAKDOWN_COLORS.length]
        colorIdx++

        const subs: IncomeCategoryData['subcategories'] = []
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

        return { name: category, total: catTotal, percent: total > 0 ? (catTotal / total) * 100 : 0, color, subcategories: subs }
      })
      .sort((a, b) => b.total - a.total)

    return { categories: cats, grandTotal: total }
  }, [categoryData])

  const toggleExpand = (name: string) => {
    setExpandedCategory((prev) => (prev === name ? null : name))
  }

  if (isLoading) {
    return (
      <div className="glass p-6 rounded-xl border border-white/10">
        <div className="h-64 flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading breakdown...</div>
        </div>
      </div>
    )
  }

  if (categories.length === 0) {
    return (
      <div className="glass p-6 rounded-xl border border-white/10">
        <EmptyState
          icon={Wallet}
          title="No income data available"
          description="Upload your transaction data to see your income breakdown."
          actionLabel="Upload Data"
          actionHref="/upload"
          variant="chart"
        />
      </div>
    )
  }

  return (
    <div className="glass p-6 rounded-xl border border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <DollarSign className="w-5 h-5 text-green-400" />
          <div>
            <h3 className="text-lg font-semibold text-white">Income Sources</h3>
            <p className="text-xs text-gray-500">{categories.length} categories &middot; {formatCurrency(grandTotal)} total</p>
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
              <button
                type="button"
                onClick={() => hasSubcategories && toggleExpand(cat.name)}
                className={`w-full text-left px-4 py-3 rounded-xl transition-all group ${
                  hasSubcategories ? 'cursor-pointer' : 'cursor-default'
                } ${isExpanded ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="text-sm font-medium text-white flex-1 truncate">
                    {cat.name}
                  </span>
                  <span className="text-xs text-gray-400 tabular-nums shrink-0">
                    {cat.percent.toFixed(1)}%
                  </span>
                  <span className="text-sm font-semibold text-white tabular-nums shrink-0 w-28 text-right">
                    {formatCurrency(cat.total)}
                  </span>
                  {hasSubcategories && (
                    <motion.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-gray-500 group-hover:text-gray-300"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </motion.div>
                  )}
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: cat.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${cat.percent}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut', delay: i * 0.03 }}
                  />
                </div>
              </button>

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
                          className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-white/[0.03] transition-colors"
                        >
                          <div
                            className="w-1.5 h-1.5 rounded-full shrink-0 opacity-60"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="text-xs text-gray-300 flex-1 truncate">
                            {sub.name}
                          </span>
                          <div className="w-20 h-1 rounded-full bg-white/[0.06] overflow-hidden shrink-0">
                            <motion.div
                              className="h-full rounded-full opacity-70"
                              style={{ backgroundColor: cat.color }}
                              initial={{ width: 0 }}
                              animate={{ width: `${sub.percent}%` }}
                              transition={{ duration: 0.3, delay: si * 0.02 }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 tabular-nums shrink-0 w-10 text-right">
                            {sub.percent.toFixed(0)}%
                          </span>
                          <span className="text-xs font-medium text-gray-300 tabular-nums shrink-0 w-24 text-right">
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

export default function IncomeAnalysisPage() {
  const navigate = useNavigate()
  const { data: preferences } = usePreferences()
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || 4

  // Time filter state
  const { displayPreferences } = usePreferencesStore()
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>(
    (displayPreferences.defaultTimeRange as AnalyticsViewMode) || 'fy'
  )
  const [currentYear, setCurrentYear] = useState(getCurrentYear())
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())
  const [currentFY, setCurrentFY] = useState(getCurrentFY(fiscalYearStartMonth))
  
  const { data: transactions } = useTransactions()

  // Get date range based on current filter
  const dateRange = useMemo(() => {
    return getAnalyticsDateRange(viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth)
  }, [viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth])

  const dataDateRange = useMemo(() => {
    if (!transactions || transactions.length === 0) return { minDate: undefined, maxDate: undefined }
    const dates = transactions.map(t => t.date.substring(0, 10)).sort()
    return { minDate: dates[0], maxDate: dates[dates.length - 1] }
  }, [transactions])

  // Filter transactions by date range
  const filteredTransactions = useMemo(() => {
    if (!transactions) return []
    if (!dateRange.start_date) return transactions
    
    return transactions.filter((t) => {
      // Compare only the date part (YYYY-MM-DD) to handle datetime strings correctly
      const txDate = getDateKey(t.date)
      return txDate >= dateRange.start_date! && (!dateRange.end_date || txDate <= dateRange.end_date)
    })
  }, [transactions, dateRange])

  // Calculate totals for filtered period
  const totalIncome = useMemo(() => {
    return filteredTransactions
      .filter((t) => t.type === 'Income')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)
  }, [filteredTransactions])

  // Calculate income breakdown by actual data category (for display)
  const incomeBreakdown = useMemo(() => {
    return calculateIncomeByCategoryBreakdown(filteredTransactions)
  }, [filteredTransactions])

  // Calculate total cashbacks using preferences classification
  const cashbacksTotal = useMemo(() => {
    if (!preferences) return 0
    
    const incomeClassification = {
      taxable: preferences.taxable_income_categories || [],
      investmentReturns: preferences.investment_returns_categories || [],
      nonTaxable: preferences.non_taxable_income_categories || [],
      other: preferences.other_income_categories || [],
    }
    
    return calculateCashbacksTotal(filteredTransactions, incomeClassification)
  }, [filteredTransactions, preferences])

  // Prepare income category chart data (using actual data categories)
  const incomeTypeChartData = useMemo(() => {
    if (!incomeBreakdown) return []
    const defaultColor = '#6b7280'
    return Object.entries(incomeBreakdown)
      .filter(([, value]) => value > 0)
      .map(([category, value]) => ({
        name: category,
        category,
        value,
        color: INCOME_CATEGORY_COLORS[category] || defaultColor,
      }))
      .sort((a, b) => b.value - a.value)
  }, [incomeBreakdown])

  // Get primary income type
  const primaryIncomeType = incomeTypeChartData[0]?.name || 'N/A'

  // Process monthly income trend data with 3-month rolling average
  const monthlyTrendData = useMemo(() => {
    const incomeTransactions = filteredTransactions.filter((t) => t.type === 'Income')

    const monthlyMap: Record<string, number> = {}
    for (const tx of incomeTransactions) {
      const month = tx.date.substring(0, 7) // YYYY-MM
      monthlyMap[month] = (monthlyMap[month] || 0) + Math.abs(tx.amount)
    }

    const sorted = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, income]) => ({
        month,
        label: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        income,
      }))

    // Add 3-month rolling average
    return sorted.map((d, i) => {
      const start = Math.max(0, i - 2)
      const window = sorted.slice(start, i + 1)
      return {
        ...d,
        incomeAvg: window.reduce((s, w) => s + w.income, 0) / window.length,
      }
    })
  }, [filteredTransactions])

  // Peak income for reference line
  const peakIncome = useMemo(
    () => Math.max(...monthlyTrendData.map(d => d.income), 0),
    [monthlyTrendData]
  )

  const growthRate = useMemo(() => {
    if (monthlyTrendData.length < 2) return 0
    const nonZeroData = monthlyTrendData.filter(d => d.income > 0)
    if (nonZeroData.length < 2) return 0
    const lastValue = nonZeroData.at(-1)?.income || 0
    const firstValue = nonZeroData[0]?.income || 1
    return ((lastValue - firstValue) / firstValue * 100)
  }, [monthlyTrendData])

  const isLoading = !transactions

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Income Analysis"
          subtitle="Track your income sources and trends"
          action={
            <AnalyticsTimeFilter
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              currentYear={currentYear}
              currentMonth={currentMonth}
              currentFY={currentFY}
              onYearChange={setCurrentYear}
              onMonthChange={setCurrentMonth}
              onFYChange={setCurrentFY}
              minDate={dataDateRange.minDate}
              maxDate={dataDateRange.maxDate}
              fiscalYearStartMonth={fiscalYearStartMonth}
            />
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass rounded-xl border border-white/10 p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-500/20 rounded-xl shadow-lg shadow-green-500/30">
                <DollarSign className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Income</p>
                <p className="text-2xl font-bold">{isLoading ? '...' : formatCurrency(totalIncome)}</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass rounded-xl border border-white/10 p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/20 rounded-xl shadow-lg shadow-primary/30">
                <Activity className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Primary Income Type</p>
                <p className="text-2xl font-bold">{isLoading ? '...' : primaryIncomeType}</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass rounded-xl border border-white/10 p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-500/20 rounded-xl shadow-lg shadow-blue-500/30">
                <TrendingUp className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Growth Rate</p>
                <p className="text-2xl font-bold">{isLoading ? '...' : formatPercent(growthRate, true)}</p>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="glass rounded-xl border border-white/10 p-6 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-cyan-500/20 rounded-xl shadow-lg shadow-cyan-500/30">
                <Wallet className="w-6 h-6 text-cyan-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">💳 Cashbacks Earned</p>
                <p className="text-2xl font-bold text-cyan-400">{isLoading ? '...' : formatCurrency(cashbacksTotal)}</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Income Category Breakdown */}
        <motion.div 
          className="glass p-6 rounded-xl border border-white/10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
        >
          <h3 className="text-lg font-semibold text-white mb-4">Income by Category</h3>
          {incomeTypeChartData.length > 0 ? (
            <div className="flex flex-col lg:flex-row items-center gap-8">
              <div className="w-64 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={incomeTypeChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      dataKey="value"
                      stroke="none"
                      onClick={(data: { name?: string }) => {
                        if (data?.name) navigate(`/transactions?type=Income&category=${encodeURIComponent(data.name)}`)
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {incomeTypeChartData.map((entry) => (
                        <Cell key={`cell-${entry.name}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      {...chartTooltipProps}
                      formatter={(value: number | undefined) => value === undefined ? '' : formatCurrency(value)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {incomeTypeChartData.map((item) => {
                  const Icon = INCOME_CATEGORY_ICONS[item.category] || DollarSign
                  const percentage = incomeBreakdown
                    ? ((item.value / Object.values(incomeBreakdown).reduce((a, b) => a + b, 0)) * 100).toFixed(1)
                    : '0'
                  return (
                    <div
                      key={item.name}
                      className="p-4 rounded-lg bg-gray-800/30 hover:bg-gray-800/50 transition-all"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div 
                          className="p-2 rounded-lg"
                          style={{ backgroundColor: `${item.color}20` }}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-medium text-white">{item.name}</p>
                          <p className="text-xs text-gray-400">{percentage}% of income</p>
                        </div>
                      </div>
                      <p className="text-xl font-bold" style={{ color: item.color }}>
                        {formatCurrency(item.value)}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={Wallet}
              title="No income type data available"
              description="Configure income categories in Settings to see breakdown."
              actionLabel="Go to Settings"
              actionHref="/settings"
            />
          )}
        </motion.div>

        {/* Income Trend Chart — Monthly with 3-month rolling average */}
        <motion.div
          className="glass p-6 rounded-xl border border-white/10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-green-400" />
              <div>
                <h3 className="text-lg font-semibold text-white">Income Trend</h3>
                <p className="text-sm text-gray-500">Monthly income with 3-month rolling average</p>
              </div>
            </div>

            {isLoading && (
              <div className="h-96 flex items-center justify-center">
                <div className="animate-pulse text-gray-400">Loading chart...</div>
              </div>
            )}
            {!isLoading && monthlyTrendData.length > 0 && (
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={monthlyTrendData}>
                  <defs>
                    <linearGradient id="incomeTrendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34c759" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#34c759" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="label"
                    stroke="#9ca3af"
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    interval={Math.max(0, Math.floor(monthlyTrendData.length / 12) - 1)}
                  />
                  <YAxis
                    stroke="#9ca3af"
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    tickFormatter={(value) => formatCurrencyShort(value)}
                  />
                  <Tooltip
                    {...chartTooltipProps}
                    labelFormatter={(_label: string, payload: Array<{ payload?: { month?: string } }>) => {
                      const month = payload?.[0]?.payload?.month
                      return month ? new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : ''
                    }}
                    formatter={(value: number | undefined, name: string | undefined) => [
                      value === undefined ? '' : formatCurrency(value),
                      name === 'incomeAvg' ? 'Income (3m avg)' : 'Income',
                    ]}
                    itemSorter={(item) => -(item.value as number)}
                  />
                  <ReferenceLine
                    y={peakIncome}
                    stroke="rgba(255,255,255,0.2)"
                    strokeDasharray="3 3"
                    label={{ value: `Peak: ${formatCurrencyShort(peakIncome)}`, fill: '#9ca3af', fontSize: 10, position: 'insideTopRight' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="income"
                    stroke="#34c759"
                    fill="url(#incomeTrendGradient)"
                    strokeWidth={1.5}
                    isAnimationActive={monthlyTrendData.length < CHART_ANIMATION_THRESHOLD}
                  />
                  <Line
                    type="monotone"
                    dataKey="incomeAvg"
                    stroke="#34c759"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={false}
                    name="Income (3m avg)"
                    isAnimationActive={monthlyTrendData.length < CHART_ANIMATION_THRESHOLD}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
            {!isLoading && monthlyTrendData.length === 0 && (
              <EmptyState
                icon={TrendingUp}
                title="No income data available"
                description="Start by uploading your transaction data to see income trends."
                actionLabel="Upload Data"
                actionHref="/upload"
                variant="chart"
              />
            )}
          </div>
        </motion.div>

        {/* Income Sources Breakdown — bar style matching Expense Breakdown */}
        <IncomeSourcesBreakdown dateRange={dateRange} />
      </div>
    </div>
  )
}
