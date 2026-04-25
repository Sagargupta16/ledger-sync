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
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
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
} from '@/components/ui'
import { CashFlowForecast } from '@/components/analytics'
import EmptyState from '@/components/shared/EmptyState'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
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

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
        <PageHeader
          title="Trends & Forecasts"
          subtitle="Analyze patterns and predict future trends"
          action={<AnalyticsTimeFilter {...timeFilterProps} />}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
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
            valueClassName={metrics.savings.current >= 0 ? 'text-white' : 'text-app-red'}
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
              <h3 className="text-lg font-semibold text-white">Income & Expense Trends</h3>
              <p className="text-sm text-text-tertiary">
                Monthly breakdown with 3-month rolling averages
              </p>
            </div>
          </div>
          {isLoading && (
            <div className="h-80 flex items-center justify-center">
              <div className="animate-pulse text-muted-foreground">Loading chart...</div>
            </div>
          )}
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
                    <span className="text-sm font-medium text-white">{label}</span>
                  </div>
                  <ChartContainer height={180}>
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
                          return month
                            ? new Date(month + '-01').toLocaleDateString('en-US', {
                                month: 'long',
                                year: 'numeric',
                              })
                            : ''
                        }}
                        formatter={(value: number | undefined, name: string | undefined) => [
                          value === undefined ? '' : formatCurrency(value),
                          formatTooltipName(name),
                        ]}
                      />
                      <ReferenceLine
                        y={peak}
                        stroke="rgba(255,255,255,0.2)"
                        strokeDasharray="3 3"
                        label={{
                          value: `Peak: ${formatCurrencyShort(peak)}`,
                          fill: '#71717a',
                          fontSize: 10,
                          position: 'insideTopRight',
                        }}
                      />
                      {activeLabel && (
                        <ReferenceLine
                          x={activeLabel}
                          stroke="rgba(255,255,255,0.3)"
                          strokeDasharray="3 3"
                        />
                      )}
                      <Area
                        type="monotone"
                        dataKey={dataKey}
                        stroke={color}
                        fill={areaGradientUrl(id)}
                        strokeWidth={2}
                        dot={false}
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
                        dot={false}
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
            <h3 className="text-lg font-semibold text-white">Savings Rate Trend</h3>
            <span className="text-sm text-text-tertiary">(% of income saved each month)</span>
          </div>
          {isLoading && (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-pulse text-muted-foreground">Loading chart...</div>
            </div>
          )}
          {!isLoading && dailySavingsData.length > 0 && (
            <ChartContainer height={250}>
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
                    new Date(label).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  }
                  formatter={(
                    _value: number | undefined,
                    _name: string | undefined,
                    props: { payload?: { rawSavingsRate?: number } },
                  ) => {
                    const actual = props.payload?.rawSavingsRate ?? 0
                    const label =
                      actual < 0 ? `${actual.toFixed(1)}% (deficit)` : `${actual.toFixed(1)}%`
                    return [label, 'Cumulative Savings Rate']
                  }}
                />
                <ReferenceLine
                  y={savingsGoalPercent}
                  stroke={rawColors.app.green}
                  strokeDasharray="6 4"
                  strokeWidth={1.5}
                  label={{
                    value: `Target: ${savingsGoalPercent}%`,
                    fill: rawColors.app.green,
                    fontSize: 11,
                    position: 'insideTopRight',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="savingsRate"
                  stroke={rawColors.app.purple}
                  fill={areaGradientUrl('savingsRate')}
                  strokeWidth={2}
                  dot={false}
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
      </div>
    </div>
  )
}
