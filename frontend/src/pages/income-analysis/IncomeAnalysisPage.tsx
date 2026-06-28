import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMemo } from 'react'

import { motion } from 'framer-motion'
import { TrendingUp, DollarSign, Activity, Wallet, Briefcase, PiggyBank } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Line } from 'recharts'

import StandardPieChart from '@/components/analytics/StandardPieChart'

import { rawColors } from '@/constants/colors'
import MetricCard from '@/components/shared/MetricCard'
import Sparkline from '@/components/shared/Sparkline'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import { useQuery } from '@tanstack/react-query'

import { useChartDimensions } from '@/hooks/useChartDimensions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useDataDateRange } from '@/hooks/api/useAnalytics'
import { calculationsApi } from '@/services/api/calculations'
import { useAnalyticsTimeFilter } from '@/hooks/useAnalyticsTimeFilter'
import { chartTooltipProps, PageHeader, ChartContainer, GRID_DEFAULTS, xAxisDefaults, yAxisDefaults, shouldAnimate, areaGradient, areaGradientUrl, referenceLine, currencyTooltipFormatter } from '@/components/ui'
import { formatCurrency, formatCurrencyShort, formatPercent } from '@/lib/formatters'
import { formatMonthKey } from '@/lib/dateUtils'
import EmptyState from '@/components/shared/EmptyState'
import { FilterBanner } from '@/components/shared/FilterBanner'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import CategoryBreakdown from '@/components/analytics/CategoryBreakdown'
import { INCOME_CATEGORY_COLORS } from '@/lib/preferencesUtils'

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
  const [searchParams, setSearchParams] = useSearchParams()
  const categoryFilter = searchParams.get('category')
  const clearCategoryFilter = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('category')
    setSearchParams(next, { replace: true })
  }
  const { data: preferences } = usePreferences()

  // Time-filter nav bounds come from the lightweight date-range endpoint, not a
  // full-ledger fetch.
  const dateBounds = useDataDateRange()
  const { dateRange, timeFilterProps } = useAnalyticsTimeFilter(dateBounds)

  // All income stats computed server-side (date range + optional category +
  // the user's non-taxable list for cashback matching).
  const cashbackCategories = preferences?.non_taxable_income_categories ?? []
  const { data: income, isLoading } = useQuery({
    queryKey: [
      'income-analysis',
      dateRange.start_date,
      dateRange.end_date,
      categoryFilter,
      cashbackCategories,
    ],
    queryFn: async () =>
      (
        await calculationsApi.getIncomeAnalysis({
          start_date: dateRange.start_date ?? undefined,
          end_date: dateRange.end_date ?? undefined,
          category: categoryFilter ?? undefined,
          cashback_categories: cashbackCategories,
        })
      ).data,
    enabled: preferences !== undefined,
    staleTime: Infinity,
  })

  const totalIncome = income?.total_income ?? 0
  const cashbacksTotal = income?.cashbacks_total ?? 0
  const peakIncome = income?.peak_income ?? 0
  const growthRate = income?.growth_rate ?? 0

  // Income category chart data (actual data categories, colored + sorted).
  const incomeTypeChartData = useMemo(() => {
    const defaultColor = rawColors.text.tertiary
    return Object.entries(income?.category_breakdown ?? {})
      .filter(([, value]) => value > 0)
      .map(([category, value]) => ({
        name: category,
        category,
        value,
        color: INCOME_CATEGORY_COLORS[category] || defaultColor,
      }))
      .sort((a, b) => b.value - a.value)
  }, [income])

  const primaryIncomeType = incomeTypeChartData[0]?.name || 'N/A'
  const primaryIncomeValue = incomeTypeChartData[0]?.value ?? 0
  const primaryShare = totalIncome > 0 ? (primaryIncomeValue / totalIncome) * 100 : 0
  const cashbackShare = totalIncome > 0 ? (cashbacksTotal / totalIncome) * 100 : 0

  // Monthly trend with rolling 3-month average + display labels.
  const monthlyTrendData = useMemo(
    () =>
      (income?.monthly_data ?? []).map((d) => ({
        month: d.month,
        label: formatMonthKey(d.month, { month: 'short', year: '2-digit' }),
        income: d.income,
        incomeAvg: d.income_avg_3m,
      })),
    [income],
  )

  // Mean monthly income, drawn as a reference line alongside the peak marker.
  const avgIncome = useMemo(() => {
    if (monthlyTrendData.length === 0) return 0
    const sum = monthlyTrendData.reduce((acc, d) => acc + d.income, 0)
    return sum / monthlyTrendData.length
  }, [monthlyTrendData])

  // Bare monthly income series, reused for the Growth Rate KPI sparkline (same
  // numbers the trend chart plots -- a compact mini-trend, not a second graph).
  const incomeSeries = useMemo(
    () => monthlyTrendData.map((d) => d.income),
    [monthlyTrendData],
  )

  if (isLoading) return <PageSkeleton />

  let growthColor: 'green' | 'red' | 'blue' = 'blue'
  if (growthRate > 0) growthColor = 'green'
  else if (growthRate < 0) growthColor = 'red'

  return (
    <div className="min-h-dvh p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Income Analysis"
          subtitle="Track your income sources and trends"
          action={
            <AnalyticsTimeFilter {...timeFilterProps} />
          }
        />

        <FilterBanner value={categoryFilter} label="Source" onClear={clearCategoryFilter} />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
          <MetricCard title="Total Income" value={formatCurrency(totalIncome)} icon={DollarSign} color="green" isLoading={isLoading} />
          <MetricCard
            title="Primary Income Type"
            value={primaryIncomeType}
            subtitle={primaryShare > 0 ? `${formatPercent(primaryShare)} of income` : undefined}
            icon={Activity}
            color="blue"
            isLoading={isLoading}
          />
          <MetricCard
            title="Growth Rate"
            value={formatPercent(growthRate, true)}
            subtitle="First vs latest month"
            trend={
              incomeSeries.length >= 2 ? (
                <Sparkline
                  data={incomeSeries}
                  color={rawColors.app[growthColor === 'red' ? 'red' : 'green']}
                  height={36}
                  showTooltip={false}
                />
              ) : undefined
            }
            icon={TrendingUp}
            color={growthColor}
            isLoading={isLoading}
          />
          <MetricCard
            title="Cashbacks Earned"
            value={formatCurrency(cashbacksTotal)}
            subtitle={cashbacksTotal > 0 ? `${formatPercent(cashbackShare)} of income` : undefined}
            icon={Wallet}
            color="teal"
            isLoading={isLoading}
          />
        </div>

        {/* Income Category Breakdown */}
        <motion.div
          className="glass p-4 md:p-6 rounded-xl border border-border"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
        >
          <h3 className="text-lg font-semibold text-white mb-4">Income by Category</h3>
          {incomeTypeChartData.length > 0 ? (
            <div className="flex flex-col lg:flex-row items-center gap-4 md:gap-6 lg:gap-8">
              <div className="w-64" role="img" aria-label="Donut chart breaking down total income by source category.">
                <StandardPieChart
                  data={incomeTypeChartData}
                  height={256}
                  innerRadius={50}
                  outerRadius={90}
                  showLegend={false}
                  onSliceClick={(name) =>
                    navigate(`/transactions?type=Income&category=${encodeURIComponent(name)}`)
                  }
                />
              </div>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {incomeTypeChartData.map((item) => {
                  const Icon = INCOME_CATEGORY_ICONS[item.category] || DollarSign
                  const percentage = totalIncome > 0 ? ((item.value / totalIncome) * 100).toFixed(1) : '0'
                  return (
                    <div
                      key={item.name}
                      className="p-4 rounded-lg bg-surface-dropdown/30 hover:bg-white/[0.04] transition-colors"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div
                          className="p-2 rounded-lg"
                          style={{ backgroundColor: `${item.color}20` }}
                        >
                          <div style={{ color: item.color }}><Icon className="w-5 h-5" /></div>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: item.color }} />
                            <p className="font-medium text-white">{item.name}</p>
                          </div>
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
          className="glass p-4 md:p-6 rounded-xl border border-border"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-app-green" />
              <div>
                <h3 className="text-lg font-semibold text-white">Income Trend</h3>
                <p className="text-sm text-text-tertiary">Monthly income with 3-month rolling average</p>
              </div>
            </div>

            {monthlyTrendData.length > 0 && (
              <ChartContainer
                height={dims.chartHeight}
                ariaLabel="Monthly income over time with a 3-month rolling average, plus peak and average reference lines."
              >
                <AreaChart data={monthlyTrendData} margin={dims.margin}>
                  <defs>
                    {areaGradient('incomeTrend', rawColors.app.green, 0.4, 0)}
                  </defs>
                  <CartesianGrid {...GRID_DEFAULTS} />
                  <XAxis
                    {...xAxisDefaults(monthlyTrendData.length)}
                    dataKey="label"
                  />
                  <YAxis {...yAxisDefaults()} />
                  <Tooltip
                    {...chartTooltipProps}
                    labelFormatter={(_label: unknown, payload: ReadonlyArray<{ payload?: { month?: string } }>) => {
                      const month = payload?.[0]?.payload?.month
                      return month ? formatMonthKey(month, { month: 'long', year: 'numeric' }) : ''
                    }}
                    formatter={(value, name) => [
                      currencyTooltipFormatter(value),
                      name === 'incomeAvg' ? 'Income (3m avg)' : 'Income',
                    ]}
                    itemSorter={(item) => -(item.value as number)}
                  />
                  {referenceLine({ y: peakIncome, label: `Peak: ${formatCurrencyShort(peakIncome)}`, variant: 'peak' })}
                  {avgIncome > 0 &&
                    referenceLine({ y: avgIncome, label: `Avg: ${formatCurrencyShort(avgIncome)}`, variant: 'avg' })}
                  <Area
                    type="monotone"
                    dataKey="income"
                    stroke={rawColors.app.green}
                    fill={areaGradientUrl('incomeTrend')}
                    strokeWidth={2}
                    dot={monthlyTrendData.length === 1 ? { r: 3, fill: rawColors.app.green } : false}
                    isAnimationActive={shouldAnimate(monthlyTrendData.length)}
                    animationDuration={600}
                    animationEasing="ease-out"
                  />
                  <Line
                    type="monotone"
                    dataKey="incomeAvg"
                    stroke={rawColors.app.green}
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={monthlyTrendData.length === 1 ? { r: 3, fill: rawColors.app.green } : false}
                    name="Income (3m avg)"
                    isAnimationActive={shouldAnimate(monthlyTrendData.length)}
                    animationDuration={600}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ChartContainer>
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
          headerIconColor="text-app-green"
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
