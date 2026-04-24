import { motion } from 'framer-motion'
import {
  Flame,
  TrendingDown,
  TrendingUp,
  Sun,
  Moon,
  DollarSign,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import {
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList,
} from 'recharts'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import { formatCurrency, formatCurrencyCompact, formatCurrencyShort } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import {
  chartTooltipProps,
  PageHeader,
  ChartContainer,
  GRID_DEFAULTS,
  xAxisDefaults,
  yAxisDefaults,
  shouldAnimate,
  BAR_RADIUS,
} from '@/components/ui'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import StatCard from '@/pages/year-in-review/components/StatCard'
import InsightRow from '@/pages/year-in-review/components/InsightRow'
import DayOfWeekChart, { type DayCell } from '@/pages/year-in-review/components/DayOfWeekChart'
import { useYearInReview } from './useYearInReview'
import { DAYS, heatmapColors, modeAccent } from './types'
import { getStreakColor, getStreakDotColor } from './heatmapUtils'
import MobileMonthlySummary from './components/MobileMonthlySummary'
import HeatmapWeeks from './components/HeatmapWeeks'
import HeatmapDayDetail from './components/HeatmapDayDetail'

export default function YearInReviewPage() {
  const dims = useChartDimensions()
  const {
    transactions,
    mode,
    setMode,
    hoveredDay,
    setHoveredDay,
    viewMode,
    setViewMode,
    currentYear,
    setCurrentYear,
    currentMonth,
    setCurrentMonth,
    currentFY,
    setCurrentFY,
    dataDateRange,
    fiscalYearStartMonth,
    selectedYear,
    isFYMode,
    grid,
    modeMax,
    monthLabels,
    stats,
    monthlyBarData,
  } = useYearInReview()

  if (transactions.length === 0) return <PageSkeleton />

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8">
      <PageHeader
        title="Year in Review"
        subtitle="Your annual financial highlights and insights"
        action={
          <div className="flex items-center gap-3">
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
              availableModes={['yearly', 'fy']}
            />

            <div className="flex items-center gap-1 p-1 glass-thin rounded-xl" role="tablist">
              {(
                [
                  ['expense', 'Spending', TrendingDown],
                  ['income', 'Earning', TrendingUp],
                  ['net', 'Savings', DollarSign],
                ] as const
              ).map(([val, label, Icon]) => (
                <motion.button
                  key={val}
                  role="tab"
                  aria-selected={mode === val}
                  onClick={() => setMode(val)}
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    mode === val
                      ? 'text-white'
                      : 'text-muted-foreground hover:text-white hover:bg-white/10'
                  }`}
                  whileTap={{ scale: 0.97 }}
                >
                  {mode === val && (
                    <motion.div
                      layoutId="heatmapModeTab"
                      className="absolute inset-0 rounded-lg"
                      style={{ backgroundColor: modeAccent[val] }}
                      initial={false}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <Icon className="w-3.5 h-3.5 relative z-10" />
                  <span className="relative z-10">{label}</span>
                </motion.button>
              ))}
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
        <StatCard
          label="Total Spending"
          value={formatCurrencyCompact(stats.totalExpense)}
          icon={TrendingDown}
          color={rawColors.app.red}
        />
        <StatCard
          label="Total Earning"
          value={formatCurrencyCompact(stats.totalIncome)}
          icon={TrendingUp}
          color={rawColors.app.green}
        />
        <StatCard
          label="Savings Rate"
          value={`${stats.savingsRate.toFixed(1)}%`}
          icon={stats.savingsRate >= 0 ? ArrowUpRight : ArrowDownRight}
          color={stats.savingsRate >= 20 ? rawColors.app.green : rawColors.app.orange}
        />
        <StatCard
          label="Daily Average"
          value={formatCurrencyCompact(stats.dailyAvg)}
          icon={BarChart3}
          color={rawColors.app.blue}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl border border-border p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Flame className="w-5 h-5" style={{ color: modeAccent[mode] }} />
            {{ expense: 'Spending', income: 'Earning', net: 'Savings' }[mode]} Heatmap —{' '}
            {isFYMode ? currentFY : selectedYear}
          </h2>
          <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
            <span>Less</span>
            {heatmapColors[mode].map((color) => (
              <div
                key={color}
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: color }}
              />
            ))}
            <span>More</span>
          </div>
        </div>

        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <div className="min-w-[820px]">
              <div className="flex ml-10 mb-1">
                {monthLabels.map((ml) => (
                  <div
                    key={`${ml.month}-${ml.weekIndex}`}
                    className="text-xs text-text-tertiary"
                    style={{
                      position: 'relative',
                      left: `${ml.weekIndex * 15}px`,
                      width: 0,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {ml.month}
                  </div>
                ))}
              </div>

              <div className="flex gap-0.5">
                <div className="flex flex-col gap-0.5 mr-1.5 pt-0">
                  {DAYS.map((d, i) => (
                    <div
                      key={d}
                      className="h-[13px] flex items-center text-caption text-text-tertiary leading-none"
                    >
                      {i % 2 === 1 ? d : ''}
                    </div>
                  ))}
                </div>

                <section
                  className="flex gap-0.5"
                  aria-label="Spending heatmap grid"
                  onMouseOver={(e) => {
                    const target = (e.target as HTMLElement).closest<HTMLElement>(
                      '[data-cell-date]',
                    )
                    if (target) {
                      const date = target.dataset.cellDate
                      const found: DayCell | undefined = grid.find((c) => c.date === date)
                      setHoveredDay(found ?? null)
                    }
                  }}
                  onFocus={(e) => {
                    const target = (e.target as HTMLElement).closest<HTMLElement>(
                      '[data-cell-date]',
                    )
                    if (target) {
                      const date = target.dataset.cellDate
                      const found: DayCell | undefined = grid.find((c) => c.date === date)
                      setHoveredDay(found ?? null)
                    }
                  }}
                  onMouseLeave={() => setHoveredDay(null)}
                  onBlur={() => setHoveredDay(null)}
                >
                  <HeatmapWeeks grid={grid} mode={mode} modeMax={modeMax} />
                </section>
              </div>
            </div>
          </div>
        </div>

        <MobileMonthlySummary
          mode={mode}
          monthlyExpense={stats.monthlyExpense}
          monthlyIncome={stats.monthlyIncome}
        />

        <div className="mt-4 pt-3 border-t border-border flex items-center gap-6 text-xs min-h-[28px]">
          <HeatmapDayDetail hoveredDay={hoveredDay} />
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 glass rounded-2xl border border-border p-6"
        >
          <h2 className="text-lg font-semibold mb-4">Monthly Breakdown</h2>
          <div className="h-64">
            {monthlyBarData.every((d) => d.Spending === 0 && d.Earning === 0) ? (
              <ChartEmptyState height={256} />
            ) : (
              <ChartContainer>
                <BarChart data={monthlyBarData} barGap={4}>
                  <CartesianGrid {...GRID_DEFAULTS} />
                  <XAxis {...xAxisDefaults(monthlyBarData.length)} dataKey="name" />
                  <YAxis {...yAxisDefaults()} />
                  <RechartsTooltip
                    {...chartTooltipProps}
                    formatter={(value: number | undefined) =>
                      value === undefined ? '' : formatCurrency(value)
                    }
                  />
                  <Bar
                    dataKey="Spending"
                    fill={rawColors.app.red}
                    radius={BAR_RADIUS}
                    opacity={0.8}
                    isAnimationActive={shouldAnimate(monthlyBarData.length)}
                    animationDuration={600}
                    animationEasing="ease-out"
                  >
                    {dims.showBarLabels && (
                      <LabelList
                        dataKey="Spending"
                        position="top"
                        fill="#f5f5f7"
                        fontSize={10}
                        formatter={(v: unknown) =>
                          !v || v === 0 ? '' : formatCurrencyShort(v as number)
                        }
                      />
                    )}
                  </Bar>
                  <Bar
                    dataKey="Earning"
                    fill={rawColors.app.green}
                    radius={BAR_RADIUS}
                    opacity={0.8}
                    isAnimationActive={shouldAnimate(monthlyBarData.length)}
                    animationDuration={600}
                    animationEasing="ease-out"
                  >
                    {dims.showBarLabels && (
                      <LabelList
                        dataKey="Earning"
                        position="top"
                        fill="#f5f5f7"
                        fontSize={10}
                        formatter={(v: unknown) =>
                          !v || v === 0 ? '' : formatCurrencyShort(v as number)
                        }
                      />
                    )}
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass rounded-2xl border border-border p-6 space-y-4"
        >
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Flame className="w-5 h-5" style={{ color: rawColors.app.orange }} />
            Quick Insights
          </h2>

          <InsightRow
            icon={Sun}
            label="Best Month (lowest spend)"
            value={stats.bestMonth}
            color={rawColors.app.green}
          />
          <InsightRow
            icon={Moon}
            label="Worst Month (highest spend)"
            value={stats.worstMonth}
            color={rawColors.app.red}
          />
          <InsightRow
            icon={Flame}
            label="Longest no-spend streak"
            value={`${stats.maxStreak} days`}
            color={rawColors.app.orange}
          />
          <InsightRow
            icon={TrendingDown}
            label="Biggest spending day"
            value={
              stats.biggestExpenseDay.date
                ? `${formatCurrencyCompact(stats.biggestExpenseDay.amount)}`
                : 'N/A'
            }
            subtitle={
              stats.biggestExpenseDay.date
                ? new Date(stats.biggestExpenseDay.date + 'T00:00:00').toLocaleDateString(
                    'en-IN',
                    { month: 'short', day: 'numeric' },
                  )
                : undefined
            }
            color={rawColors.app.red}
          />
          <InsightRow
            icon={TrendingUp}
            label="Biggest earning day"
            value={
              stats.biggestIncomeDay.date
                ? `${formatCurrencyCompact(stats.biggestIncomeDay.amount)}`
                : 'N/A'
            }
            subtitle={
              stats.biggestIncomeDay.date
                ? new Date(stats.biggestIncomeDay.date + 'T00:00:00').toLocaleDateString(
                    'en-IN',
                    { month: 'short', day: 'numeric' },
                  )
                : undefined
            }
            color={rawColors.app.green}
          />
          <InsightRow
            icon={BarChart3}
            label="Days with expenses"
            value={`${stats.daysWithExpense} of ${grid.length}`}
            color={rawColors.app.blue}
          />

          {stats.maxStreak > 0 && (
            <div className="pt-3 mt-3 border-t border-border">
              <p className="text-xs text-text-tertiary mb-2">No-Spend Streak Record</p>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: Math.min(stats.maxStreak, 30) }, (_, i) => (
                    <div
                      key={`streak-${i}`}
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: getStreakDotColor(i),
                        opacity: 0.5 + (i / Math.min(stats.maxStreak, 30)) * 0.5,
                      }}
                    />
                  ))}
                </div>
                <span
                  className="text-sm font-bold"
                  style={{ color: getStreakColor(stats.maxStreak) }}
                >
                  {stats.maxStreak} days
                </span>
              </div>
            </div>
          )}

          <div className="pt-3 mt-3 border-t border-border">
            <p className="text-xs text-text-tertiary mb-1">Total Savings</p>
            <p
              className={`text-xl font-bold ${stats.totalSavings >= 0 ? 'text-app-green' : 'text-app-red'}`}
            >
              {stats.totalSavings >= 0 ? '+' : ''}
              {formatCurrencyCompact(stats.totalSavings)}
            </p>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-2xl border border-border p-6"
      >
        <h2 className="text-lg font-semibold mb-4">Spending by Day of Week</h2>
        <DayOfWeekChart grid={grid} />
      </motion.div>
    </div>
  )
}
