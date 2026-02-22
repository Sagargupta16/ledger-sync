import { motion } from 'framer-motion'
import { rawColors } from '@/constants/colors'
import { CHART_AXIS_COLOR } from '@/constants/chartColors'
import { staggerContainer, fadeUpItem } from '@/constants/animations'
import { TrendingUp, TrendingDown, Banknote, Receipt } from 'lucide-react'
import { useAccountBalances, useMonthlyAggregation } from '@/hooks/useAnalytics'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { getSmartInterval } from '@/lib/chartUtils'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { chartTooltipProps, PageHeader } from '@/components/ui'
import { useMemo, useState } from 'react'
import { formatCurrency, formatCurrencyShort, formatPercent, formatDateTick } from '@/lib/formatters'
import { CHART_ANIMATION_THRESHOLD } from '@/constants'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import { getCurrentYear, getCurrentMonth, getCurrentFY, getAnalyticsDateRange, getDateKey, type AnalyticsViewMode } from '@/lib/dateUtils'
import { usePreferencesStore } from '@/store/preferencesStore'

/** Return the fill color for a waterfall chart cell based on entry type and sign */
function getWaterfallCellColor(
  entry: { isTotal: boolean; value: number },
  colors: { blue: string; red: string; green: string },
): string {
  if (entry.isTotal) {
    return entry.value >= 0 ? colors.blue : colors.red
  }
  return entry.value >= 0 ? colors.green : colors.red
}

/** Format the waterfall chart tooltip label based on payload context */
function formatWaterfallTooltip(
  payload: { value?: number; isTotal?: boolean } | undefined,
  name: string | undefined,
  formatter: (v: number) => string,
): [string, string] {
  const v = payload?.value ?? 0
  if (payload?.isTotal) {
    return [formatter(Math.abs(v)), 'Net P&L']
  }
  const label = name === 'end' ? 'Amount' : ''
  return [formatter(Math.abs(v)), label]
}

/** Filter transactions that match dividend keywords */
function filterDividendTransactions(
  transactions: Array<{ type: string; amount: number; category: string; note?: string; subcategory?: string }>,
): number {
  return transactions
    .filter((tx) => {
      const lower = `${tx.category} ${tx.note || ''} ${tx.subcategory || ''}`.toLowerCase()
      return tx.type === 'Income' && (lower.includes('dividend') || lower.includes('divid'))
    })
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
}

/** Filter transactions that match broker fee keywords (investment-related only) */
function filterBrokerFees(
  transactions: Array<{ type: string; amount: number; category: string; note?: string; subcategory?: string }>,
): number {
  return transactions
    .filter((tx) => {
      const lower = `${tx.category} ${tx.note || ''} ${tx.subcategory || ''}`.toLowerCase()
      const categoryLower = tx.category.toLowerCase()
      if (tx.type !== 'Expense') return false
      if (!categoryLower.includes('investment') && !categoryLower.includes('stock') && !categoryLower.includes('trading')) return false
      return isBrokerFee(lower)
    })
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
}

/** Filter transactions that match interest income keywords */
function filterInterestIncome(
  transactions: Array<{ type: string; amount: number; category: string; note?: string; subcategory?: string }>,
): number {
  return transactions
    .filter((tx) => {
      const lower = `${tx.category} ${tx.note || ''} ${tx.subcategory || ''}`.toLowerCase()
      return tx.type === 'Income' && (
        lower.includes('interest') || lower.includes('int.') ||
        lower.includes('int cr') || lower.includes('int credit')
      )
    })
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
}

/** Filter transactions that match investment profit keywords */
function filterInvestmentProfit(
  transactions: Array<{ type: string; amount: number; category: string; note?: string; subcategory?: string }>,
): number {
  return transactions
    .filter((tx) => {
      const lower = `${tx.category} ${tx.note || ''} ${tx.subcategory || ''}`.toLowerCase()
      return tx.type === 'Income' && (
        lower.includes('profit') || lower.includes('gain') || lower.includes('realized')
      )
    })
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
}

