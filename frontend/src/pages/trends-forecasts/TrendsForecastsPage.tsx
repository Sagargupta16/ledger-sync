import { motion } from 'framer-motion'
import {
  Wallet,
  PiggyBank,
  CreditCard,
  LineChart,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Line,
  ReferenceLine,
} from 'recharts'
import { rawColors } from '@/constants/colors'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { formatCurrency, formatCurrencyShort, formatDate } from '@/lib/formatters'
import { formatMonthKey } from '@/lib/dateUtils'
import {
  chartTooltipProps,
  PageHeader,
  ChartContainer,
  GRID_DEFAULTS,
  xAxisDefaults,
  yAxisDefaults,
  areaGradient,
  areaGradientUrl,
  shouldAnimate,
  ACTIVE_DOT,
  referenceLine,
  PageContainer,
} from '@/components/ui'
import { CashFlowForecast } from '@/components/analytics'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { ChartSkeleton } from '@/components/shared/LoadingSkeleton'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import { useTrendsForecasts } from './useTrendsForecasts'
import { formatTooltipName } from './trendsUtils'
import TrendCard from './components/TrendCard'
import MonthlyBreakdownTable from './components/MonthlyBreakdownTable'

export default function TrendsForecastsPage() {
  const dims = useChartDimensions()
  const {
    savingsGoalPercent,
    isLoading,
    isError,
    timeFilterProps,
    metrics,
    dailySavingsData,
    monthlyTrendWithAvg,
    peakIncome,
    peakExpenses,
    peakSavings,
    recentChartData,
    activeLabel,
    setActiveLabel,
  } = useTrendsForecasts()

  if (isError && !isLoading) {
    return (
      <PageContainer>
        <PageHeader
          title="Trends & Forecasts"
          subtitle="Analyze patterns and predict future trends"
        />
        <ErrorState
          variant="card"
          message="We couldn't load your trends data. Please try again."
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
        <PageHeader
          title="Trends & Forecasts"
          subtitle="Analyze patterns and predict future trends"
          action={<AnalyticsTimeFilter {...timeFilterProps} />}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          <TrendCard
            metrics={metrics.spending}
            icon={CreditCard}
            iconBgClass="bg-app-red/20"
            iconColorClass="text-app-red"
            label="Spending Trend"
            isPositiveGood={false}
            delay={0.2}
            isLoading={isLoading}
          />
          <TrendCard
            metrics={metrics.income}
            icon={Wallet}
            iconBgClass="bg-app-green/20"
            iconColorClass="text-app-green"
            label="Income Trend"
            isPositiveGood={true}
            delay={0.3}
            isLoading={isLoading}
          />
          <TrendCard
            metrics={metrics.savings}
            icon={PiggyBank}
            iconBgClass="bg-app-purple/20"
            iconColorClass="text-app-purple"
            label="Savings Trend"
            isPositiveGood={true}
            delay={0.4}
            isLoading={isLoading}
            valueClassName={metrics.savings.current >= 0 ? 'text-foreground' : 'text-app-red'}
            averageClassName={metrics.savings.average >= 0 ? 'text-foreground' : 'text-app-red'}
            secondStatLabel="Best Month"
            secondStatClassName="text-app-green"
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="glass rounded-2xl border border-border p-4 md:p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <LineChart className="w-5 h-5 text-app-blue" />
            <div>
              <h3 className="text-lg font-semibold text-foreground">Income & Expense Trends</h3>
              <p className="text-sm text-text-tertiary">
                Monthly breakdown with 3-month rolling averages
              </p>
            </div>
          </div>
          {isLoading && <ChartSkeleton height="h-80" />}
          {!isLoading && monthlyTrendWithAvg.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {(
                [
                  {
                    id: 'trendIncome',
                    color: rawColors.app.green,
                    label: 'Income',
                    dataKey: 'income',
                    avgKey: 'incomeAvg',
                    peak: peakIncome,
                  },
                  {
                    id: 'trendExpense',
                    color: rawColors.app.red,
                    label: 'Expenses',
                    dataKey: 'expenses',
                    avgKey: 'expensesAvg',
                    peak: peakExpenses,
                  },
                  {
                    id: 'trendSavings',
                    color: rawColors.app.purple,
                    label: 'Savings',
                    dataKey: 'savings',
                    avgKey: 'savingsAvg',
                    peak: peakSavings,
                  },
                ] as const
              ).map(({ id, color, label, dataKey, avgKey, peak }) => (
                <div key={id} className="glass-thin rounded-xl border border-border p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-sm font-medium text-foreground">{label}</span>
                  </div>
                  <ChartContainer
                    height={180}
                    ariaLabel={`Monthly ${label.toLowerCase()} with 3-month rolling average and peak reference line`}
                  >
                    <AreaChart
                      data={monthlyTrendWithAvg}
                      onMouseMove={(e) => {
                        if (e?.activeLabel) setActiveLabel(e.activeLabel as string)
                      }}
                      onMouseLeave={() => setActiveLabel(null)}
                    >
                      <defs>{areaGradient(id, color, 0.4, 0.02)}</defs>
                      <CartesianGrid {...GRID_DEFAULTS} />
                      <XAxis {...xAxisDefaults(monthlyTrendWithAvg.length)} dataKey="label" />
                      <YAxis hide />
                      <Tooltip
                        {...chartTooltipProps}
                        labelFormatter={(
                          _label: unknown,
                          payload: ReadonlyArray<{ payload?: { month?: string } }>,
                        ) => {
                          const month = payload?.[0]?.payload?.month
                          return month ? formatMonthKey(month, { month: 'long', year: 'numeric' }) : ''
                        }}
                        formatter={(value, name) => [
                          typeof value === 'number' ? formatCurrency(value) : '',
                          formatTooltipName(name === undefined ? undefined : String(name)),
                        ]}
                      />
                      {referenceLine({
                        y: peak,
                        label: `Peak: ${formatCurrencyShort(peak)}`,
                        variant: 'peak',
                      })}
                      {activeLabel && (
                        <ReferenceLine
                          x={activeLabel}
                          stroke={rawColors.chart.activeStroke}
                          strokeDasharray="3 3"
                        />
                      )}
                      <Area
                        type="monotone"
                        dataKey={dataKey}
                        stroke={color}
                        fill={areaGradientUrl(id)}
                        strokeWidth={2}
                        dot={monthlyTrendWithAvg.length === 1 ? { r: 3, fill: color } : false}
                        activeDot={{ ...ACTIVE_DOT, fill: color }}
                        isAnimationActive={shouldAnimate(monthlyTrendWithAvg.length)}
                        animationDuration={600}
                        animationEasing="ease-out"
                      />
                      <Line
                        type="monotone"
                        dataKey={avgKey}
                        stroke={color}
                        strokeWidth={2}
                        strokeDasharray="6 3"
                        dot={monthlyTrendWithAvg.length === 1 ? { r: 3, fill: color } : false}
                        activeDot={{ ...ACTIVE_DOT, fill: color }}
                        name={`${label} (3m avg)`}
                        isAnimationActive={shouldAnimate(monthlyTrendWithAvg.length)}
                        animationDuration={600}
                        animationEasing="ease-out"
                      />
                    </AreaChart>
                  </ChartContainer>
                </div>
              ))}
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

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-50px' }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="glass rounded-2xl border border-border p-4 md:p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <PiggyBank className="w-5 h-5 text-app-purple" />
            <h3 className="text-lg font-semibold text-foreground">Savings Rate Trend</h3>
            <span className="text-sm text-text-tertiary">(% of income saved each month)</span>
          </div>
          {isLoading && <ChartSkeleton height="h-64" />}
          {!isLoading && dailySavingsData.length > 0 && (
            <ChartContainer
              height={250}
              ariaLabel="Cumulative savings rate over time as a percentage of income, with savings-goal target line"
            >
              <AreaChart data={dailySavingsData}>
                <defs>{areaGradient('savingsRate', rawColors.app.purple, 0.4, 0.02)}</defs>
                <CartesianGrid {...GRID_DEFAULTS} />
                <XAxis
                  {...xAxisDefaults(dailySavingsData.length, {
                    angle: dims.angleXLabels ? -45 : undefined,
                    height: 70,
                    dateFormatter: true,
                  })}
                  dataKey="date"
                />
                <YAxis
                  {...yAxisDefaults({ currency: false })}
                  tickFormatter={(v: number) => `${Math.round(v)}%`}
                  domain={[0, 'auto']}
                />
                <Tooltip
                  {...chartTooltipProps}
                  labelFormatter={(label) =>
                    formatDate(label, {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  }
                  formatter={(_value, _name, props) => {
                    const actual = (props.payload as { rawSavingsRate?: number } | undefined)?.rawSavingsRate ?? 0
                    const label =
                      actual < 0 ? `${actual.toFixed(1)}% (deficit)` : `${actual.toFixed(1)}%`
                    return [label, 'Cumulative Savings Rate']
                  }}
                />
                {referenceLine({
                  y: savingsGoalPercent,
                  label: `Target: ${savingsGoalPercent}%`,
                  variant: 'goal',
                })}
                <Area
                  type="monotone"
                  dataKey="savingsRate"
                  stroke={rawColors.app.purple}
                  fill={areaGradientUrl('savingsRate')}
                  strokeWidth={2}
                  dot={dailySavingsData.length === 1 ? { r: 3, fill: rawColors.app.purple } : false}
                  isAnimationActive={shouldAnimate(dailySavingsData.length)}
                  animationDuration={600}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ChartContainer>
          )}
          {!isLoading && dailySavingsData.length === 0 && (
            <ChartEmptyState height={250} />
          )}
        </motion.div>

        <MonthlyBreakdownTable isLoading={isLoading} chartData={recentChartData} />

        <CashFlowForecast />
    </PageContainer>
  )
}
