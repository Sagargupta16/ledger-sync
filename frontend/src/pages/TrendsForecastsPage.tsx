import { motion } from 'framer-motion'
import { rawColors } from '@/constants/colors'
import { CHART_AXIS_COLOR } from '@/constants/chartColors'
import { TrendingUp, TrendingDown, Minus, Wallet, PiggyBank, CreditCard, LineChart, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { useTrends } from '@/hooks/useAnalytics'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { getSmartInterval } from '@/lib/chartUtils'
import { ResponsiveContainer, Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, Line, ReferenceLine } from 'recharts'
import { getCurrentYear, getCurrentMonth, getCurrentFY, getAnalyticsDateRange, getDateKey, type AnalyticsViewMode } from '@/lib/dateUtils'
import { useState, useMemo } from 'react'
import { formatCurrency, formatCurrencyShort, formatPercent, formatDateTick } from '@/lib/formatters'
import { chartTooltipProps, PageHeader } from '@/components/ui'
import { CashFlowForecast } from '@/components/analytics'
import { CHART_ANIMATION_THRESHOLD } from '@/constants'
import EmptyState from '@/components/shared/EmptyState'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { usePreferencesStore } from '@/store/preferencesStore'

type TrendDirection = 'up' | 'down' | 'stable'

interface TrendMetrics {
  current: number
  previous: number
  change: number
  changePercent: number
  direction: TrendDirection
  average: number
  highest: number
  lowest: number
}

function getDirectionIcon(direction: TrendDirection): React.ReactElement {
  if (direction === 'up') {
    return <ArrowUpRight className="w-4 h-4" />
  } else if (direction === 'down') {
    return <ArrowDownRight className="w-4 h-4" />
  } else {
    return <Minus className="w-4 h-4" />
  }
}

function formatTooltipName(name: string | undefined): string {
  if (name === 'income') return 'Income'
  if (name === 'incomeAvg') return 'Income (3m avg)'
  if (name === 'expenses') return 'Spending'
  if (name === 'expensesAvg') return 'Spending (3m avg)'
  if (name === 'savings') return 'Savings'
  if (name === 'savingsAvg') return 'Savings (3m avg)'
  return name || ''
}

// ─── Extracted sub-components ────────────────────────────────────────

interface TrendCardProps {
  metrics: TrendMetrics
  icon: React.ElementType
  iconBgClass: string
  iconColorClass: string
  label: string
  isPositiveGood: boolean
  delay: number
  isLoading: boolean
  valueClassName?: string
  averageClassName?: string
  secondStatLabel?: string
  secondStatClassName?: string
}

function TrendCard({
  metrics,
  icon: Icon,
  iconBgClass,
  iconColorClass,
  label,
  isPositiveGood,
  delay,
  isLoading,
  valueClassName = 'text-white',
  averageClassName = 'text-foreground',
  secondStatLabel = 'Peak',
  secondStatClassName = 'text-foreground',
}: Readonly<TrendCardProps>) {
  const getTrendIcon = (direction: TrendDirection, positiveGood: boolean) => {
    if (direction === 'stable') return <Minus className="w-5 h-5 text-muted-foreground" />
    if (direction === 'up') {
      return positiveGood
        ? <TrendingUp className="w-5 h-5 text-ios-green" />
        : <TrendingUp className="w-5 h-5 text-ios-red" />
    }
    return positiveGood
      ? <TrendingDown className="w-5 h-5 text-ios-red" />
      : <TrendingDown className="w-5 h-5 text-ios-green" />
  }

  const getTrendColor = (direction: TrendDirection, positiveGood: boolean) => {
    if (direction === 'stable') return 'text-muted-foreground'
    if (direction === 'up') return positiveGood ? 'text-ios-green' : 'text-ios-red'
    return positiveGood ? 'text-ios-red' : 'text-ios-green'
  }

  const secondStatValue = metrics.highest

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="glass rounded-xl border border-border p-6 shadow-lg"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-3 ${iconBgClass} rounded-xl`}>
            <Icon className={`w-6 h-6 ${iconColorClass}`} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`text-2xl font-bold ${valueClassName}`}>
              {isLoading ? '...' : formatCurrency(metrics.current)}
            </p>
          </div>
        </div>
        {!isLoading && getTrendIcon(metrics.direction, isPositiveGood)}
      </div>

      {!isLoading && (
        <div className="space-y-3">
          <div className={`flex items-center gap-2 ${getTrendColor(metrics.direction, isPositiveGood)}`}>
            {getDirectionIcon(metrics.direction)}
            <span className="font-semibold">{formatPercent(metrics.changePercent)}</span>
            <span className="text-text-tertiary text-sm">vs previous month</span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
            <div>
              <p className="text-xs text-text-tertiary">Average</p>
              <p className={`text-sm font-medium ${averageClassName}`}>{formatCurrency(metrics.average)}</p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">{secondStatLabel}</p>
              <p className={`text-sm font-medium ${secondStatClassName}`}>{formatCurrency(secondStatValue)}</p>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}

interface MonthlyBreakdownTableProps {
  isLoading: boolean
  chartData: Array<{ month: string; income: number; expenses: number; surplus: number; rawSavingsRate: number }>
  sortedChartData: Array<{ month: string; income: number; expenses: number; surplus: number; rawSavingsRate: number }>
  trendSortKey: string | null
  trendSortDir: 'asc' | 'desc'
  toggleTrendSort: (key: string) => void
}

function MonthlyBreakdownTable({
  isLoading,
  chartData,
  sortedChartData,
  trendSortKey,
  trendSortDir,
  toggleTrendSort,
}: Readonly<MonthlyBreakdownTableProps>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="glass rounded-xl border border-border p-6 shadow-lg"
    >
      <h3 className="text-lg font-semibold text-white mb-6">Month-on-Month Breakdown</h3>
      {isLoading && (
        <div className="text-center py-8 text-muted-foreground">Loading data...</div>
      )}
      {!isLoading && chartData.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground">Month</th>
                <th onClick={() => toggleTrendSort('income')} className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground cursor-pointer hover:text-white select-none">
                  Income {trendSortKey === 'income' && (trendSortDir === 'asc' ? '\u2191' : '\u2193')}
                </th>
                <th onClick={() => toggleTrendSort('expenses')} className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground cursor-pointer hover:text-white select-none">
                  Spending {trendSortKey === 'expenses' && (trendSortDir === 'asc' ? '\u2191' : '\u2193')}
                </th>
                <th onClick={() => toggleTrendSort('surplus')} className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground cursor-pointer hover:text-white select-none">
                  Savings {trendSortKey === 'surplus' && (trendSortDir === 'asc' ? '\u2191' : '\u2193')}
                </th>
                <th onClick={() => toggleTrendSort('rawSavingsRate')} className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground cursor-pointer hover:text-white select-none">
                  Savings Rate {trendSortKey === 'rawSavingsRate' && (trendSortDir === 'asc' ? '\u2191' : '\u2193')}
                </th>
              </tr>
            </thead>
            <motion.tbody
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {sortedChartData.map((trend) => (
                <tr
                  key={trend.month}
                  className="border-b border-border hover:bg-white/10 transition-colors"
                >
                  <td className="py-3 px-4 text-white font-medium">{trend.month}</td>
                  <td className="py-3 px-4 text-right text-ios-green">{formatCurrency(trend.income)}</td>
                  <td className="py-3 px-4 text-right text-ios-red">{formatCurrency(trend.expenses)}</td>
                  <td className={`py-3 px-4 text-right font-bold ${trend.surplus >= 0 ? 'text-ios-purple' : 'text-ios-red'}`}>
                    {formatCurrency(trend.surplus)}
                  </td>
                  <td className={`py-3 px-4 text-right ${trend.rawSavingsRate >= 0 ? 'text-foreground' : 'text-ios-red'}`}>
                    {trend.rawSavingsRate.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </motion.tbody>
          </table>
        </div>
      )}
      {!isLoading && chartData.length === 0 && (
        <EmptyState
          icon={TrendingUp}
          title="No data available"
          description="Monthly breakdown will appear here once you have transactions."
          variant="compact"
        />
      )}
    </motion.div>
  )
}

export default function TrendsForecastsPage() {
  const dims = useChartDimensions()
  const { data: preferences } = usePreferences()
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || 4
  const savingsGoalPercent = preferences?.savings_goal_percent ?? 20
  const { displayPreferences } = usePreferencesStore()

  // Time filter state — same as all other analytics pages
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>(
    (displayPreferences.defaultTimeRange as AnalyticsViewMode) || 'fy'
  )
  const [currentYear, setCurrentYear] = useState(getCurrentYear())
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())
  const [currentFY, setCurrentFY] = useState(getCurrentFY(fiscalYearStartMonth))

  // Fetch all trends data; filter client-side by date range
  const { data: trendsData, isLoading } = useTrends('all_time')
  const { data: allTransactions = [] } = useTransactions()

  // Get date range based on current filter
  const dateRange = useMemo(() => {
    return getAnalyticsDateRange(viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth)
  }, [viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth])

  const dataDateRange = useMemo(() => {
    if (!allTransactions || allTransactions.length === 0) return { minDate: undefined, maxDate: undefined }
    const dates = allTransactions.map(t => t.date.substring(0, 10)).sort()
    return { minDate: dates[0], maxDate: dates[dates.length - 1] }
  }, [allTransactions])

  // Filter monthly trends by the selected date range
  const filteredMonthlyTrends = useMemo(() => {
    if (!trendsData?.monthly_trends) return []
    if (!dateRange.start_date) return trendsData.monthly_trends

    return trendsData.monthly_trends.filter((t) => {
      // monthly_trends have a 'month' field like "2024-01" — compare as YYYY-MM
      const monthStart = `${t.month}-01`
      if (dateRange.start_date && monthStart < dateRange.start_date.substring(0, 10)) return false
      if (dateRange.end_date && monthStart > dateRange.end_date.substring(0, 10)) return false
      return true
    })
  }, [trendsData, dateRange])

  // Calculate comprehensive trend metrics
  const metrics = useMemo(() => {
    const defaultMetrics: TrendMetrics = {
      current: 0,
      previous: 0,
      change: 0,
      changePercent: 0,
      direction: 'stable',
      average: 0,
      highest: 0,
      lowest: 0,
    }

    if (!filteredMonthlyTrends || filteredMonthlyTrends.length < 1) {
      return {
        spending: defaultMetrics,
        income: defaultMetrics,
        savings: defaultMetrics,
      }
    }

    const trends = filteredMonthlyTrends
    const latest = trends.at(-1)!
    const previous = trends.length > 1 ? trends.at(-2)! : latest

    // Calculate spending metrics
    const expenses = trends.map(t => t.expenses)
    const spendingChange = latest.expenses - previous.expenses
    const spendingChangePercent = previous.expenses > 0 ? (spendingChange / previous.expenses) * 100 : 0

    // Calculate income metrics
    const incomes = trends.map(t => t.income)
    const incomeChange = latest.income - previous.income
    const incomeChangePercent = previous.income > 0 ? (incomeChange / previous.income) * 100 : 0

    // Calculate savings metrics
    const surpluses = trends.map(t => t.surplus)
    const savingsChange = latest.surplus - previous.surplus
    const savingsChangePercent = previous.surplus === 0 ? 0 : (savingsChange / Math.abs(previous.surplus)) * 100

    const getDirection = (change: number): TrendDirection => {
      if (Math.abs(change) < 2) return 'stable'
      return change > 0 ? 'up' : 'down'
    }

    return {
      spending: {
        current: latest.expenses,
        previous: previous.expenses,
        change: spendingChange,
        changePercent: spendingChangePercent,
        direction: getDirection(spendingChangePercent),
        average: expenses.reduce((a, b) => a + b, 0) / expenses.length,
        highest: Math.max(...expenses),
        lowest: Math.min(...expenses),
      },
      income: {
        current: latest.income,
        previous: previous.income,
        change: incomeChange,
        changePercent: incomeChangePercent,
        direction: getDirection(incomeChangePercent),
        average: incomes.reduce((a, b) => a + b, 0) / incomes.length,
        highest: Math.max(...incomes),
        lowest: Math.min(...incomes),
      },
      savings: {
        current: latest.surplus,
        previous: previous.surplus,
        change: savingsChange,
        changePercent: savingsChangePercent,
        direction: getDirection(savingsChangePercent),
        average: surpluses.reduce((a, b) => a + b, 0) / surpluses.length,
        highest: Math.max(...surpluses),
        lowest: Math.min(...surpluses),
      },
    }
  }, [filteredMonthlyTrends])

  // Prepare chart data for individual trend lines
  const chartData = useMemo(() => {
    if (!filteredMonthlyTrends.length) return []

    const rawData = filteredMonthlyTrends.map((t, index, arr) => {
      const prev = index > 0 ? arr[index - 1] : t
      const rawSavingsRate = t.income > 0 ? (t.surplus / t.income) * 100 : 0
      return {
        ...t,
        spendingChange: index > 0 ? ((t.expenses - prev.expenses) / prev.expenses) * 100 : 0,
        incomeChange: index > 0 ? ((t.income - prev.income) / prev.income) * 100 : 0,
        rawSavingsRate,
        // Clamp negative savings rate to 0 for cleaner visualization
        savingsRate: Math.max(0, rawSavingsRate),
      }
    })

    return rawData
  }, [filteredMonthlyTrends])

  // Filter transactions by the selected date range
  const filteredTransactions = useMemo(() => {
    if (!allTransactions.length) return []
    if (!dateRange.start_date) return allTransactions

    return allTransactions.filter((t) => {
      const txDate = getDateKey(t.date)
      return txDate >= dateRange.start_date! && (!dateRange.end_date || txDate <= dateRange.end_date)
    })
  }, [allTransactions, dateRange])

  // Daily cumulative savings rate data
  const dailySavingsData = useMemo(() => {
    if (!filteredTransactions.length) return []

    const dailyMap: Record<string, { income: number; expense: number }> = {}
    for (const tx of filteredTransactions) {
      const day = tx.date.substring(0, 10)
      if (!dailyMap[day]) dailyMap[day] = { income: 0, expense: 0 }
      if (tx.type === 'Income') dailyMap[day].income += tx.amount
      else if (tx.type === 'Expense') dailyMap[day].expense += tx.amount
    }

    const sortedDays = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b))
    let cumIncome = 0
    let cumExpense = 0

    return sortedDays.map(([date, { income, expense }]) => {
      cumIncome += income
      cumExpense += expense
      const savingsRate = cumIncome > 0 ? ((cumIncome - cumExpense) / cumIncome) * 100 : 0
      return {
        date,
        savingsRate: Math.max(0, savingsRate),
        rawSavingsRate: savingsRate,
      }
    })
  }, [filteredTransactions])

  // Monthly trend data for the small multiples charts
  const monthlyTrendChartData = useMemo(() => {
    if (!filteredMonthlyTrends.length) return []
    return filteredMonthlyTrends.map((t) => ({
      month: t.month,
      label: new Date(t.month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      income: t.income,
      expenses: t.expenses,
      savings: t.surplus,
    }))
  }, [filteredMonthlyTrends])

  // 3-month rolling average for the monthly charts
  const monthlyTrendWithAvg = useMemo(() => {
    return monthlyTrendChartData.map((d, i) => {
      const start = Math.max(0, i - 2)
      const window = monthlyTrendChartData.slice(start, i + 1)
      return {
        ...d,
        incomeAvg: window.reduce((s, w) => s + w.income, 0) / window.length,
        expensesAvg: window.reduce((s, w) => s + w.expenses, 0) / window.length,
        savingsAvg: window.reduce((s, w) => s + w.savings, 0) / window.length,
      }
    })
  }, [monthlyTrendChartData])

  // Peak values for reference lines (monthly)
  const peakIncome = useMemo(() => Math.max(...monthlyTrendChartData.map(d => d.income), 0), [monthlyTrendChartData])
  const peakExpenses = useMemo(() => Math.max(...monthlyTrendChartData.map(d => d.expenses), 0), [monthlyTrendChartData])
  const peakSavings = useMemo(() => Math.max(...monthlyTrendChartData.map(d => d.savings), 0), [monthlyTrendChartData])

  // Sorting state for the monthly breakdown table
  const [trendSortKey, setTrendSortKey] = useState<string | null>(null)
  const [trendSortDir, setTrendSortDir] = useState<'asc' | 'desc'>('desc')

  const toggleTrendSort = (key: string) => {
    if (trendSortKey === key) {
      setTrendSortDir(trendSortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setTrendSortKey(key)
      setTrendSortDir('desc')
    }
  }

  const sortedChartData = useMemo(() => {
    const data = chartData.slice(-8)
    if (!trendSortKey) return data
    return [...data].sort((a, b) => {
      const av = a[trendSortKey as keyof typeof a]
      const bv = b[trendSortKey as keyof typeof b]
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return trendSortDir === 'asc' ? cmp : -cmp
    })
  }, [chartData, trendSortKey, trendSortDir])

  // Linked crosshair state for small-multiples charts
  const [activeLabel, setActiveLabel] = useState<string | null>(null)

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Trends & Forecasts"
          subtitle="Analyze patterns and predict future trends"
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
              availableModes={['all_time', 'fy', 'yearly']}
            />
          }
        />

        {/* Trend Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <TrendCard
            metrics={metrics.spending}
            icon={CreditCard}
            iconBgClass="bg-ios-red/20"
            iconColorClass="text-ios-red"
            label="Spending Trend"
            isPositiveGood={false}
            delay={0.2}
            isLoading={isLoading}
          />
          <TrendCard
            metrics={metrics.income}
            icon={Wallet}
            iconBgClass="bg-ios-green/20"
            iconColorClass="text-ios-green"
            label="Income Trend"
            isPositiveGood={true}
            delay={0.3}
            isLoading={isLoading}
          />
          <TrendCard
            metrics={metrics.savings}
            icon={PiggyBank}
            iconBgClass="bg-ios-purple/20"
            iconColorClass="text-ios-purple"
            label="Savings Trend"
            isPositiveGood={true}
            delay={0.4}
            isLoading={isLoading}
            valueClassName={metrics.savings.current >= 0 ? 'text-white' : 'text-ios-red'}
            averageClassName={metrics.savings.average >= 0 ? 'text-foreground' : 'text-ios-red'}
            secondStatLabel="Best Month"
            secondStatClassName="text-ios-green"
          />
        </div>

        {/* Main Trend Chart — Small Multiples */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="glass rounded-xl border border-border p-6 shadow-lg"
        >
          <div className="flex items-center gap-3 mb-6">
            <LineChart className="w-5 h-5 text-ios-blue" />
            <div>
              <h3 className="text-lg font-semibold text-white">Income & Expense Trends</h3>
              <p className="text-sm text-text-tertiary">Monthly breakdown with 3-month rolling averages</p>
            </div>
          </div>
          {isLoading && (
            <div className="h-80 flex items-center justify-center">
              <div className="animate-pulse text-muted-foreground">Loading chart...</div>
            </div>
          )}
          {!isLoading && monthlyTrendWithAvg.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Income mini chart */}
              <div className="glass-thin rounded-xl border border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full bg-ios-green" />
                  <span className="text-sm font-medium text-white">Income</span>
                </div>
                {monthlyTrendWithAvg.length === 0 ? (
                  <ChartEmptyState height={180} />
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={monthlyTrendWithAvg} onMouseMove={(e) => { if (e?.activeLabel) setActiveLabel(e.activeLabel as string) }} onMouseLeave={() => setActiveLabel(null)}>
                      <defs>
                        <linearGradient id="trendIncomeGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={rawColors.ios.green} stopOpacity={0.4}/>
                          <stop offset="95%" stopColor={rawColors.ios.green} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="label" tick={{ fill: CHART_AXIS_COLOR, fontSize: dims.tickFontSize }} interval={getSmartInterval(monthlyTrendWithAvg.length, dims.maxXLabels)} />
                      <YAxis hide />
                      <Tooltip
                        {...chartTooltipProps}
                        labelFormatter={(_label: string, payload: Array<{ payload?: { month?: string } }>) => {
                          const month = payload?.[0]?.payload?.month
                          return month ? new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : ''
                        }}
                        formatter={(value: number | undefined, name: string | undefined) => [
                          value === undefined ? '' : formatCurrency(value),
                          formatTooltipName(name)
                        ]}
                      />
                      <ReferenceLine y={peakIncome} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" label={{ value: `Peak: ${formatCurrencyShort(peakIncome)}`, fill: CHART_AXIS_COLOR, fontSize: 10, position: 'insideTopRight' }} />
                      {activeLabel && <ReferenceLine x={activeLabel} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 3" />}
                      <Area type="monotone" dataKey="income" stroke={rawColors.ios.green} fill="url(#trendIncomeGradient)" strokeWidth={1.5} isAnimationActive={monthlyTrendWithAvg.length < CHART_ANIMATION_THRESHOLD} />
                      <Line type="monotone" dataKey="incomeAvg" stroke={rawColors.ios.green} strokeWidth={2} strokeDasharray="6 3" dot={false} name="Income (3m avg)" isAnimationActive={monthlyTrendWithAvg.length < CHART_ANIMATION_THRESHOLD} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Expenses mini chart */}
              <div className="glass-thin rounded-xl border border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full bg-ios-red" />
                  <span className="text-sm font-medium text-white">Expenses</span>
                </div>
                {monthlyTrendWithAvg.length === 0 ? (
                  <ChartEmptyState height={180} />
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={monthlyTrendWithAvg} onMouseMove={(e) => { if (e?.activeLabel) setActiveLabel(e.activeLabel as string) }} onMouseLeave={() => setActiveLabel(null)}>
                      <defs>
                        <linearGradient id="trendExpenseGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={rawColors.ios.red} stopOpacity={0.4}/>
                          <stop offset="95%" stopColor={rawColors.ios.red} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="label" tick={{ fill: CHART_AXIS_COLOR, fontSize: dims.tickFontSize }} interval={getSmartInterval(monthlyTrendWithAvg.length, dims.maxXLabels)} />
                      <YAxis hide />
                      <Tooltip
                        {...chartTooltipProps}
                        labelFormatter={(_label: string, payload: Array<{ payload?: { month?: string } }>) => {
                          const month = payload?.[0]?.payload?.month
                          return month ? new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : ''
                        }}
                        formatter={(value: number | undefined, name: string | undefined) => [
                          value === undefined ? '' : formatCurrency(value),
                          formatTooltipName(name)
                        ]}
                      />
                      <ReferenceLine y={peakExpenses} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" label={{ value: `Peak: ${formatCurrencyShort(peakExpenses)}`, fill: CHART_AXIS_COLOR, fontSize: 10, position: 'insideTopRight' }} />
                      {activeLabel && <ReferenceLine x={activeLabel} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 3" />}
                      <Area type="monotone" dataKey="expenses" stroke={rawColors.ios.red} fill="url(#trendExpenseGradient)" strokeWidth={1.5} isAnimationActive={monthlyTrendWithAvg.length < CHART_ANIMATION_THRESHOLD} />
                      <Line type="monotone" dataKey="expensesAvg" stroke={rawColors.ios.red} strokeWidth={2} strokeDasharray="6 3" dot={false} name="Spending (3m avg)" isAnimationActive={monthlyTrendWithAvg.length < CHART_ANIMATION_THRESHOLD} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Savings mini chart */}
              <div className="glass-thin rounded-xl border border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full bg-ios-purple" />
                  <span className="text-sm font-medium text-white">Savings</span>
                </div>
                {monthlyTrendWithAvg.length === 0 ? (
                  <ChartEmptyState height={180} />
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={monthlyTrendWithAvg} onMouseMove={(e) => { if (e?.activeLabel) setActiveLabel(e.activeLabel as string) }} onMouseLeave={() => setActiveLabel(null)}>
                      <defs>
                        <linearGradient id="trendSavingsGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={rawColors.ios.purple} stopOpacity={0.4}/>
                          <stop offset="95%" stopColor={rawColors.ios.purple} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="label" tick={{ fill: CHART_AXIS_COLOR, fontSize: dims.tickFontSize }} interval={getSmartInterval(monthlyTrendWithAvg.length, dims.maxXLabels)} />
                      <YAxis hide />
                      <Tooltip
                        {...chartTooltipProps}
                        labelFormatter={(_label: string, payload: Array<{ payload?: { month?: string } }>) => {
                          const month = payload?.[0]?.payload?.month
                          return month ? new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : ''
                        }}
                        formatter={(value: number | undefined, name: string | undefined) => [
                          value === undefined ? '' : formatCurrency(value),
                          formatTooltipName(name)
                        ]}
                      />
                      <ReferenceLine y={peakSavings} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" label={{ value: `Peak: ${formatCurrencyShort(peakSavings)}`, fill: CHART_AXIS_COLOR, fontSize: 10, position: 'insideTopRight' }} />
                      {activeLabel && <ReferenceLine x={activeLabel} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 3" />}
                      <Area type="monotone" dataKey="savings" stroke={rawColors.ios.purple} fill="url(#trendSavingsGradient)" strokeWidth={1.5} isAnimationActive={monthlyTrendWithAvg.length < CHART_ANIMATION_THRESHOLD} />
                      <Line type="monotone" dataKey="savingsAvg" stroke={rawColors.ios.purple} strokeWidth={2} strokeDasharray="6 3" dot={false} name="Savings (3m avg)" isAnimationActive={monthlyTrendWithAvg.length < CHART_ANIMATION_THRESHOLD} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}
          {!isLoading && monthlyTrendWithAvg.length === 0 && (
            <EmptyState
              icon={LineChart}
              title="No data available"
              description="Upload your transaction data to see spending trends and forecasts."
              actionLabel="Upload Data"
              actionHref="/upload"
              variant="chart"
            />
          )}
        </motion.div>

        {/* Savings Rate Trend */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="glass rounded-xl border border-border p-6 shadow-lg"
        >
          <div className="flex items-center gap-3 mb-6">
            <PiggyBank className="w-5 h-5 text-ios-purple" />
            <h3 className="text-lg font-semibold text-white">Savings Rate Trend</h3>
            <span className="text-sm text-text-tertiary">(% of income saved each month)</span>
          </div>
          {isLoading && (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-pulse text-muted-foreground">Loading chart...</div>
            </div>
          )}
          {!isLoading && dailySavingsData.length > 0 && (
            dailySavingsData.length === 0 ? (
              <ChartEmptyState height={250} />
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={dailySavingsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="date" stroke={CHART_AXIS_COLOR} fontSize={dims.tickFontSize} tickFormatter={(v) => formatDateTick(v, dailySavingsData.length)} angle={dims.angleXLabels ? -45 : 0} textAnchor={dims.angleXLabels ? 'end' : 'middle'} height={70} interval={getSmartInterval(dailySavingsData.length, dims.maxXLabels)} />
                  <YAxis stroke={CHART_AXIS_COLOR} fontSize={dims.tickFontSize} tickFormatter={(v) => `${Math.round(v)}%`} domain={[0, 'auto']} />
                  <Tooltip
                    {...chartTooltipProps}
                    labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    formatter={(_value: number | undefined, _name: string | undefined, props: { payload?: { rawSavingsRate?: number } }) => {
                      const actual = props.payload?.rawSavingsRate ?? 0
                      const label = actual < 0 ? `${actual.toFixed(1)}% (deficit)` : `${actual.toFixed(1)}%`
                      return [label, 'Cumulative Savings Rate']
                    }}
                  />
                  <defs>
                    <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={rawColors.ios.purple} stopOpacity={0.4}/>
                      <stop offset="95%" stopColor={rawColors.ios.purple} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <ReferenceLine
                    y={savingsGoalPercent}
                    stroke={rawColors.ios.green}
                    strokeDasharray="6 4"
                    strokeWidth={1.5}
                    label={{
                      value: `Target: ${savingsGoalPercent}%`,
                      fill: rawColors.ios.green,
                      fontSize: 11,
                      position: 'insideTopRight',
                    }}
                  />
                  <Area
                    type="natural"
                    dataKey="savingsRate"
                    stroke={rawColors.ios.purple}
                    fill="url(#savingsGradient)"
                    strokeWidth={2}
                    isAnimationActive={dailySavingsData.length < CHART_ANIMATION_THRESHOLD}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )
          )}
          {!isLoading && dailySavingsData.length === 0 && (
            <EmptyState
              icon={PiggyBank}
              title="No data available"
              description="Add transactions to track your savings rate over time."
              variant="compact"
            />
          )}
        </motion.div>

        {/* Monthly Breakdown Table */}
        <MonthlyBreakdownTable
          isLoading={isLoading}
          chartData={chartData}
          sortedChartData={sortedChartData}
          trendSortKey={trendSortKey}
          trendSortDir={trendSortDir}
          toggleTrendSort={toggleTrendSort}
        />

        {/* Cash Flow Forecast */}
        <CashFlowForecast />
      </div>
    </div>
  )
}