/** Filter transactions that match investment loss keywords (excluding broker fees) */
function filterInvestmentLoss(
  transactions: Array<{ type: string; amount: number; category: string; note?: string; subcategory?: string }>,
): number {
  return transactions
    .filter((tx) => {
      const lower = `${tx.category} ${tx.note || ''} ${tx.subcategory || ''}`.toLowerCase()
      const categoryLower = tx.category.toLowerCase()
      if (tx.type !== 'Expense') return false
      if (!categoryLower.includes('investment') && !categoryLower.includes('stock') && !categoryLower.includes('trading')) return false
      if (lower.includes('broker') || lower.includes('brokerage')) return false
      return lower.includes('loss') || lower.includes('write')
    })
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
}

const INVESTMENT_KEYWORDS = ['invest', 'mutual', 'stock', 'equity', 'sip', 'portfolio', 'fund', 'demat']

const isInvestmentAccount = (accountName: string): boolean => {
  const lower = accountName.toLowerCase()
  return INVESTMENT_KEYWORDS.some(keyword => lower.includes(keyword))
}

// Calculate CAGR: (Ending Value / Beginning Value)^(1/years) - 1
const calculateCAGR = (endingValue: number, beginningValue: number, years: number): number => {
  if (beginningValue <= 0 || years <= 0) return 0
  return (Math.pow(endingValue / beginningValue, 1 / years) - 1) * 100
}

/** Check if a transaction's text matches investment income keywords */
function isInvestmentIncome(lower: string): boolean {
  return lower.includes('dividend') || lower.includes('divid') ||
         lower.includes('interest') || lower.includes('int.') ||
         lower.includes('int cr') || lower.includes('int credit') ||
         lower.includes('profit') || lower.includes('gain') ||
         lower.includes('realized')
}

/** Check if a transaction's text matches broker fee keywords */
function isBrokerFee(lower: string): boolean {
  return (lower.includes('broker') && (lower.includes('charge') || lower.includes('fee'))) ||
         lower.includes('brokerage') ||
         (lower.includes('demat') && lower.includes('charge')) ||
         (lower.includes('trading') && (lower.includes('charge') || lower.includes('fee'))) ||
         (lower.includes('transaction') && lower.includes('charge'))
}

/** Check if a transaction's text matches investment loss keywords (excluding broker fees) */
function isInvestmentLoss(lower: string): boolean {
  return !lower.includes('broker') && !lower.includes('brokerage') &&
         (lower.includes('loss') || lower.includes('write'))
}

/** Group transactions by day into income/expenses buckets */
function groupTransactionsByDay(
  transactions: Array<{ date: string; type: string; amount: number; category: string; note?: string; subcategory?: string }>,
): Record<string, { income: number; expenses: number }> {
  const dailyData: Record<string, { income: number; expenses: number }> = {}

  for (const tx of transactions) {
    const dayKey = tx.date.substring(0, 10)
    if (!dailyData[dayKey]) {
      dailyData[dayKey] = { income: 0, expenses: 0 }
    }

    const lower = `${tx.category} ${tx.note || ''} ${tx.subcategory || ''}`.toLowerCase()
    const categoryLower = tx.category.toLowerCase()
    const amount = Math.abs(tx.amount)

    // Income: dividends, interest, investment profit
    if (tx.type === 'Income' && isInvestmentIncome(lower)) {
      dailyData[dayKey].income += amount
    }

    // Expenses: broker fees and investment loss - ONLY from investment categories
    const isInvestmentCategory = categoryLower.includes('investment') || categoryLower.includes('stock') || categoryLower.includes('trading')
    if (tx.type === 'Expense' && isInvestmentCategory && (isBrokerFee(lower) || isInvestmentLoss(lower))) {
      dailyData[dayKey].expenses += amount
    }
  }

  return dailyData
}

