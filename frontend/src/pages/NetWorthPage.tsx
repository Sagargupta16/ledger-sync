import { motion } from 'framer-motion'
import { rawColors } from '@/constants/colors'
import { TrendingUp, PiggyBank, CreditCard, BarChart3, ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import MetricCard from '@/components/shared/MetricCard'
import { useAccountBalances } from '@/hooks/useAnalytics'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { chartTooltipProps, PageHeader, ChartContainer, GRID_DEFAULTS, xAxisDefaults, yAxisDefaults, areaGradient, areaGradientUrl, shouldAnimate, LEGEND_DEFAULTS, ACTIVE_DOT } from '@/components/ui'
import { CHART_TOOLTIP_STYLE } from '@/components/ui/ChartTooltip'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import { CreditCardHealth } from '@/components/analytics'
import EmptyState from '@/components/shared/EmptyState'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import { accountClassificationsService } from '@/services/api/accountClassifications'
import { useAnalyticsTimeFilter } from '@/hooks/useAnalyticsTimeFilter'

// Category display configuration
const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  'Cash & Wallets': { label: 'Cash & Wallets', color: rawColors.app.green },
  'Bank Accounts': { label: 'Bank Accounts', color: rawColors.app.blue },
  'Investments': { label: 'Investments', color: rawColors.app.purple },
  'Loans/Lended': { label: 'Loans/Lended', color: rawColors.app.red },
  'Credit Cards': { label: 'Credit Cards', color: rawColors.app.orange },
  // Fallback categories
  'cashbank': { label: 'Cash & Bank', color: rawColors.app.blue },
  'invested': { label: 'Investments', color: rawColors.app.purple },
  'lended': { label: 'Lended', color: rawColors.app.teal },
  'liability': { label: 'Liabilities', color: rawColors.app.red },
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
            <th
              onClick={() => toggleSort('balance')}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSort('balance') } }}
              tabIndex={0}
              aria-sort={ariaSort(sortKey, 'balance', sortDir)}
              className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground cursor-pointer hover:text-white select-none"
            >
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
                    className="bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <td className="py-2 px-4 text-sm font-semibold text-primary">
                      <button
                        type="button"
                        onClick={() => onToggleCategory(currentCategory)}
                        aria-expanded={expandedCategories.has(currentCategory)}
                        className="flex items-center gap-2 w-full bg-transparent border-none cursor-pointer text-inherit font-inherit p-0"
                      >
                        {expandedCategories.has(currentCategory)
                          ? <ChevronDown className="w-4 h-4" />
                          : <ChevronRight className="w-4 h-4" />}
                        {currentCategory}
                        <span className="text-xs text-text-tertiary font-normal">({categoryAccounts.length})</span>
                      </button>
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

function ariaSort(activeKey: string | null, column: string, dir: 'asc' | 'desc'): 'ascending' | 'descending' | 'none' {
  if (activeKey !== column) return 'none'
  return dir === 'asc' ? 'ascending' : 'descending'
}

