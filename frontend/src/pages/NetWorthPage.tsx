import { motion } from 'framer-motion'
import { rawColors } from '@/constants/colors'
import { CHART_AXIS_COLOR } from '@/constants/chartColors'
import { TrendingUp, PiggyBank, CreditCard, BarChart3, ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import { useAccountBalances } from '@/hooks/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, LabelList } from 'recharts'
import { chartTooltipProps, PageHeader } from '@/components/ui'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { formatCurrency, formatCurrencyShort, formatPercent, formatDateTick } from '@/lib/formatters'
import { CreditCardHealth } from '@/components/analytics'
import { CHART_ANIMATION_THRESHOLD } from '@/constants'
import EmptyState from '@/components/shared/EmptyState'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import { getCurrentYear, getCurrentMonth, getCurrentFY, getAnalyticsDateRange, type AnalyticsViewMode } from '@/lib/dateUtils'
import { accountClassificationsService } from '@/services/api/accountClassifications'
import { usePreferencesStore } from '@/store/preferencesStore'

// Category display configuration
const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  'Cash & Wallets': { label: 'Cash & Wallets', color: rawColors.ios.green },
  'Bank Accounts': { label: 'Bank Accounts', color: rawColors.ios.blue },
  'Investments': { label: 'Investments', color: rawColors.ios.purple },
  'Loans/Lended': { label: 'Loans/Lended', color: rawColors.ios.red },
  'Credit Cards': { label: 'Credit Cards', color: rawColors.ios.orange },
  // Fallback categories
  'cashbank': { label: 'Cash & Bank', color: rawColors.ios.blue },
  'invested': { label: 'Investments', color: rawColors.ios.purple },
  'lended': { label: 'Lended', color: rawColors.ios.teal },
  'liability': { label: 'Liabilities', color: rawColors.ios.red },
  'other': { label: 'Other', color: rawColors.text.tertiary },
}

/** Classify an account based on classifications map, investment mappings, or name heuristics */
function resolveAccountType(
  accountName: string,
  classifications: Record<string, string>,
  investmentMappings: Record<string, unknown>,
): string {
  if (classifications[accountName]) {
    if (classifications[accountName] === 'Investments') return 'Investments'
    if (classifications[accountName] === 'Cash' || classifications[accountName] === 'Other Wallets') return 'Cash & Wallets'
    return classifications[accountName]
  }
  if (investmentMappings[accountName]) return 'Investments'
  const name = accountName.toLowerCase()
  if (name.includes('credit') || name.includes('card')) return 'Credit Cards'
  if (name.includes('bank')) return 'Bank Accounts'
  if (name.includes('cash') || name.includes('wallet')) return 'Cash & Wallets'
  return 'Other'
}

/** Classify an account into a display category for grouping */
function resolveAccountCategory(
  accountName: string,
  classifications: Record<string, string>,
  investmentMappings: Record<string, unknown>,
): string {
  const classification = classifications[accountName]
  if (classification) {
    switch (classification) {
      case 'Cash':
      case 'Other Wallets':
        return 'Cash & Wallets'
      case 'Bank Accounts':
        return 'Bank Accounts'
      case 'Investments':
        return 'Investments'
      case 'Credit Cards':
        return 'Credit Cards'
      case 'Loans':
      case 'Loans/Lended':
        return 'Loans/Lended'
      default:
        return classification
    }
  }
  if (investmentMappings[accountName]) return 'Investments'
  const name = accountName.toLowerCase()
  if (name.includes('credit') || name.includes('card')) return 'Credit Cards'
  if (name.includes('bank')) return 'Bank Accounts'
  if (name.includes('cash') || name.includes('wallet')) return 'Cash & Wallets'
  if (name.includes('loan') || name.includes('emi') || name.includes('lend')) return 'Loans/Lended'
  return 'Other'
}