export default function ReturnsAnalysisPage() {
  const dims = useChartDimensions()
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
  
  const { data: balanceData, isLoading: balancesLoading } = useAccountBalances()
  const { data: aggregationData, isLoading: aggregationLoading } = useMonthlyAggregation()
  const { data: allTransactions = [] } = useTransactions()

  const isLoading = balancesLoading || aggregationLoading

  // Get date range based on current filter
  const dateRange = useMemo(() => {
    return getAnalyticsDateRange(viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth)
  }, [viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth])

  const dataDateRange = useMemo(() => {
    if (allTransactions.length === 0) return { minDate: undefined, maxDate: undefined }
    const dates = allTransactions.map(t => t.date.substring(0, 10)).sort()
    return { minDate: dates[0], maxDate: dates[dates.length - 1] }
  }, [allTransactions])

  // Filter transactions based on selected time range
  const transactions = useMemo(() => {
    if (!dateRange.start_date) return allTransactions
    
    return allTransactions.filter(tx => {
      // Compare only the date part (YYYY-MM-DD) to handle datetime strings correctly
      const txDate = getDateKey(tx.date)
      return txDate >= dateRange.start_date! && (!dateRange.end_date || txDate <= dateRange.end_date)
    })
  }, [allTransactions, dateRange])

  // Filter investment accounts first
  const investmentAccounts = useMemo(() => {
    const accounts = balanceData?.accounts || {}
    return Object.entries(accounts)
      .filter(([name]) => isInvestmentAccount(name))
      .map(([name, data]) => ({
        name,
        balance: Math.abs((data as { balance: number; transactions: number }).balance),
        transactions: (data as { balance: number; transactions: number }).transactions,
      }))
      .sort((a, b) => b.balance - a.balance)
  }, [balanceData])

  // Total Returns = Current portfolio value
  // const totalReturns = useMemo(() => {
  //   return investmentAccounts.reduce((sum, acc) => sum + acc.balance, 0)
  // }, [investmentAccounts])

  // Calculate Dividend Income from transactions
  const dividendIncome = useMemo(() => filterDividendTransactions(transactions), [transactions])

  // Calculate Broker Fees from transactions (investment-related only)
  const brokerFees = useMemo(() => filterBrokerFees(transactions), [transactions])

  // Calculate Interest Income from all accounts
  const interestIncome = useMemo(() => filterInterestIncome(transactions), [transactions])

  // Calculate actual Profit from investment sales/gains
  const investmentProfit = useMemo(() => filterInvestmentProfit(transactions), [transactions])

  // Calculate actual Loss from investments (exclude broker fees)
  const investmentLoss = useMemo(() => filterInvestmentLoss(transactions), [transactions])

  // Net Profit/Loss = Total Income - Total Expenses (including all fees and income sources)
  const netProfitLoss = useMemo(() => {
    const totalIncome = investmentProfit + dividendIncome + interestIncome
    const totalExpenses = investmentLoss + brokerFees
    return totalIncome - totalExpenses
  }, [investmentProfit, dividendIncome, interestIncome, investmentLoss, brokerFees])

  // Calculate average CAGR from monthly data
  const monthlyDataArray = useMemo(() => {
    const data = Object.entries(aggregationData || {})
      .map(([month, value]) => ({ month, ...(value as { income?: number; expense?: number; net_savings?: number; transactions?: number }) }))
      .sort((a, b) => a.month.localeCompare(b.month))
    return data
  }, [aggregationData])

  // Estimate CAGR based on growth from first to last month
  const estimatedCAGR = useMemo(() => {
    if (monthlyDataArray.length < 2) return 0
    const firstMonth = monthlyDataArray[0]
    const lastMonth = monthlyDataArray[monthlyDataArray.length - 1]
    const beginningValue = firstMonth.income || 1
    const endingValue = lastMonth.income || beginningValue
    const months = monthlyDataArray.length
    const years = months / 12
    return calculateCAGR(endingValue, beginningValue, Math.max(years, 0.1))
  }, [monthlyDataArray])

  // Find best performing account by balance
  // const bestPerformingAccount = useMemo(
  //   () => investmentAccounts[0]?.name || 'N/A',
  //   [investmentAccounts],
  // )

  // Prepare data for bar chart - show top 5 accounts
  // // const chartData = investmentAccounts.slice(0, 5).map((acc) => ({
  //   name: acc.name.replace(/.*\b/, '').substring(0, 15),
  //   value: acc.balance,
  // }))

  // Calculate cumulative P&L over time from transactions (daily)
  const cumulativeReturnsData = useMemo(() => {
    const dailyData = groupTransactionsByDay(transactions)

    // Sort by date and calculate cumulative
    const sortedDays = Object.keys(dailyData).sort((a, b) => a.localeCompare(b))

    return sortedDays.reduce<Array<{ date: string; cumulative: number; dailyNet: number }>>((acc, day) => {
      const net = dailyData[day].income - dailyData[day].expenses
      const prevCumulative = acc.length > 0 ? acc.at(-1)!.cumulative : 0
      acc.push({
        date: day,
        cumulative: Math.round(prevCumulative + net),
        dailyNet: Math.round(net)
      })
      return acc
    }, [])
  }, [transactions])

  // Simple return on investment calculation
  const roi = monthlyDataArray.length > 0 ? estimatedCAGR / 12 : 0

  // Waterfall chart data for P&L breakdown
  const waterfallData = useMemo(() => {
    let running = 0

    const profit = { name: 'Profit', value: investmentProfit, start: running, end: running + investmentProfit, isTotal: false }
    running += investmentProfit

    const dividends = { name: 'Dividends', value: dividendIncome, start: running, end: running + dividendIncome, isTotal: false }
    running += dividendIncome

    const interest = { name: 'Interest', value: interestIncome, start: running, end: running + interestIncome, isTotal: false }
    running += interestIncome

    const loss = { name: 'Losses', value: -investmentLoss, start: running, end: running - investmentLoss, isTotal: false }
    running -= investmentLoss

    const fees = { name: 'Fees', value: -brokerFees, start: running, end: running - brokerFees, isTotal: false }

    const netPL = { name: 'Net P&L', value: netProfitLoss, start: 0, end: netProfitLoss, isTotal: true }

    return [profit, dividends, interest, loss, fees, netPL]
  }, [investmentProfit, dividendIncome, interestIncome, investmentLoss, brokerFees, netProfitLoss])

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Returns Analysis"
          subtitle="Analyze your investment returns over time"
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

        {/* P&L Stats Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="glass rounded-xl border border-border p-6 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-xl shadow-lg ${netProfitLoss >= 0 ? 'bg-ios-green/20 shadow-ios-green/30' : 'bg-ios-red/20 shadow-ios-red/30'}`}>
                {netProfitLoss >= 0 ? (
                  <TrendingUp className="w-6 h-6 text-ios-green" />
                ) : (
                  <TrendingDown className="w-6 h-6 text-ios-red" />
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Net Profit/Loss</p>
                <p className={`text-2xl font-bold ${netProfitLoss >= 0 ? 'text-ios-green' : 'text-ios-red'}`}>
                  {netProfitLoss >= 0 ? '' : '-'}{formatCurrency(Math.abs(netProfitLoss))}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="glass rounded-xl border border-border p-6 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-ios-green/20 rounded-xl shadow-lg shadow-ios-green/30">
                <Banknote className="w-6 h-6 text-ios-green" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Dividend Income</p>
                <p className="text-2xl font-bold text-ios-green">
                  {formatCurrency(dividendIncome)}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="glass rounded-xl border border-border p-6 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-ios-orange/20 rounded-xl shadow-lg shadow-ios-orange/30">
                <Receipt className="w-6 h-6 text-ios-orange" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Broker Fees</p>
                <p className="text-2xl font-bold text-ios-orange">
                  {formatCurrency(brokerFees)}
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Cumulative Returns Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="glass rounded-xl border border-border p-6 shadow-lg"
        >
          <h3 className="text-lg font-semibold text-white mb-6">Cumulative Returns Over Time</h3>
          {cumulativeReturnsData.length === 0 ? (
            <ChartEmptyState height={320} />
          ) : (
            <ResponsiveContainer width="100%" height={dims.chartHeight}>
              <AreaChart data={cumulativeReturnsData} margin={dims.margin}>
                <defs>
                  <linearGradient id="positiveGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={rawColors.ios.green} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={rawColors.ios.green} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="negativeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={rawColors.ios.red} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={rawColors.ios.red} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis
                  dataKey="date"
                  stroke={CHART_AXIS_COLOR}
                  tick={{ fill: CHART_AXIS_COLOR, fontSize: dims.tickFontSize }}
                  tickFormatter={(v) => formatDateTick(v, cumulativeReturnsData.length)}
                  angle={dims.angleXLabels ? -45 : 0}
                  textAnchor={dims.angleXLabels ? 'end' : 'middle'}
                  height={80}
                  interval={getSmartInterval(cumulativeReturnsData.length, dims.maxXLabels)}
                />
                <YAxis
                  stroke={CHART_AXIS_COLOR}
                  tick={{ fill: CHART_AXIS_COLOR, fontSize: dims.tickFontSize }}
                  tickFormatter={(value) => formatCurrencyShort(value)}
                />
                <Tooltip
                  {...chartTooltipProps}
                  labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  formatter={(value: number | undefined, name: string | undefined) => {
                    if (value === undefined) return ''
                    if (name === 'cumulative') return [formatCurrency(value), 'Cumulative Returns']
                    if (name === 'dailyNet') return [formatCurrency(value), 'Daily Net']
                    return value
                  }}
                />
                <Area
                  type="natural"
                  dataKey="cumulative"
                  stroke={(cumulativeReturnsData[cumulativeReturnsData.length - 1]?.cumulative || 0) >= 0 ? rawColors.ios.green : rawColors.ios.red}
                  strokeWidth={2}
                  fill={(cumulativeReturnsData[cumulativeReturnsData.length - 1]?.cumulative || 0) >= 0 ? "url(#positiveGradient)" : "url(#negativeGradient)"}
                  isAnimationActive={cumulativeReturnsData.length < CHART_ANIMATION_THRESHOLD}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
          className="glass rounded-xl border border-border p-6 shadow-lg"
        >
          <h3 className="text-lg font-semibold text-white mb-6">Returns Metrics</h3>
          <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-4" initial="hidden" animate="visible" variants={staggerContainer}>
            <motion.div variants={fadeUpItem} className="p-4 bg-white/5 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground mb-2">CAGR</p>
              <p className="text-2xl font-bold text-ios-green">{isLoading ? '...' : formatPercent(estimatedCAGR)}</p>
            </motion.div>
            <motion.div variants={fadeUpItem} className="p-4 bg-white/5 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground mb-2">Monthly ROI</p>
              <p className="text-2xl font-bold text-ios-blue">{isLoading ? '...' : formatPercent(roi)}</p>
            </motion.div>
            <motion.div variants={fadeUpItem} className="p-4 bg-white/5 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground mb-2">Net P&L</p>
              <p className={`text-2xl font-bold ${netProfitLoss >= 0 ? 'text-ios-green' : 'text-ios-red'}`}>
                {formatCurrency(Math.abs(netProfitLoss))}
              </p>
            </motion.div>
            <motion.div variants={fadeUpItem} className="p-4 bg-white/5 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground mb-2">Dividends</p>
              <p className="text-2xl font-bold text-ios-green">{formatCurrency(dividendIncome)}</p>
            </motion.div>
            <motion.div variants={fadeUpItem} className="p-4 bg-white/5 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground mb-2">Fees Paid</p>
              <p className="text-2xl font-bold text-ios-orange">{formatCurrency(brokerFees)}</p>
            </motion.div>
            <motion.div variants={fadeUpItem} className="p-4 bg-white/5 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground mb-2">Interest Income</p>
              <p className="text-2xl font-bold text-teal-400">{formatCurrency(interestIncome)}</p>
            </motion.div>
          </motion.div>
        </motion.div>

        {investmentAccounts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="glass rounded-xl border border-border p-6 shadow-lg"
          >
            <h3 className="text-lg font-semibold text-white mb-6">Profit & Loss Breakdown</h3>
            {/* Waterfall Chart */}
            <div className="mb-6">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={waterfallData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="name" tick={{ fill: CHART_AXIS_COLOR, fontSize: dims.tickFontSize }} interval={getSmartInterval(waterfallData.length, dims.maxXLabels)} />
                  <YAxis tickFormatter={(v: number) => formatCurrencyShort(v)} tick={{ fill: CHART_AXIS_COLOR, fontSize: dims.tickFontSize }} />
                  <Tooltip
                    {...chartTooltipProps}
                    formatter={(_value: number | undefined, name: string | undefined, props: { payload?: { value?: number; isTotal?: boolean } }) => {
                      return formatWaterfallTooltip(props.payload, name, formatCurrency)
                    }}
                    labelFormatter={(label: string) => label}
                  />
                  {/* Invisible bar for the "start" offset */}
                  <Bar dataKey="start" stackId="waterfall" fill="transparent" isAnimationActive={false} />
                  {/* Visible bar from start to end */}
                  <Bar dataKey="value" stackId="waterfall" radius={[4, 4, 0, 0]}>
                    {waterfallData.map((entry) => (
                      <Cell
                        key={`cell-${entry.name}`}
                        fill={getWaterfallCellColor(entry, rawColors.ios)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-4" initial="hidden" animate="visible" variants={staggerContainer}>
              <motion.div variants={fadeUpItem} className="p-4 bg-ios-green/10 rounded-lg border border-ios-green/20">
                <p className="text-sm text-muted-foreground mb-2">Total Income</p>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Investment Profit</span>
                    <span className="text-sm font-semibold text-ios-green">{formatCurrency(investmentProfit)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Dividend Income</span>
                    <span className="text-sm font-semibold text-ios-green">{formatCurrency(dividendIncome)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Interest Income</span>
                    <span className="text-sm font-semibold text-teal-400">{formatCurrency(interestIncome)}</span>
                  </div>
                  <div className="flex justify-between border-t border-ios-green/20 pt-2">
                    <span className="text-sm font-semibold text-foreground">Total</span>
                    <span className="text-lg font-bold text-ios-green">{formatCurrency(investmentProfit + dividendIncome + interestIncome)}</span>
                  </div>
                </div>
              </motion.div>
              <motion.div variants={fadeUpItem} className="p-4 bg-ios-red/10 rounded-lg border border-ios-red/20">
                <p className="text-sm text-muted-foreground mb-2">Total Expenses</p>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Investment Loss</span>
                    <span className="text-sm font-semibold text-ios-red">{formatCurrency(investmentLoss)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Broker Fees</span>
                    <span className="text-sm font-semibold text-ios-orange">{formatCurrency(brokerFees)}</span>
                  </div>
                  <div className="flex justify-between border-t border-ios-red/20 pt-2">
                    <span className="text-sm font-semibold text-foreground">Total</span>
                    <span className="text-lg font-bold text-ios-red">{formatCurrency(investmentLoss + brokerFees)}</span>
                  </div>
                </div>
              </motion.div>
            </motion.div>
            <div className="mt-4 p-4 bg-white/5 rounded-lg border border-border">
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold text-white">Net Profit/Loss</span>
                <span className={`text-2xl font-bold ${netProfitLoss >= 0 ? 'text-ios-green' : 'text-ios-red'}`}>
                  {netProfitLoss >= 0 ? '' : '-'}{formatCurrency(Math.abs(netProfitLoss))}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