export default function NetWorthPage() {
  const dims = useChartDimensions()
  const { data: balanceData, isLoading: balancesLoading } = useAccountBalances()
  const { data: transactions = [], isLoading: transactionsLoading } = useTransactions()
  const { data: preferences } = usePreferences()
  const [showStacked, setShowStacked] = useState(false)
  const [classifications, setClassifications] = useState<Record<string, string>>({})
  const [expandedAssetCategories, setExpandedAssetCategories] = useState<Set<string>>(new Set())
  const [expandedLiabilityCategories, setExpandedLiabilityCategories] = useState<Set<string>>(new Set())

  // Time filter state
  const { dateRange, timeFilterProps } = useAnalyticsTimeFilter(
    transactions,
    { defaultViewMode: 'all_time' },
  )

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
    const startDate = dateRange.start_date
    if (!startDate) return netWorthData
    return netWorthData.filter((item) => {
      const d = item.date as string
      return d >= startDate && (!dateRange.end_date || d <= dateRange.end_date)
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

    // Build waterfall data: invisible base + visible change bar
    let runningTotal = monthlyValues[months[0]]
    return months.slice(1).map((month, i) => {
      const prevMonth = months[i]
      const change = monthlyValues[month] - monthlyValues[prevMonth]
      const base = change >= 0 ? runningTotal : runningTotal + change
      runningTotal += change
      return {
        month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        change,
        base, // invisible bar that positions the change bar
        increase: Math.max(change, 0),
        decrease: Math.max(-change, 0),
        endValue: runningTotal,
      }
    })
  }, [filteredNetWorthData])

  const renderWaterfallTooltip = useCallback(({ active, payload, label }: { active?: boolean; payload?: Array<{ payload?: { change: number; endValue: number } }>; label?: string }) => {
    if (!active || !payload?.length) return null
    const item = payload[0]?.payload
    if (!item) return null
    const isPositive = item.change >= 0
    return (
      <div style={CHART_TOOLTIP_STYLE}>
        <p style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '6px' }}>{label}</p>
        <p style={{ color: isPositive ? rawColors.app.green : rawColors.app.red, fontSize: '16px', fontWeight: 700 }}>
          {isPositive ? '+' : ''}{formatCurrency(item.change)}
        </p>
        <p style={{ color: '#71717a', fontSize: '11px', marginTop: '4px' }}>
          Net Worth: {formatCurrency(item.endValue)}
        </p>
      </div>
    )
  }, [])

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
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Net Worth"
          subtitle="Track your total assets and liabilities"
          action={
            <AnalyticsTimeFilter {...timeFilterProps} />
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          <MetricCard title="Total Assets" value={formatCurrency(totalAssets)} icon={PiggyBank} color="green" isLoading={isLoading} />
          <MetricCard title="Total Liabilities" value={formatCurrency(totalLiabilities)} icon={CreditCard} color="red" isLoading={isLoading} />
          <MetricCard title="Net Worth" value={formatCurrency(netWorth)} icon={TrendingUp} color="blue" isLoading={isLoading} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass rounded-2xl border border-border p-4 md:p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-app-blue" />
              <h3 className="text-lg font-semibold text-white">Net Worth Trend</h3>
            </div>
            <button
              onClick={() => setShowStacked(!showStacked)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                showStacked
                  ? 'bg-primary text-white'
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
                <ChartContainer height={320}>
                  <AreaChart data={filteredNetWorthData}>
                    <defs>
                      {areaGradient('netWorth', rawColors.app.purple)}
                      {areaGradient('income', rawColors.app.green, 0.6, 0.1)}
                      {areaGradient('expenses', rawColors.app.red, 0.6, 0.1)}
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
                    <CartesianGrid {...GRID_DEFAULTS} />
                    <XAxis {...xAxisDefaults(filteredNetWorthData.length, { angle: dims.angleXLabels ? -45 : undefined, height: 80, dateFormatter: true })} dataKey="date" />
                    <YAxis {...yAxisDefaults()} />
                    <Tooltip
                      {...chartTooltipProps}
                      formatter={formattedValue}
                      labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    />
                    {dims.showLegend && <Legend {...LEGEND_DEFAULTS} />}
                    {showStacked ? (
                      <>
                        {allCategories.map((cat) => {
                          const config = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG['other']
                          return (
                            <Area
                              key={cat}
                              type="monotone"
                              dataKey={cat}
                              stackId="1"
                              stroke={config.color}
                              strokeWidth={2}
                              dot={false}
                              activeDot={{ ...ACTIVE_DOT, fill: config.color }}
                              fillOpacity={1}
                              fill={`url(#color-${cat.replaceAll(/\s+/g, '')})`}
                              name={config.label}
                              isAnimationActive={shouldAnimate(filteredNetWorthData.length)}
                              animationDuration={600}
                              animationEasing="ease-out"
                            />
                          )
                        })}
                      </>
                    ) : (
                      <Area
                        type="monotone"
                        dataKey="netWorth"
                        stroke={rawColors.app.purple}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ ...ACTIVE_DOT, fill: rawColors.app.purple }}
                        fillOpacity={1}
                        fill={areaGradientUrl('netWorth')}
                        name="Net Worth"
                        isAnimationActive={shouldAnimate(filteredNetWorthData.length)}
                        animationDuration={600}
                        animationEasing="ease-out"
                      />
                    )}
                  </AreaChart>
                </ChartContainer>
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
            className="glass rounded-2xl border border-border p-4 md:p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <BarChart3 className="w-5 h-5 text-app-purple" />
                <h3 className="text-lg font-semibold text-white">Monthly Net Worth Changes</h3>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: rawColors.app.green }} />
                  <span className="text-muted-foreground">Increase</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: rawColors.app.red }} />
                  <span className="text-muted-foreground">Decrease</span>
                </span>
              </div>
            </div>
            {monthlyChanges.length === 0 ? (
              <ChartEmptyState height={320} />
            ) : (
              <ChartContainer height={320}>
                <BarChart data={monthlyChanges} barCategoryGap="20%">
                  <CartesianGrid {...GRID_DEFAULTS} />
                  <XAxis {...xAxisDefaults(monthlyChanges.length)} dataKey="month" />
                  <YAxis {...yAxisDefaults()} />
                  <Tooltip
                    {...chartTooltipProps}
                    content={renderWaterfallTooltip as never}
                  />
                  {/* Invisible base bar — positions the visible bars at the right height */}
                  <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
                  {/* Green increase bars */}
                  <Bar
                    dataKey="increase"
                    stackId="waterfall"
                    name="Increase"
                    fill={rawColors.app.green}
                    fillOpacity={0.85}
                    radius={[4, 4, 4, 4]}
                    isAnimationActive={shouldAnimate(monthlyChanges.length)}
                    animationDuration={600}
                    animationEasing="ease-out"
                  />
                  {/* Red decrease bars */}
                  <Bar
                    dataKey="decrease"
                    stackId="waterfall"
                    name="Decrease"
                    fill={rawColors.app.red}
                    fillOpacity={0.85}
                    radius={[4, 4, 4, 4]}
                    isAnimationActive={shouldAnimate(monthlyChanges.length)}
                    animationDuration={600}
                    animationEasing="ease-out"
                  />
                </BarChart>
              </ChartContainer>
            )}
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="glass rounded-2xl border border-border p-4 md:p-6"
        >
          <h3 className="text-lg font-semibold text-white mb-4">Assets (Positive Balances)</h3>
          <AccountCategoryTable
            accounts={accounts}
            filterFn={(b) => b > 0}
            total={totalAssets}
            balanceColorClass="text-app-green"
            headerBalanceColorClass="text-app-green/70"
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
          className="glass rounded-2xl border border-border p-4 md:p-6"
        >
          <h3 className="text-lg font-semibold text-white mb-4">Liabilities (Negative Balances)</h3>
          <AccountCategoryTable
            accounts={accounts}
            filterFn={(b) => b < 0}
            total={totalLiabilities}
            balanceColorClass="text-app-red"
            headerBalanceColorClass="text-app-red/70"
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