/** Compute daily cumulative net worth from transactions */
function computeNetWorthTimeSeries(
  transactions: Array<{ date: string; type: string; amount: number }>,
  allCategories: string[],
  categoryProportions: Record<string, number>,
): Array<Record<string, number | string>> {
  if (!transactions.length) return []

  const dailyMap: Record<string, { income: number; expense: number }> = {}
  for (const tx of transactions) {
    const day = tx.date.substring(0, 10)
    if (!dailyMap[day]) dailyMap[day] = { income: 0, expense: 0 }
    if (tx.type === 'Income') dailyMap[day].income += tx.amount
    else if (tx.type === 'Expense') dailyMap[day].expense += tx.amount
  }

  const sortedDays = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b))
  let cumNW = 0
  let cumIncome = 0
  let cumExpense = 0

  return sortedDays.map(([date, { income, expense }]) => {
    const flow = income - expense
    cumNW += flow
    cumIncome += income
    cumExpense += expense
    const positiveNW = Math.max(cumNW, 0)

    const point: Record<string, number | string> = {
      date,
      netWorth: cumNW,
      dailyFlow: flow,
      cumulativeIncome: cumIncome,
      cumulativeExpenses: cumExpense,
    }

    allCategories.forEach(cat => {
      point[cat] = positiveNW * (categoryProportions[cat] || 0)
    })

    return point
  })
}

interface AccountCategoryTableProps {
  readonly accounts: Record<string, { balance: number; transactions: number }>
  readonly filterFn: (balance: number) => boolean
  readonly total: number
  readonly balanceColorClass: string
  readonly headerBalanceColorClass: string
  readonly expandedCategories: Set<string>
  readonly onToggleCategory: (category: string) => void
  readonly getAccountType: (name: string) => string
  readonly emptyIcon: LucideIcon
  readonly emptyTitle: string
  readonly emptyDescription: string
  readonly isLoading: boolean
}

