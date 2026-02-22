import { motion } from 'framer-motion'
import { rawColors } from '@/constants/colors'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, DollarSign, Activity, Wallet, Briefcase, PiggyBank } from 'lucide-react'
import MetricCard from '@/components/shared/MetricCard'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { getSmartInterval } from '@/lib/chartUtils'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useAnalyticsTimeFilter } from '@/hooks/useAnalyticsTimeFilter'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Line, ReferenceLine, PieChart, Pie, Cell } from 'recharts'
import { chartTooltipProps, PageHeader } from '@/components/ui'
import { useMemo } from 'react'
import { formatCurrency, formatCurrencyShort, formatPercent } from '@/lib/formatters'
import { getDateKey } from '@/lib/dateUtils'
import { CHART_ANIMATION_THRESHOLD } from '@/constants'
import EmptyState from '@/components/shared/EmptyState'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import CategoryBreakdown from '@/components/analytics/CategoryBreakdown'
import {
  calculateIncomeByCategoryBreakdown,
  calculateCashbacksTotal,
  INCOME_CATEGORY_COLORS,
} from '@/lib/preferencesUtils'
import { CHART_AXIS_COLOR } from '@/constants/chartColors'

// Icons for income categories (based on actual data categories)
const INCOME_CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'Employment Income': Briefcase,
  'Investment Income': TrendingUp,
  'Refund & Cashbacks': Wallet,
  'One-time Income': PiggyBank,
  'Other Income': DollarSign,
  'Business/Self Employment Income': Activity,
}

export default function IncomeAnalysisPage() {
  const dims = useChartDimensions()
  const navigate = useNavigate()
  const { data: preferences } = usePreferences()

  const { data: transactions } = useTransactions()
  const { dateRange, timeFilterProps } = useAnalyticsTimeFilter(transactions)

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
    const defaultColor = rawColors.text.tertiary
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
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Income Analysis"
          subtitle="Track your income sources and trends"
          action={
            <AnalyticsTimeFilter {...timeFilterProps} />
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <MetricCard title="Total Income" value={formatCurrency(totalIncome)} icon={DollarSign} color="green" isLoading={isLoading} />
          <MetricCard title="Primary Income Type" value={primaryIncomeType} icon={Activity} color="blue" isLoading={isLoading} />
          <MetricCard title="Growth Rate" value={formatPercent(growthRate, true)} icon={TrendingUp} color="blue" isLoading={isLoading} />
          <MetricCard title="Cashbacks Earned" value={formatCurrency(cashbacksTotal)} icon={Wallet} color="teal" isLoading={isLoading} />
        </div>

        {/* Income Category Breakdown */}
        <motion.div
          className="glass p-6 rounded-xl border border-border"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
        >
          <h3 className="text-lg font-semibold text-white mb-4">Income by Category</h3>
          {incomeTypeChartData.length > 0 ? (
            <div className="flex flex-col lg:flex-row items-center gap-4 md:gap-6 lg:gap-8">
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
                      className="p-4 rounded-lg bg-surface-dropdown/30 hover:bg-surface-dropdown/50 transition-colors"
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
                          <p className="text-xs text-muted-foreground">{percentage}% of income</p>
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

        {/* Income Trend Chart -- Monthly with 3-month rolling average */}
        <motion.div
          className="glass p-6 rounded-xl border border-border"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-ios-green" />
              <div>
                <h3 className="text-lg font-semibold text-white">Income Trend</h3>
                <p className="text-sm text-text-tertiary">Monthly income with 3-month rolling average</p>
              </div>
            </div>

            {isLoading && (
              <div className="h-96 flex items-center justify-center">
                <div className="animate-pulse text-muted-foreground">Loading chart...</div>
              </div>
            )}
            {!isLoading && monthlyTrendData.length > 0 && (
              <ResponsiveContainer width="100%" height={dims.chartHeight}>
                <AreaChart data={monthlyTrendData} margin={dims.margin}>
                  <defs>
                    <linearGradient id="incomeTrendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={rawColors.ios.green} stopOpacity={0.4}/>
                      <stop offset="95%" stopColor={rawColors.ios.green} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="label"
                    stroke={CHART_AXIS_COLOR}
                    tick={{ fill: CHART_AXIS_COLOR, fontSize: dims.tickFontSize }}
                    interval={getSmartInterval(monthlyTrendData.length, dims.maxXLabels)}
                  />
                  <YAxis
                    stroke={CHART_AXIS_COLOR}
                    tick={{ fill: CHART_AXIS_COLOR, fontSize: dims.tickFontSize }}
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
                    label={{ value: `Peak: ${formatCurrencyShort(peakIncome)}`, fill: CHART_AXIS_COLOR, fontSize: 10, position: 'insideTopRight' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="income"
                    stroke={rawColors.ios.green}
                    fill="url(#incomeTrendGradient)"
                    strokeWidth={1.5}
                    isAnimationActive={monthlyTrendData.length < CHART_ANIMATION_THRESHOLD}
                  />
                  <Line
                    type="monotone"
                    dataKey="incomeAvg"
                    stroke={rawColors.ios.green}
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

        {/* Income Sources Breakdown -- bar style matching Expense Breakdown */}
        <CategoryBreakdown
          transactionType="income"
          dateRange={dateRange}
          headerIcon={DollarSign}
          headerIconColor="text-ios-green"
          headerTitle="Income Sources"
          colorMap={INCOME_CATEGORY_COLORS}
          emptyIcon={Wallet}
          emptyTitle="No income data available"
          emptyDescription="Upload your transaction data to see your income breakdown."
          emptyActionLabel="Upload Data"
          emptyActionHref="/upload"
        />
      </div>
    </div>
  )
}