function AccountCategoryTable({
  accounts,
  filterFn,
  total,
  balanceColorClass,
  headerBalanceColorClass,
  expandedCategories,
  onToggleCategory,
  getAccountType,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  isLoading,
}: AccountCategoryTableProps) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading accounts...</div>
  }

  const hasAccounts = Object.keys(accounts).some(name => filterFn(accounts[name].balance))

  if (!hasAccounts) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        variant="compact"
      />
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground">Account</th>
            <th onClick={() => toggleSort('balance')} className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground cursor-pointer hover:text-white select-none">
              Balance {sortKey === 'balance' && (sortDir === 'asc' ? '\u2191' : '\u2193')}
            </th>
            <th className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground">% Allocated</th>
            <th className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground">Type</th>
            <th className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground">Transactions</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(accounts)
            .filter(([, accountData]) => filterFn(accountData.balance) && Math.abs(accountData.balance) >= 0.01)
            .sort((a, b) => {
              if (sortKey === 'balance') {
                const cmp = Math.abs(a[1].balance) - Math.abs(b[1].balance)
                return sortDir === 'asc' ? cmp : -cmp
              }
              const catA = getAccountType(a[0])
              const catB = getAccountType(b[0])
              if (catA !== catB) return catA.localeCompare(catB)
              return Math.abs(b[1].balance) - Math.abs(a[1].balance)
            })
            .reduce((acc, [accountName, accountData], index, array) => {
              const currentCategory = getAccountType(accountName)
              const prevCategory = index > 0 ? getAccountType(array[index - 1][0]) : null
              const showCategoryHeader = currentCategory !== prevCategory

              if (!acc.categoryTotals[currentCategory]) {
                acc.categoryTotals[currentCategory] = { balance: 0, transactions: 0 }
              }
              acc.categoryTotals[currentCategory].balance += Math.abs(accountData.balance)
              acc.categoryTotals[currentCategory].transactions += accountData.transactions

              if (showCategoryHeader) {
                const categoryAccounts = array.filter(([name]) => getAccountType(name) === currentCategory)
                const catBalance = categoryAccounts.reduce((sum, [, data]) => sum + Math.abs(data.balance), 0)
                const catTransactions = categoryAccounts.reduce((sum, [, data]) => sum + data.transactions, 0)

                acc.elements.push(
                  <tr
                    key={`header-${currentCategory}`}
                    className="bg-white/5 cursor-pointer hover:bg-white/10 transition-colors"
                    onClick={() => onToggleCategory(currentCategory)}
                  >
                    <td className="py-2 px-4 text-sm font-semibold text-primary">
                      <span className="flex items-center gap-2">
                        {expandedCategories.has(currentCategory)
                          ? <ChevronDown className="w-4 h-4" />
                          : <ChevronRight className="w-4 h-4" />}
                        {currentCategory}
                        <span className="text-xs text-text-tertiary font-normal">({categoryAccounts.length})</span>
                      </span>
                    </td>
                    <td className={`py-2 px-4 text-right text-sm font-medium ${headerBalanceColorClass}`}>
                      {formatCurrency(catBalance)}
                    </td>
                    <td className="py-2 px-4 text-right text-sm font-medium text-muted-foreground/70">
                      {formatPercent((catBalance / total) * 100)}
                    </td>
                    <td className="py-2 px-4 text-right text-sm font-medium text-muted-foreground/70">—</td>
                    <td className="py-2 px-4 text-right text-sm font-medium text-muted-foreground/70">{catTransactions}</td>
                  </tr>
                )
              }

              if (expandedCategories.has(currentCategory)) {
                acc.elements.push(
                  <motion.tr
                    key={accountName}
                    className="border-b border-border hover:bg-white/10 transition-colors"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <td className="py-3 pl-10 pr-4 text-white font-medium">{accountName}</td>
                    <td className={`py-3 px-4 text-right font-bold ${balanceColorClass}`}>
                      {formatCurrency(Math.abs(accountData.balance))}
                    </td>
                    <td className="py-3 px-4 text-right text-muted-foreground">
                      {formatPercent((Math.abs(accountData.balance) / total) * 100)}
                    </td>
                    <td className="py-3 px-4 text-right text-muted-foreground">
                      {getAccountType(accountName)}
                    </td>
                    <td className="py-3 px-4 text-right text-muted-foreground">{accountData.transactions}</td>
                  </motion.tr>
                )
              }

              return acc
            }, { elements: [] as React.ReactNode[], categoryTotals: {} as Record<string, { balance: number; transactions: number }> }).elements}
        </tbody>
      </table>
    </div>
  )
}

export default function NetWorthPage() {
  const { data: balanceData, isLoading: balancesLoading } = useAccountBalances()
  const { data: transactions = [], isLoading: transactionsLoading } = useTransactions()
  const { data: preferences } = usePreferences()
  const [showStacked, setShowStacked] = useState(false)
  const [classifications, setClassifications] = useState<Record<string, string>>({})
  const [expandedAssetCategories, setExpandedAssetCategories] = useState<Set<string>>(new Set())
  const [expandedLiabilityCategories, setExpandedLiabilityCategories] = useState<Set<string>>(new Set())

  // Time filter state
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || 4
  const { displayPreferences } = usePreferencesStore()
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>(
    (displayPreferences.defaultTimeRange as AnalyticsViewMode) || 'all_time'
  )
  const [currentYear, setCurrentYear] = useState(getCurrentYear())
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())
  const [currentFY, setCurrentFY] = useState(getCurrentFY(fiscalYearStartMonth))

  const dateRange = useMemo(() => {
    return getAnalyticsDateRange(viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth)
  }, [viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth])

  const dataDateRange = useMemo(() => {
    if (!transactions || transactions.length === 0) return { minDate: undefined, maxDate: undefined }
    const dates = transactions.map(t => t.date.substring(0, 10)).sort((a, b) => a.localeCompare(b))
    return { minDate: dates[0], maxDate: dates[dates.length - 1] }
  }, [transactions])

  // Load account classifications
  useEffect(() => {
    const loadClassifications = async () => {
      try {
        const data = await accountClassificationsService.getAllClassifications()
        setClassifications(data)
      } catch {
        // Classifications will use defaults if loading fails
      }
    }
    loadClassifications()
  }, [])

  const isLoading = balancesLoading || transactionsLoading

  // Calculate totals from balance data - memoized to avoid changing on every render
  const accounts = useMemo(() => balanceData?.accounts || {}, [balanceData?.accounts])
  const totalAssets = Object.values(accounts)
    .filter((acc) => acc.balance > 0)
    .reduce((sum, acc) => sum + acc.balance, 0)
  const totalLiabilities = Math.abs(
    Object.values(accounts)
      .filter((acc) => acc.balance < 0)
      .reduce((sum, acc) => sum + acc.balance, 0),
  )
  const netWorth = totalAssets - totalLiabilities

  // Get investment account mappings from preferences - memoized
  const investmentMappings = useMemo(
    () => preferences?.investment_account_mappings || {},
    [preferences?.investment_account_mappings]
  )
  
  // Helper to get account type (for display in tables) - uses classifications from preferences
  const getAccountType = (accountName: string): string => {
    return resolveAccountType(accountName, classifications, investmentMappings)
  }
  
  // Categorize accounts - uses classifications from preferences - memoized with useCallback
  const categorizeAccount = useCallback((accountName: string) => {
    return resolveAccountCategory(accountName, classifications, investmentMappings)
  }, [classifications, investmentMappings])

  // Calculate category totals from current balances using classifications
  const categoryTotals = useMemo(() => {
    return Object.entries(accounts).reduce((acc, [name, data]) => {
      const category = categorizeAccount(name)
      if (!acc[category]) acc[category] = 0
      // Use absolute value since negative balances are assets
      acc[category] += Math.abs(data.balance)
      return acc
    }, {} as Record<string, number>)
  }, [accounts, categorizeAccount])

  // Get all unique categories for the chart
  const allCategories = useMemo(() => {
    const categories = new Set(Object.keys(categoryTotals))
    return Array.from(categories).filter(cat => !['Credit Cards', 'Loans', 'Loans/Lended', 'Other'].includes(cat)) // Exclude liabilities and generic Other from asset chart
  }, [categoryTotals])

  // totalPositive is the same as totalAssets - memoize to avoid prop changes
  const totalPositive = useMemo(() => totalAssets, [totalAssets])
  
  // Calculate proportions dynamically based on actual categories
  const categoryProportions = useMemo(() => {
    const props: Record<string, number> = {}
    allCategories.forEach(cat => {
      props[cat] = totalPositive > 0 ? (categoryTotals[cat] || 0) / totalPositive : 0
    })
    return props
  }, [categoryTotals, allCategories, totalPositive])

  // Compute daily cumulative net worth from transactions
  const netWorthData = useMemo(() => {
    return computeNetWorthTimeSeries(transactions, allCategories, categoryProportions)
  }, [transactions, allCategories, categoryProportions])

  // Filter chart data to selected time range
  const filteredNetWorthData = useMemo(() => {
    if (!dateRange.start_date) return netWorthData
    return netWorthData.filter((item) => {
      const d = item.date as string
      return d >= dateRange.start_date! &&
             (!dateRange.end_date || d <= dateRange.end_date)
    })
  }, [netWorthData, dateRange])

  const monthlyChanges = useMemo(() => {
    if (!filteredNetWorthData || filteredNetWorthData.length < 2) return []

    // Group by month and get last value per month
    const monthlyValues: Record<string, number> = {}
    for (const point of filteredNetWorthData) {
      const month = (point.date as string).substring(0, 7) // "YYYY-MM"
      monthlyValues[month] = point.netWorth as number
    }

    const months = Object.keys(monthlyValues).sort((a, b) => a.localeCompare(b))
    if (months.length < 2) return []

    return months.slice(1).map((month, i) => {
      const prevMonth = months[i]
      const change = monthlyValues[month] - monthlyValues[prevMonth]
      return {
        month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        change,
        positive: Math.max(change, 0),
        negative: Math.max(-change, 0),
        fill: change >= 0 ? rawColors.ios.green : rawColors.ios.red,
      }
    })
  }, [filteredNetWorthData])

  const toggleCategory = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    category: string,
  ) => {
    setter(prev => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Net Worth"
          subtitle="Track your total assets and liabilities"
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass rounded-xl border border-border p-6 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-ios-green/20 rounded-xl shadow-lg shadow-ios-green/30">
                <PiggyBank className="w-6 h-6 text-ios-green" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Assets</p>
                <p className="text-2xl font-bold">
                  {isLoading ? '...' : formatCurrency(totalAssets)}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass rounded-xl border border-border p-6 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-ios-red/20 rounded-xl shadow-lg shadow-ios-red/30">
                <CreditCard className="w-6 h-6 text-ios-red" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Liabilities</p>
                <p className="text-2xl font-bold">
                  {isLoading ? '...' : formatCurrency(totalLiabilities)}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass rounded-xl border border-border p-6 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/20 rounded-xl shadow-lg shadow-primary/30">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Net Worth</p>
                <p className="text-2xl font-bold">
                  {isLoading ? '...' : formatCurrency(netWorth)}
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass rounded-xl border border-border p-6 shadow-lg"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-ios-blue" />
              <h3 className="text-lg font-semibold text-white">Net Worth Trend</h3>
            </div>
            <button
              onClick={() => setShowStacked(!showStacked)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                showStacked
                  ? 'bg-primary text-white shadow-lg shadow-primary/50'
                  : 'bg-white/5 text-muted-foreground hover:bg-white/10 border border-border'
              }`}
            >
              {showStacked ? '📊 Stacked View' : '📈 Total View'}
            </button>
          </div>
          {(() => {
            if (isLoading) {
              return (
                <div className="h-80 flex items-center justify-center">
                  <div className="animate-pulse text-muted-foreground">Loading chart...</div>
                </div>
              )
            }
            if (filteredNetWorthData.length > 0) {
              const formattedValue = (value: number | undefined) => value === undefined ? '' : formatCurrency(value)
              return (
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={filteredNetWorthData}>
                    <defs>
                      <linearGradient id="colorNetWorth" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={rawColors.ios.purple} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={rawColors.ios.purple} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={rawColors.ios.green} stopOpacity={0.6} />
                        <stop offset="95%" stopColor={rawColors.ios.green} stopOpacity={0.1} />
                      </linearGradient>
                      <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={rawColors.ios.red} stopOpacity={0.6} />
                        <stop offset="95%" stopColor={rawColors.ios.red} stopOpacity={0.1} />
                      </linearGradient>
                      {/* Dynamic gradients for each category */}
                      {allCategories.map((cat) => {
                        const config = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG['other']
                        return (
                          <linearGradient key={`color-${cat}`} id={`color-${cat.replaceAll(/\s+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={config.color} stopOpacity={0.7} />
                            <stop offset="95%" stopColor={config.color} stopOpacity={0.2} />
                          </linearGradient>
                        )
                      })}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="date" stroke={CHART_AXIS_COLOR} tickFormatter={(v) => formatDateTick(v, filteredNetWorthData.length)} angle={-45} textAnchor="end" height={80} interval={Math.max(1, Math.floor(filteredNetWorthData.length / 20))} />
                    <YAxis stroke={CHART_AXIS_COLOR} tickFormatter={(value: number) => formatCurrencyShort(value)} />
                    <Tooltip
                      {...chartTooltipProps}
                      formatter={formattedValue}
                      labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    />
                    <Legend />
                    {showStacked ? (
                      <>
                        {allCategories.map((cat) => {
                          const config = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG['other']
                          return (
                            <Area
                              key={cat}
                              type="natural"
                              dataKey={cat}
                              stackId="1"
                              stroke={config.color}
                              fillOpacity={1}
                              fill={`url(#color-${cat.replaceAll(/\s+/g, '')})`}
                              name={config.label}
                              isAnimationActive={filteredNetWorthData.length < CHART_ANIMATION_THRESHOLD}
                            />
                          )
                        })}
                      </>
                    ) : (
                      <Area
                        type="natural"
                        dataKey="netWorth"
                        stroke={rawColors.ios.purple}
                        fillOpacity={1}
                        fill="url(#colorNetWorth)"
                        name="Net Worth"
                        isAnimationActive={filteredNetWorthData.length < CHART_ANIMATION_THRESHOLD}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              )
            }
            return (
              <EmptyState
                icon={BarChart3}
                title="No data available"
                description="Upload your transaction data to track net worth over time."
                actionLabel="Upload Data"
                actionHref="/upload"
                variant="chart"
              />
            )
          })()}
        </motion.div>

        {monthlyChanges.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="glass rounded-xl border border-border p-6 shadow-lg"
          >
            <div className="flex items-center gap-3 mb-6">
              <BarChart3 className="w-5 h-5 text-ios-purple" />
              <h3 className="text-lg font-semibold text-white">Monthly Net Worth Changes</h3>
            </div>
            {monthlyChanges.length === 0 ? (
              <ChartEmptyState height={280} />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthlyChanges}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="month" tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} />
                  <YAxis tickFormatter={(v: number) => formatCurrencyShort(v)} tick={{ fill: CHART_AXIS_COLOR, fontSize: 12 }} />
                  <Tooltip
                    {...chartTooltipProps}
                    formatter={(value: number | undefined) => value === undefined ? '' : formatCurrency(value)}
                  />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                  <Bar dataKey="positive" name="Increase" fill={rawColors.ios.green} radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="positive" position="top" fill="#f5f5f7" fontSize={10} formatter={(v: number) => v === 0 ? '' : formatCurrencyShort(v)} />
                  </Bar>
                  <Bar dataKey="negative" name="Decrease" fill={rawColors.ios.red} radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="negative" position="top" fill="#f5f5f7" fontSize={10} formatter={(v: number) => v === 0 ? '' : formatCurrencyShort(v)} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="glass rounded-xl border border-border p-6 shadow-lg"
        >
          <h3 className="text-lg font-semibold text-white mb-6">Assets (Positive Balances)</h3>
          <AccountCategoryTable
            accounts={accounts}
            filterFn={(b) => b > 0}
            total={totalAssets}
            balanceColorClass="text-ios-green"
            headerBalanceColorClass="text-ios-green/70"
            expandedCategories={expandedAssetCategories}
            onToggleCategory={(cat) => toggleCategory(setExpandedAssetCategories, cat)}
            getAccountType={getAccountType}
            emptyIcon={PiggyBank}
            emptyTitle="No asset accounts found"
            emptyDescription="Add transactions for accounts with positive balances to see your assets."
            isLoading={isLoading}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="glass rounded-xl border border-border p-6 shadow-lg"
        >
          <h3 className="text-lg font-semibold text-white mb-6">Liabilities (Negative Balances)</h3>
          <AccountCategoryTable
            accounts={accounts}
            filterFn={(b) => b < 0}
            total={totalLiabilities}
            balanceColorClass="text-ios-red"
            headerBalanceColorClass="text-ios-red/70"
            expandedCategories={expandedLiabilityCategories}
            onToggleCategory={(cat) => toggleCategory(setExpandedLiabilityCategories, cat)}
            getAccountType={getAccountType}
            emptyIcon={CreditCard}
            emptyTitle="No liability accounts found"
            emptyDescription="Great news! You don't have any liability accounts with negative balances."
            isLoading={isLoading}
          />
        </motion.div>

        {/* Credit Card Health */}
        <CreditCardHealth />
      </div>
    </div>
  )
}
